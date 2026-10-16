import * as tus from 'tus-js-client'

import { cloudClient } from '../../cloud/cloudClient'
import type {
  AiContentResult,
  BrandProfile,
  ContentBootstrap,
  ContentItemSummary,
  ContentProvider,
  PlatformPostDraft,
  VideoMetadata,
} from '../types'

const API_TIMEOUT_MS = 60_000

function apiUrl(path = '/api/content-autopilot'): string {
  const configuredOrigin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim()
  return `${configuredOrigin?.replace(/\/$/, '') ?? ''}${path}`
}

function organizationId(): string {
  return localStorage.getItem('owner-hub-active-organization') ?? ''
}

async function accessToken(): Promise<string> {
  if (!cloudClient) throw new Error('Cloud authentication is required for Content Autopilot.')
  const { data, error } = await cloudClient.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Your secure session expired. Sign in and retry.')
  return data.session.access_token
}

async function contentRequest<T>(action: string, payload: Record<string, unknown> = {}, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const token = await accessToken()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const query = method === 'GET' ? `?action=${encodeURIComponent(action)}` : ''
    const response = await fetch(`${apiUrl()}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Owner-Hub-Organization': organizationId(),
      },
      body: method === 'POST' ? JSON.stringify({ action, ...payload }) : undefined,
      signal: controller.signal,
    })
    const value: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
        ? (value as { error: string }).error
        : 'Content Autopilot could not complete that request.'
      throw new Error(message)
    }
    return value as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Content Autopilot took too long to respond. Your uploaded video remains safe.', { cause: error })
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export function loadContentBootstrap() {
  return contentRequest<ContentBootstrap>('bootstrap', {}, 'GET')
}

export function prepareVideoUpload(file: File) {
  return contentRequest<{ contentItemId: string; storageKey: string }>('prepare-upload', {
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  })
}

export async function uploadVideoResumable(file: File, storageKey: string, onProgress: (percentage: number) => void) {
  const token = await accessToken()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '')
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl || !publishableKey) throw new Error('Private video storage is not configured.')

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publishableKey,
        'x-upsert': 'false',
      },
      uploadSize: file.size,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: import.meta.env.VITE_CONTENT_VIDEO_BUCKET?.trim() || 'content-videos',
        objectName: storageKey,
        contentType: file.type,
        cacheControl: '3600',
      },
      removeFingerprintOnSuccess: true,
      onError: (error) => reject(new Error(`The private video upload stopped: ${error.message}`)),
      onProgress: (uploaded, total) => onProgress(total > 0 ? Math.round(uploaded / total * 100) : 0),
      onSuccess: () => resolve(),
    })
    upload.start()
  })
}

export function finalizeVideoUpload(input: {
  contentItemId: string
  metadata: VideoMetadata
  masterCaption: string
  contentType: string
  linkedJobId: string
  jobContext: Record<string, unknown>
  platformPosts: PlatformPostDraft[]
}) {
  return contentRequest<{ item: ContentItemSummary }>('finalize-upload', input)
}

export function updateContentDraft(input: {
  contentItemId: string
  masterCaption: string
  contentType: string
  linkedJobId: string
  jobContext: Record<string, unknown>
  platformPosts: PlatformPostDraft[]
}) {
  return contentRequest<{ item: ContentItemSummary }>('update-draft', input)
}

export function discardContentDraft(contentItemId: string) {
  return contentRequest<{ message: string }>('discard-draft', { contentItemId })
}

export function generateContentWithAi(input: {
  contentItemId: string
  masterCaption: string
  contentType: string
  jobContext: Record<string, unknown>
  frameDataUrls: string[]
}) {
  return contentRequest<AiContentResult>('generate-ai', input)
}

export function publishContent(input: {
  contentItemId: string
  platformPosts: PlatformPostDraft[]
  scheduledAt: string | null
  privacyAcknowledged: boolean
}) {
  return contentRequest<{ item: ContentItemSummary; jobsCreated: number }>('publish', input)
}

export function retryPlatformPost(platformPostId: string) {
  return contentRequest<{ message: string }>('retry', { platformPostId })
}

export function cancelPlatformPost(platformPostId: string) {
  return contentRequest<{ message: string }>('cancel', { platformPostId })
}

export function removePlatformPost(platformPostId: string) {
  return contentRequest<{ message: string }>('unpublish-platform', { platformPostId })
}

export function loadContentDetail(contentItemId: string) {
  return contentRequest<{ item: ContentItemSummary; auditLog: Array<Record<string, unknown>> }>('detail', { contentItemId })
}

export function getPlaybackUrl(contentItemId: string) {
  return contentRequest<{ url: string }>('playback-url', { contentItemId })
}

export function startProviderConnection(provider: ContentProvider) {
  return contentRequest<{ authorizationUrl: string }>('oauth-start', { provider })
}

export function listProviderAccounts(provider: ContentProvider) {
  return contentRequest<{ accounts: Array<{ id: string; parentId?: string; name: string }> }>('list-provider-accounts', { provider })
}

export function selectProviderAccount(provider: ContentProvider, accountId: string, parentId = '') {
  return contentRequest<{ message: string }>('select-provider-account', { provider, accountId, parentId })
}

export function testProviderConnection(provider: ContentProvider) {
  return contentRequest<{ checks: string[]; warning?: string }>('test-connection', { provider })
}

export function disconnectProvider(provider: ContentProvider) {
  return contentRequest<{ message: string }>('disconnect', { provider })
}

export function saveBrandProfile(profile: BrandProfile) {
  return contentRequest<{ profile: BrandProfile }>('save-brand-profile', { profile })
}

export function saveAiFeedback(input: {
  generationId: string
  platform: ContentProvider
  rating: -1 | 1
  reason: string
  originalOutput: unknown
  finalOutput: unknown
}) {
  return contentRequest<{ message: string }>('ai-feedback', input)
}
