import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { createClient } from '@supabase/supabase-js'

import { applyCors, requestedOrganizationId } from './_http-security.js'

export type ApiRequest = IncomingMessage & { body?: unknown }
export type ApiResponse = ServerResponse<IncomingMessage>
export type Json = Record<string, unknown>
export type ContentProvider = 'facebook' | 'google_business' | 'youtube'
export type Workspace = { organizationId: string; userId: string; role: 'owner' | 'admin' | 'member' }

export const CONTENT_PROVIDERS: ContentProvider[] = ['facebook', 'google_business', 'youtube']
export const CONTENT_VIDEO_BUCKET = process.env.CONTENT_VIDEO_BUCKET?.trim() || 'content-videos'
export const GOOGLE_BUSINESS_API_VERSION = 'v4'
export const YOUTUBE_API_VERSION = 'v3'
export const MAX_CONTENT_REQUEST_BYTES = 3_500_000

const providerCapabilities: Record<ContentProvider, Json> = {
  facebook: {
    videoUpload: true, reels: true, localPosts: false, locationVideo: false,
    localPostVideoAttachment: false, scheduling: true,
    analytics: ['views', 'reach', 'reactions', 'comments', 'shares'], deletePost: true,
    warnings: ['Reels and Page video availability depend on Page permissions and Meta app review.'],
  },
  google_business: {
    videoUpload: true, reels: false, localPosts: true, locationVideo: true,
    // The Local Post reference only promises a sourceUrl MediaItem; the
    // location media API explicitly models VIDEO, so video is published there.
    localPostVideoAttachment: false, scheduling: true,
    analytics: ['local_post_insights', 'location_media_views'], deletePost: true,
    warnings: ['The Local Post and location video are separate official Google resources.'],
  },
  youtube: {
    videoUpload: true, reels: false, localPosts: false, locationVideo: false,
    localPostVideoAttachment: false, scheduling: true,
    analytics: ['views', 'likes', 'comments'], deletePost: true,
    warnings: ['Unverified API projects are restricted to private uploads until Google completes an audit.'],
  },
}

export function capabilitiesFor(provider: ContentProvider): Json {
  return providerCapabilities[provider]
}

export function contentFeatureEnabled(): boolean {
  return process.env.CONTENT_AUTOPILOT_ENABLED?.trim().toLowerCase() !== 'false'
}

export function oauthStateHash(rawState: string): string {
  return createHash('sha256').update(rawState).digest('hex')
}

export function aiContentEnabled(): boolean {
  return process.env.AI_CONTENT_GENERATION_ENABLED?.trim().toLowerCase() !== 'false'
}

export function providerPublishingEnabled(provider: ContentProvider): boolean {
  const variable = provider === 'facebook'
    ? 'FACEBOOK_PUBLISHING_ENABLED'
    : provider === 'google_business'
      ? 'GBP_PUBLISHING_ENABLED'
      : 'YOUTUBE_PUBLISHING_ENABLED'
  return process.env[variable]?.trim().toLowerCase() === 'true'
}

export function providerMockMode(): boolean {
  return process.env.CONTENT_PROVIDER_MOCK_MODE?.trim().toLowerCase() !== 'false' && process.env.VERCEL_ENV !== 'production'
}

export function metaGraphVersion(): string {
  const version = process.env.META_GRAPH_API_VERSION?.trim()
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error('meta_version_not_configured')
  return version
}

export function setContentCors(request: ApiRequest, response: ApiResponse, methods = 'GET, POST, OPTIONS'): boolean {
  return applyCors(request, response, methods)
}

export function sendJson(response: ApiResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

export async function readJsonBody(request: ApiRequest): Promise<Json> {
  if (request.body !== undefined) {
    const value = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request')
    return value as Json
  }
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_CONTENT_REQUEST_BYTES) throw new Error('request_too_large')
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request')
  return value as Json
}

function supabaseSettings() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !serviceKey) throw new Error('supabase_service_not_configured')
  return { url: url.replace(/\/$/, ''), serviceKey, publicKey: publicKey ?? serviceKey }
}

export async function database(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, serviceKey } = supabaseSettings()
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  })
}

export async function databaseJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const result = await database(path, init)
  const value = await result.json().catch(() => null) as T
  if (!result.ok) {
    console.error('Content Autopilot database operation failed.', { status: result.status, path: path.split('?')[0] })
    throw new Error('database_operation_failed')
  }
  return value
}

async function verifyUser(accessToken: string): Promise<{ id: string } | null> {
  const { url, publicKey } = supabaseSettings()
  const result = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return null
  const value = await result.json() as { id?: unknown }
  return typeof value.id === 'string' ? { id: value.id } : null
}

export async function authenticatedWorkspace(request: ApiRequest): Promise<Workspace | null> {
  const authorization = request.headers.authorization
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!accessToken) return null
  const user = await verifyUser(accessToken)
  if (!user) return null
  const requested = requestedOrganizationId(request)
  const filter = requested ? `&organization_id=eq.${encodeURIComponent(requested)}` : ''
  const rows = await databaseJson<Array<{ organization_id: string; role: Workspace['role'] }>>(
    `/rest/v1/organization_members?user_id=eq.${encodeURIComponent(user.id)}${filter}&select=organization_id,role&limit=1`,
  )
  const membership = rows[0]
  return membership ? { organizationId: membership.organization_id, userId: user.id, role: membership.role } : null
}

export async function requireActiveSubscription(organizationId: string): Promise<void> {
  const rows = await databaseJson<Array<{ status: string; trial_ends_at: string | null }>>(
    `/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}&select=status,trial_ends_at&limit=1`,
  )
  const subscription = rows[0]
  const activeTrial = subscription?.status === 'trialing' && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at).getTime() > Date.now())
  if (!subscription || (subscription.status !== 'active' && !activeTrial)) throw new Error('subscription_inactive')
}

function encryptionKey(): Buffer {
  const configured = process.env.CONTENT_TOKEN_ENCRYPTION_KEY?.trim()
  if (!configured || configured.length < 32) throw new Error('content_encryption_not_configured')
  return createHash('sha256').update(configured).digest()
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('invalid_encrypted_secret')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8')
}

export async function findConnection(organizationId: string, provider: ContentProvider) {
  const rows = await databaseJson<Array<Json>>(
    `/rest/v1/content_social_connections?organization_id=eq.${organizationId}&provider=eq.${provider}&select=*&limit=1`,
  )
  return rows[0] ?? null
}

export async function upsertConnection(organizationId: string, provider: ContentProvider, values: Json = {}) {
  const rows = await databaseJson<Array<Json>>('/rest/v1/content_social_connections?on_conflict=organization_id,provider', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      organization_id: organizationId,
      provider,
      capabilities: capabilitiesFor(provider),
      updated_at: new Date().toISOString(),
      ...values,
    }),
  })
  if (!rows[0]) throw new Error('connection_not_saved')
  return rows[0]
}

export async function saveConnectionSecrets(connectionId: string, input: { accessToken: string; refreshToken?: string; tokenType?: string }) {
  await database('/rest/v1/content_social_secrets?on_conflict=connection_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      connection_id: connectionId,
      access_token_ciphertext: encryptSecret(input.accessToken),
      refresh_token_ciphertext: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      token_type: input.tokenType ?? 'Bearer',
      updated_at: new Date().toISOString(),
    }),
  }).then((result) => {
    if (!result.ok) throw new Error('connection_secret_not_saved')
  })
}

export async function loadConnectionSecrets(connectionId: string) {
  const rows = await databaseJson<Array<{ access_token_ciphertext: string; refresh_token_ciphertext: string | null; token_type: string | null }>>(
    `/rest/v1/content_social_secrets?connection_id=eq.${connectionId}&select=access_token_ciphertext,refresh_token_ciphertext,token_type&limit=1`,
  )
  const row = rows[0]
  if (!row) throw new Error('connection_secret_missing')
  return {
    accessToken: decryptSecret(row.access_token_ciphertext),
    refreshToken: row.refresh_token_ciphertext ? decryptSecret(row.refresh_token_ciphertext) : '',
    tokenType: row.token_type ?? 'Bearer',
  }
}

export async function signedVideoUrl(storageKey: string, expiresIn = 21_600): Promise<string> {
  const { url, serviceKey } = supabaseSettings()
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.storage.from(CONTENT_VIDEO_BUCKET).createSignedUrl(storageKey, expiresIn)
  if (error || !data.signedUrl) throw new Error('video_url_not_created')
  return data.signedUrl
}

export async function removeVideo(storageKey: string): Promise<void> {
  const { url, serviceKey } = supabaseSettings()
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await client.storage.from(CONTENT_VIDEO_BUCKET).remove([storageKey])
  if (error) throw new Error('video_not_removed')
}

export async function verifyStoredVideo(storageKey: string): Promise<void> {
  const parts = storageKey.split('/')
  const fileName = parts.pop()
  const folder = parts.join('/')
  if (!fileName) throw new Error('video_not_found')
  const { url, serviceKey } = supabaseSettings()
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.storage.from(CONTENT_VIDEO_BUCKET).list(folder, { search: fileName, limit: 10 })
  if (error || !data.some((item) => item.name === fileName)) throw new Error('video_not_found')
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function textArray(value: unknown, maximumItems: number, maximumLength = 100): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.flatMap((item) => {
    const clean = cleanText(item, maximumLength)
    return clean ? [clean] : []
  }))).slice(0, maximumItems)
}

export function isProvider(value: unknown): value is ContentProvider {
  return typeof value === 'string' && CONTENT_PROVIDERS.includes(value as ContentProvider)
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function auditContent(input: {
  organizationId: string
  userId?: string | null
  contentItemId?: string | null
  platformPostId?: string | null
  action: string
  metadata?: Json
}) {
  const result = await database('/rest/v1/content_audit_logs', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      organization_id: input.organizationId,
      actor_user_id: input.userId ?? null,
      content_item_id: input.contentItemId ?? null,
      platform_post_id: input.platformPostId ?? null,
      action: input.action,
      metadata: input.metadata ?? {},
    }),
  })
  if (!result.ok) console.error('Content audit event could not be recorded.', { action: input.action, status: result.status })
}

export function providerSafeError(error: unknown): { code: string; message: string; transient: boolean } {
  const raw = error instanceof Error ? error.message : 'provider_error'
  if (/token|credential|unauthorized|invalid_grant|401/i.test(raw)) {
    return { code: 'authorization_expired', message: 'Authorization expired. Reconnect this account and retry.', transient: false }
  }
  if (/permission|scope|403/i.test(raw)) {
    return { code: 'permission_required', message: 'The connected account is missing a publishing permission.', transient: false }
  }
  if (/rate|429|temporar|timeout|network|fetch/i.test(raw)) {
    return { code: 'provider_temporarily_unavailable', message: 'The provider is temporarily unavailable. Owner Hub will retry automatically.', transient: true }
  }
  return { code: 'provider_rejected_post', message: 'The provider could not publish this post. Review the connection and post details.', transient: false }
}
