import { createHash, randomBytes, randomUUID } from 'node:crypto'

import {
  CONTENT_PROVIDERS,
  aiContentEnabled,
  auditContent,
  authenticatedWorkspace,
  capabilitiesFor,
  cleanText,
  contentFeatureEnabled,
  database,
  databaseJson,
  encryptSecret,
  findConnection,
  isProvider,
  isUuid,
  loadConnectionSecrets,
  metaGraphVersion,
  oauthStateHash,
  providerMockMode,
  providerPublishingEnabled,
  readJsonBody,
  removeVideo,
  requireActiveSubscription,
  saveConnectionSecrets,
  sendJson,
  setContentCors,
  signedVideoUrl,
  textArray,
  upsertConnection,
  verifyStoredVideo,
} from './_content-autopilot-server.js'
import type { ApiRequest, ApiResponse, ContentProvider, Json, Workspace } from './_content-autopilot-server.js'
import { generateContentAi } from './_content-ai.js'
import { freshGoogleAccessToken, publisherFor } from './_content-publishers/index.js'
import { aggregateContentStatus, contentIdempotencyKey, normalizeScheduledAt } from './_content-publish-logic.js'

const allowedVideoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/avi', 'video/x-msvideo'])
const contentTypes = new Set(['before_after', 'repair', 'installation', 'transformation', 'maintenance', 'tip', 'educational', 'customer_result', 'promotion', 'business_update', 'other'])

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numeric(value: unknown, minimum: number, maximum: number): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null
}

function sanitizeFilename(value: unknown): string {
  const clean = cleanText(value, 160).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  return clean || 'content-video.mp4'
}

function safeJobContext(value: unknown): Json {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
  return {
    jobName: cleanText(input.jobName, 160),
    workDescription: cleanText(input.workDescription, 1_500),
    confirmedScope: cleanText(input.confirmedScope, 2_500),
    confirmedMaterials: textArray(input.confirmedMaterials, 30, 120),
    serviceAreaCity: cleanText(input.serviceAreaCity, 100),
    completionStatus: ['completed', 'invoiced'].includes(String(input.completionStatus)) ? input.completionStatus : '',
  }
}

function platformPosts(value: unknown) {
  if (!Array.isArray(value)) return []
  const providers = new Set<ContentProvider>()
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const input = raw as Json
    if (!isProvider(input.provider) || providers.has(input.provider)) return []
    providers.add(input.provider)
    const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata as Json : {}
    return [{
      provider: input.provider,
      enabled: bool(input.enabled, true),
      title: cleanText(input.title, 100),
      caption: cleanText(input.caption, input.provider === 'google_business' ? 1_500 : 6_000),
      description: cleanText(input.description, 5_000),
      hashtags: textArray(input.hashtags, 10, 80).map((tag) => tag.replace(/^#/, '')),
      tags: textArray(input.tags, 30, 100),
      call_to_action: cleanText(input.callToAction, 100),
      call_to_action_url: cleanText(input.callToActionUrl, 500),
      scheduled_at: typeof input.scheduledAt === 'string' && Number.isFinite(new Date(input.scheduledAt).getTime()) ? new Date(input.scheduledAt).toISOString() : null,
      provider_metadata: {
        publishAsReel: input.provider === 'facebook' && metadata.publishAsReel === true,
        googleTopicType: input.provider === 'google_business' && ['STANDARD', 'EVENT', 'OFFER'].includes(String(metadata.googleTopicType)) ? metadata.googleTopicType : 'STANDARD',
        youtubeCategoryId: input.provider === 'youtube' ? cleanText(metadata.youtubeCategoryId, 10) || '26' : undefined,
        youtubeVisibility: input.provider === 'youtube' && ['private', 'unlisted', 'public'].includes(String(metadata.youtubeVisibility)) ? metadata.youtubeVisibility : 'private',
        madeForKids: input.provider === 'youtube' && metadata.madeForKids === true,
        containsSyntheticMedia: input.provider === 'youtube' && metadata.containsSyntheticMedia === true,
      },
    }]
  })
}

function mapPost(row: Json) {
  const metadata = row.provider_metadata && typeof row.provider_metadata === 'object' ? row.provider_metadata as Json : {}
  return {
    id: String(row.id ?? ''), provider: row.provider, enabled: row.enabled !== false,
    title: String(row.title ?? ''), caption: String(row.caption ?? ''), description: String(row.description ?? ''),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [], tags: Array.isArray(row.tags) ? row.tags : [],
    callToAction: String(row.call_to_action ?? ''), callToActionUrl: String(row.call_to_action_url ?? ''),
    scheduledAt: typeof row.scheduled_at === 'string' ? row.scheduled_at : null,
    status: row.status, providerUrl: String(row.provider_url ?? ''), lastErrorMessage: String(row.last_error_message ?? ''),
    metadata,
  }
}

async function loadItems(organizationId: string, contentItemId?: string) {
  const itemFilter = contentItemId ? `&id=eq.${encodeURIComponent(contentItemId)}` : ''
  const items = await databaseJson<Json[]>(
    `/rest/v1/content_items?organization_id=eq.${organizationId}${itemFilter}&select=*&order=created_at.desc&limit=${contentItemId ? 1 : 100}`,
  )
  if (!items.length) return []
  const ids = items.map((item) => String(item.id))
  const posts = await databaseJson<Json[]>(
    `/rest/v1/content_platform_posts?organization_id=eq.${organizationId}&content_item_id=in.(${ids.join(',')})&select=*&order=created_at.asc`,
  )
  const postsByItem = new Map<string, Json[]>()
  for (const post of posts) {
    const itemId = String(post.content_item_id)
    postsByItem.set(itemId, [...(postsByItem.get(itemId) ?? []), post])
  }
  return items.map((item) => {
    const jobContext = item.job_context && typeof item.job_context === 'object' ? item.job_context as Json : {}
    return {
      id: String(item.id), originalFilename: String(item.original_filename ?? ''), videoStorageKey: String(item.video_storage_key ?? ''),
      masterCaption: String(item.master_caption ?? ''), contentType: item.content_type, creationMode: item.creation_mode,
      status: item.status, uploadStatus: item.upload_status, linkedJobId: String(item.linked_job_id ?? ''),
      jobName: String(jobContext.jobName ?? ''), durationSeconds: typeof item.duration_seconds === 'number' ? item.duration_seconds : Number(item.duration_seconds) || null,
      aspectRatio: String(item.aspect_ratio ?? ''), fileSize: Number(item.file_size ?? 0),
      privacyWarnings: Array.isArray(item.privacy_warnings) ? item.privacy_warnings : [], createdAt: item.created_at, updatedAt: item.updated_at,
      platformPosts: (postsByItem.get(String(item.id)) ?? []).map(mapPost),
    }
  })
}

async function defaultBrandProfile(workspace: Workspace) {
  const existing = await databaseJson<Json[]>(`/rest/v1/content_brand_profiles?organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  if (existing[0]) return existing[0]
  const rows = await databaseJson<Json[]>('/rest/v1/content_brand_profiles', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: workspace.organizationId,
      business_name: "Rabbit's Foot Handyman Services LLC",
      writing_style: 'Professional, direct, local, and conversational.',
      emoji_preference: 'minimal',
      hashtag_preference: '2-4 relevant hashtags',
      default_cta: 'Call or message for an estimate.',
    }),
  })
  return rows[0]
}

function mapBrandProfile(row: Json) {
  const goals = row.content_goals && typeof row.content_goals === 'object' ? row.content_goals as Json : {}
  return {
    businessName: String(row.business_name ?? ''), businessDescription: String(row.business_description ?? ''),
    serviceArea: String(row.service_area ?? ''), website: String(row.website ?? ''), phone: String(row.phone ?? ''),
    defaultCta: String(row.default_cta ?? ''), primaryServices: Array.isArray(row.primary_services) ? row.primary_services : [],
    writingStyle: String(row.writing_style ?? ''), emojiPreference: String(row.emoji_preference ?? 'minimal'),
    hashtagPreference: String(row.hashtag_preference ?? '2-4 relevant hashtags'), phrasesToAvoid: Array.isArray(row.phrases_to_avoid) ? row.phrases_to_avoid : [],
    youtubeCategoryId: String(row.youtube_category_id ?? '26'), autonomyLevel: Number(row.autonomy_level ?? 0),
    timezone: String(row.timezone ?? 'America/New_York'),
    contentGoals: {
      facebook: Number(goals.facebook ?? 3), google_business: Number(goals.google_business ?? 2), youtube: Number(goals.youtube ?? 2),
    },
  }
}

async function bootstrap(workspace: Workspace) {
  const [connections, items, profile, preferences, metrics] = await Promise.all([
    databaseJson<Json[]>(`/rest/v1/content_social_connections?organization_id=eq.${workspace.organizationId}&select=*`),
    loadItems(workspace.organizationId),
    defaultBrandProfile(workspace),
    databaseJson<Json[]>(`/rest/v1/content_brand_preferences?organization_id=eq.${workspace.organizationId}&source=eq.learned&select=*&order=locked.desc,evidence_count.desc`),
    databaseJson<Json[]>(`/rest/v1/content_post_metrics?organization_id=eq.${workspace.organizationId}&select=metric,value,platform_post_id,captured_at&order=captured_at.desc&limit=500`),
  ])
  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]))
  const publishedPosts = items.flatMap((item) => item.platformPosts).filter((post) => post.status === 'published')
  const metricValue = (names: string[]) => metrics.filter((metric) => names.includes(String(metric.metric))).reduce((sum, metric) => sum + Number(metric.value ?? 0), 0)
  return {
    enabled: contentFeatureEnabled(), aiEnabled: aiContentEnabled(), mockMode: providerMockMode(),
    connections: CONTENT_PROVIDERS.map((provider) => {
      const connection = connectionByProvider.get(provider) as Json | undefined
      return {
        id: String(connection?.id ?? ''), provider, displayName: String(connection?.display_name ?? ''),
        externalAccountId: String(connection?.external_account_id ?? ''), externalResourceId: String(connection?.external_resource_id ?? ''),
        status: connection?.status ?? 'disconnected', tokenExpiresAt: connection?.token_expires_at ?? null,
        lastCheckedAt: connection?.last_checked_at ?? null, lastError: String(connection?.last_error ?? ''),
        capabilities: capabilitiesFor(provider),
      }
    }),
    items,
    brandProfile: mapBrandProfile(profile),
    learnedPreferences: preferences.map((preference) => ({
      id: preference.id, key: preference.preference_key, value: preference.preference_value,
      confidence: preference.confidence, evidenceCount: preference.evidence_count,
      accepted: preference.accepted, locked: preference.locked,
    })),
    analytics: {
      publishedPosts: publishedPosts.length || null,
      totalViews: metrics.length ? metricValue(['views', 'viewCount', 'reach']) : null,
      totalEngagement: metrics.length ? metricValue(['likes', 'reactions', 'comments', 'shares']) : null,
      bestPlatform: null,
      topJobType: null,
    },
  }
}

async function prepareUpload(workspace: Workspace, body: Json) {
  const mimeType = cleanText(body.mimeType, 100).toLowerCase()
  const fileSize = numeric(body.fileSize, 1, 2 * 1024 * 1024 * 1024)
  if (!allowedVideoTypes.has(mimeType) || !fileSize) throw new Error('invalid_video')
  const contentItemId = randomUUID()
  const fileName = sanitizeFilename(body.fileName)
  const storageKey = `${workspace.organizationId}/${contentItemId}/${fileName}`
  const result = await database('/rest/v1/content_items', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: contentItemId, organization_id: workspace.organizationId, created_by: workspace.userId,
      video_storage_key: storageKey, original_filename: fileName, mime_type: mimeType, file_size: fileSize,
    }),
  })
  if (!result.ok) throw new Error('content_item_not_created')
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId, action: 'content.upload_prepared' })
  return { contentItemId, storageKey }
}

async function saveDraft(workspace: Workspace, body: Json, finalize: boolean) {
  const contentItemId = cleanText(body.contentItemId, 80)
  if (!isUuid(contentItemId)) throw new Error('invalid_content_item')
  const items = await databaseJson<Json[]>(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  const item = items[0]
  if (!item) throw new Error('content_item_not_found')
  if (['publishing', 'published', 'canceled'].includes(String(item.status))) throw new Error('content_item_locked')
  if (finalize) await verifyStoredVideo(String(item.video_storage_key))
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata as Json : {}
  const posts = platformPosts(body.platformPosts)
  if (!posts.length) throw new Error('platform_posts_required')
  const contentType = contentTypes.has(String(body.contentType)) ? String(body.contentType) : 'other'
  const now = new Date().toISOString()
  const update = await database(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      master_caption: cleanText(body.masterCaption, 6_000), content_type: contentType,
      linked_job_id: cleanText(body.linkedJobId, 120) || null, job_context: safeJobContext(body.jobContext),
      ...(finalize ? {
        upload_status: 'uploaded', duration_seconds: numeric(metadata.durationSeconds, 0, 86_400),
        width: numeric(metadata.width, 1, 32_768), height: numeric(metadata.height, 1, 32_768),
        aspect_ratio: cleanText(metadata.aspectRatio, 30),
      } : {}),
      updated_at: now,
    }),
  })
  if (!update.ok) throw new Error('content_item_not_saved')
  const postResult = await database('/rest/v1/content_platform_posts?on_conflict=content_item_id,provider', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(posts.map((post) => ({
      organization_id: workspace.organizationId, content_item_id: contentItemId, ...post, updated_at: now,
    }))),
  })
  if (!postResult.ok) throw new Error('platform_posts_not_saved')
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId, action: finalize ? 'content.upload_completed' : 'content.draft_updated' })
  return { item: (await loadItems(workspace.organizationId, contentItemId))[0] }
}

async function publish(workspace: Workspace, body: Json) {
  const contentItemId = cleanText(body.contentItemId, 80)
  await saveDraft(workspace, body, false)
  const items = await databaseJson<Json[]>(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  const item = items[0]
  if (!item || item.upload_status !== 'uploaded') throw new Error('video_upload_incomplete')
  if (Array.isArray(item.privacy_warnings) && item.privacy_warnings.length > 0 && body.privacyAcknowledged !== true) {
    throw new Error('privacy_review_required')
  }
  const selected = platformPosts(body.platformPosts).filter((post) => post.enabled)
  if (!selected.length) throw new Error('select_platform')
  const connections = await databaseJson<Json[]>(`/rest/v1/content_social_connections?organization_id=eq.${workspace.organizationId}&select=*`)
  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]))
  for (const post of selected) {
    if (!providerMockMode()) {
      const connection = connectionByProvider.get(post.provider) as Json | undefined
      if (!connection || connection.status !== 'connected') throw new Error(`${post.provider}_not_connected`)
      if (!providerPublishingEnabled(post.provider)) throw new Error(`${post.provider}_publishing_disabled`)
    }
  }
  const scheduledAt = normalizeScheduledAt(body.scheduledAt)
  const platformRows = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?content_item_id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}&enabled=eq.true&select=*`)
  const jobs = []
  for (const platformRow of platformRows.filter((row) => selected.some((post) => post.provider === row.provider))) {
    const platformPostId = String(platformRow.id)
    const idempotencyKey = contentIdempotencyKey(platformPostId)
    jobs.push({
      organization_id: workspace.organizationId, platform_post_id: platformPostId,
      status: scheduledAt ? 'scheduled' : 'queued', idempotency_key: idempotencyKey,
      scheduled_at: scheduledAt, next_attempt_at: scheduledAt ?? new Date().toISOString(),
    })
  }
  const jobResult = await database('/rest/v1/content_publish_jobs?on_conflict=idempotency_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(jobs),
  })
  if (!jobResult.ok) throw new Error('publish_jobs_not_created')
  await Promise.all([
    database(`/rest/v1/content_platform_posts?content_item_id=eq.${contentItemId}&enabled=eq.true`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: scheduledAt ? 'scheduled' : 'queued', scheduled_at: scheduledAt, updated_at: new Date().toISOString() }),
    }),
    database(`/rest/v1/content_items?id=eq.${contentItemId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: scheduledAt ? 'scheduled' : 'publishing', updated_at: new Date().toISOString() }),
    }),
  ])
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId, action: scheduledAt ? 'content.scheduled' : 'content.publish_requested', metadata: { providers: selected.map((post) => post.provider), scheduledAt } })
  if (body.privacyAcknowledged === true && Array.isArray(item.privacy_warnings) && item.privacy_warnings.length > 0) {
    await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId, action: 'content.privacy_warning_acknowledged', metadata: { warningCount: item.privacy_warnings.length } })
  }
  return { item: (await loadItems(workspace.organizationId, contentItemId))[0], jobsCreated: jobs.length }
}

async function oauthStart(request: ApiRequest, workspace: Workspace, body: Json) {
  if (workspace.role === 'member') throw new Error('manager_required')
  if (!isProvider(body.provider)) throw new Error('invalid_provider')
  const provider = body.provider
  const rawState = randomBytes(32).toString('base64url')
  const tokenHash = oauthStateHash(rawState)
  const redirectOrigin = cleanText(request.headers.origin, 500)
  let codeVerifier = ''
  let authorizationUrl: URL
  if (provider === 'facebook') {
    const appId = process.env.META_APP_ID?.trim()
    const redirectUri = process.env.META_REDIRECT_URI?.trim()
    if (!appId || !redirectUri) throw new Error('meta_oauth_not_configured')
    authorizationUrl = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`)
    authorizationUrl.searchParams.set('client_id', appId)
    authorizationUrl.searchParams.set('redirect_uri', redirectUri)
    authorizationUrl.searchParams.set('scope', 'pages_show_list,pages_read_engagement,pages_manage_posts')
    authorizationUrl.searchParams.set('state', rawState)
  } else {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim()
    if (!clientId || !redirectUri) throw new Error('google_oauth_not_configured')
    codeVerifier = randomBytes(48).toString('base64url')
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url')
    authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authorizationUrl.searchParams.set('client_id', clientId)
    authorizationUrl.searchParams.set('redirect_uri', redirectUri)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('access_type', 'offline')
    authorizationUrl.searchParams.set('include_granted_scopes', 'true')
    authorizationUrl.searchParams.set('prompt', 'consent')
    authorizationUrl.searchParams.set('state', rawState)
    authorizationUrl.searchParams.set('code_challenge', challenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    authorizationUrl.searchParams.set('scope', provider === 'google_business'
      ? 'https://www.googleapis.com/auth/business.manage'
      : 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl')
  }
  const stateResult = await database('/rest/v1/content_oauth_states', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      token_hash: tokenHash, organization_id: workspace.organizationId, user_id: workspace.userId,
      provider, redirect_origin: redirectOrigin, code_verifier_ciphertext: codeVerifier ? encryptSecret(codeVerifier) : null,
    }),
  })
  if (!stateResult.ok) throw new Error('oauth_state_not_saved')
  await upsertConnection(workspace.organizationId, provider, { status: 'pending', last_error: null })
  return { authorizationUrl: authorizationUrl.toString() }
}

async function providerAccess(workspace: Workspace, provider: ContentProvider) {
  const connection = await findConnection(workspace.organizationId, provider)
  if (!connection) throw new Error(`${provider}_not_connected`)
  const secrets = await loadConnectionSecrets(String(connection.id))
  const accessToken = provider === 'facebook'
    ? secrets.accessToken
    : await freshGoogleAccessToken({ connection, accessToken: secrets.accessToken, refreshToken: secrets.refreshToken })
  return { connection, secrets, accessToken }
}

async function listProviderAccounts(workspace: Workspace, body: Json) {
  if (workspace.role === 'member') throw new Error('manager_required')
  if (!isProvider(body.provider)) throw new Error('invalid_provider')
  const auth = await providerAccess(workspace, body.provider)
  const accounts = await publisherFor(body.provider).listAccounts(auth.accessToken)
  return { accounts: accounts.map((account) => ({ id: account.id, parentId: account.parentId, name: account.name })) }
}

async function selectProviderAccount(workspace: Workspace, body: Json) {
  if (workspace.role === 'member') throw new Error('manager_required')
  if (!isProvider(body.provider)) throw new Error('invalid_provider')
  const provider = body.provider
  const auth = await providerAccess(workspace, provider)
  const accounts = await publisherFor(provider).listAccounts(auth.accessToken)
  const selected = accounts.find((account) => account.id === cleanText(body.accountId, 300) && (provider !== 'google_business' || account.parentId === cleanText(body.parentId, 300)))
  if (!selected) throw new Error('provider_account_not_found')
  if (provider === 'facebook' && selected.accessToken) {
    await saveConnectionSecrets(String(auth.connection.id), { accessToken: selected.accessToken })
  }
  await upsertConnection(workspace.organizationId, provider, {
    external_account_id: provider === 'google_business' ? selected.parentId : selected.id,
    external_resource_id: selected.id,
    display_name: selected.name,
    status: 'connected', connected_at: new Date().toISOString(), last_error: null,
  })
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, action: 'content.connection_selected', metadata: { provider, displayName: selected.name } })
  return { message: `${selected.name} is connected.` }
}

async function testConnection(workspace: Workspace, body: Json) {
  if (!isProvider(body.provider)) throw new Error('invalid_provider')
  const provider = body.provider
  const auth = await providerAccess(workspace, provider)
  try {
    const result = await publisherFor(provider).testConnection(auth.connection, auth.accessToken)
    await upsertConnection(workspace.organizationId, provider, { status: 'connected', last_checked_at: new Date().toISOString(), last_error: null })
    return result
  } catch (error) {
    await upsertConnection(workspace.organizationId, provider, { status: 'error', last_checked_at: new Date().toISOString(), last_error: 'Connection test failed. Reconnect and retry.' })
    throw error
  }
}

async function disconnect(workspace: Workspace, body: Json) {
  if (workspace.role === 'member') throw new Error('manager_required')
  if (!isProvider(body.provider)) throw new Error('invalid_provider')
  const provider = body.provider
  const connection = await findConnection(workspace.organizationId, provider)
  if (connection) {
    try {
      const secrets = await loadConnectionSecrets(String(connection.id))
      if (provider === 'facebook') {
        await fetch(`https://graph.facebook.com/${metaGraphVersion()}/me/permissions?access_token=${encodeURIComponent(secrets.accessToken)}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) })
      } else {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: secrets.refreshToken || secrets.accessToken }), signal: AbortSignal.timeout(15_000),
        })
      }
    } catch {
      console.warn('Provider token revocation could not be confirmed; local credentials will still be deleted.', { provider })
    }
    await database(`/rest/v1/content_social_secrets?connection_id=eq.${connection.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    await upsertConnection(workspace.organizationId, provider, {
      status: 'disconnected', external_account_id: null, external_resource_id: null,
      display_name: null, token_expires_at: null, connected_at: null, last_error: null,
    })
  }
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, action: 'content.connection_disconnected', metadata: { provider } })
  return { message: 'The social account was disconnected and its local credentials were deleted.' }
}

async function saveBrandProfile(workspace: Workspace, body: Json) {
  const profile = body.profile && typeof body.profile === 'object' && !Array.isArray(body.profile) ? body.profile as Json : {}
  const goals = profile.contentGoals && typeof profile.contentGoals === 'object' ? profile.contentGoals as Json : {}
  const autonomyLevel = numeric(profile.autonomyLevel, 0, 4) ?? 0
  if (autonomyLevel === 4 && process.env.AUTOPILOT_LEVEL4_ENABLED?.trim().toLowerCase() !== 'true') throw new Error('autopilot_level4_disabled')
  const row = {
    organization_id: workspace.organizationId,
    business_name: cleanText(profile.businessName, 160), business_description: cleanText(profile.businessDescription, 2_000),
    service_area: cleanText(profile.serviceArea, 300), website: cleanText(profile.website, 500), phone: cleanText(profile.phone, 100),
    default_cta: cleanText(profile.defaultCta, 300), primary_services: textArray(profile.primaryServices, 40, 100),
    writing_style: cleanText(profile.writingStyle, 1_000), emoji_preference: cleanText(profile.emojiPreference, 100),
    hashtag_preference: cleanText(profile.hashtagPreference, 100), phrases_to_avoid: textArray(profile.phrasesToAvoid, 40, 100),
    youtube_category_id: cleanText(profile.youtubeCategoryId, 10) || '26', autonomy_level: autonomyLevel,
    timezone: cleanText(profile.timezone, 100) || 'America/New_York',
    content_goals: {
      facebook: numeric(goals.facebook, 0, 50) ?? 0, google_business: numeric(goals.google_business, 0, 50) ?? 0, youtube: numeric(goals.youtube, 0, 50) ?? 0,
    },
    updated_at: new Date().toISOString(),
  }
  const rows = await databaseJson<Json[]>('/rest/v1/content_brand_profiles?on_conflict=organization_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row),
  })
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, action: 'content.brand_profile_updated', metadata: { autonomyLevel } })
  return { profile: mapBrandProfile(rows[0] ?? row) }
}

async function discardDraft(workspace: Workspace, body: Json) {
  const contentItemId = cleanText(body.contentItemId, 80)
  const rows = await databaseJson<Json[]>(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  const item = rows[0]
  if (!item || !['draft', 'failed', 'needs_review'].includes(String(item.status))) throw new Error('draft_cannot_be_discarded')
  const published = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?content_item_id=eq.${contentItemId}&status=eq.published&select=id&limit=1`)
  if (published.length) throw new Error('published_content_cannot_be_discarded')
  await removeVideo(String(item.video_storage_key))
  const result = await database(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  if (!result.ok) throw new Error('draft_not_deleted')
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, action: 'content.draft_deleted', metadata: { contentItemId } })
  return { message: 'Draft and private video removed.' }
}

async function retryPost(workspace: Workspace, body: Json) {
  const platformPostId = cleanText(body.platformPostId, 80)
  const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?id=eq.${platformPostId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  const post = posts[0]
  if (!post || !['failed', 'needs_review'].includes(String(post.status))) throw new Error('post_not_retryable')
  const jobs = await databaseJson<Json[]>(`/rest/v1/content_publish_jobs?platform_post_id=eq.${platformPostId}&order=created_at.desc&select=*&limit=1`)
  const job = jobs[0]
  if (!job || Number(job.attempt_count) >= Number(job.max_attempts)) throw new Error('retry_limit_reached')
  const now = new Date().toISOString()
  await Promise.all([
    database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'retrying', next_attempt_at: now, leased_until: null, error_code: null, error_message: null, updated_at: now }) }),
    database(`/rest/v1/content_platform_posts?id=eq.${platformPostId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'retrying', last_error_code: null, last_error_message: null, updated_at: now }) }),
  ])
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId: String(post.content_item_id), platformPostId, action: 'content.platform_retry_requested' })
  return { message: `${String(post.provider)} retry queued without republishing successful platforms.` }
}

async function cancelPost(workspace: Workspace, body: Json) {
  const platformPostId = cleanText(body.platformPostId, 80)
  const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?id=eq.${platformPostId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`)
  const post = posts[0]
  if (!post || !['queued', 'scheduled', 'retrying'].includes(String(post.status))) throw new Error('post_not_cancelable')
  const now = new Date().toISOString()
  await Promise.all([
    database(`/rest/v1/content_publish_jobs?platform_post_id=eq.${platformPostId}&status=in.(queued,scheduled,retrying)`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', completed_at: now, leased_until: null, updated_at: now }) }),
    database(`/rest/v1/content_platform_posts?id=eq.${platformPostId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', updated_at: now }) }),
  ])
  await auditContent({ organizationId: workspace.organizationId, userId: workspace.userId, contentItemId: String(post.content_item_id), platformPostId, action: 'content.platform_canceled' })
  return { message: 'Scheduled platform post canceled. No external post was deleted.' }
}

async function unpublishPlatformPost(workspace: Workspace, body: Json) {
  if (workspace.role === 'member') throw new Error('manager_required')
  const platformPostId = cleanText(body.platformPostId, 80)
  if (!isUuid(platformPostId)) throw new Error('invalid_platform_post')
  const posts = await databaseJson<Json[]>(
    `/rest/v1/content_platform_posts?id=eq.${platformPostId}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`,
  )
  const post = posts[0]
  if (!post || !isProvider(post.provider) || post.status !== 'published' || !post.provider_post_id) {
    throw new Error('platform_post_not_removable')
  }
  const auth = await providerAccess(workspace, post.provider)
  const jobs = await databaseJson<Json[]>(
    `/rest/v1/content_publish_jobs?platform_post_id=eq.${platformPostId}&select=provider_state&order=created_at.desc&limit=1`,
  )
  await publisherFor(post.provider).deletePost(
    auth.connection,
    auth.accessToken,
    String(post.provider_post_id),
    jobs[0]?.provider_state && typeof jobs[0].provider_state === 'object' ? jobs[0].provider_state as Json : {},
  )
  const now = new Date().toISOString()
  const updated = await database(`/rest/v1/content_platform_posts?id=eq.${platformPostId}&organization_id=eq.${workspace.organizationId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'canceled', provider_url: null, updated_at: now }),
  })
  if (!updated.ok) throw new Error('platform_removal_not_saved')
  const siblingPosts = await databaseJson<Json[]>(
    `/rest/v1/content_platform_posts?content_item_id=eq.${post.content_item_id}&enabled=eq.true&select=status`,
  )
  await database(`/rest/v1/content_items?id=eq.${post.content_item_id}&organization_id=eq.${workspace.organizationId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: aggregateContentStatus(siblingPosts.map((item) => String(item.status))), updated_at: now }),
  })
  await auditContent({
    organizationId: workspace.organizationId,
    userId: workspace.userId,
    contentItemId: String(post.content_item_id),
    platformPostId,
    action: 'content.platform_post_removed',
    metadata: { provider: post.provider, providerPostId: post.provider_post_id },
  })
  return { message: `${providerDisplayName(post.provider)} post removed. The Owner Hub record and audit history were preserved.` }
}

function providerDisplayName(provider: ContentProvider): string {
  return provider === 'google_business' ? 'Google Business Profile' : provider === 'youtube' ? 'YouTube' : 'Facebook'
}

async function aiFeedback(workspace: Workspace, body: Json) {
  const generationId = cleanText(body.generationId, 80)
  const rating = body.rating === 1 ? 1 : body.rating === -1 ? -1 : null
  if (!isUuid(generationId) || !rating || !isProvider(body.platform)) throw new Error('invalid_feedback')
  const generations = await databaseJson<Json[]>(`/rest/v1/content_ai_generations?id=eq.${generationId}&organization_id=eq.${workspace.organizationId}&select=id&limit=1`)
  if (!generations.length) throw new Error('generation_not_found')
  const result = await database('/rest/v1/content_ai_feedback', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      organization_id: workspace.organizationId, ai_generation_id: generationId, platform: body.platform,
      original_output: body.originalOutput && typeof body.originalOutput === 'object' ? body.originalOutput : {},
      final_output: body.finalOutput && typeof body.finalOutput === 'object' ? body.finalOutput : null,
      rating, feedback_reason: cleanText(body.reason, 300),
    }),
  })
  if (!result.ok) throw new Error('feedback_not_saved')
  return { message: 'Your feedback was added to the Brand Brain evidence.' }
}

function publicError(error: unknown): { status: number; message: string } {
  const code = error instanceof Error ? error.message : 'unknown_error'
  const exact: Record<string, [number, string]> = {
    invalid_video: [400, 'Choose an MP4, MOV, WebM, M4V, or AVI video smaller than 2 GB.'],
    subscription_inactive: [402, 'Choose an active Owner Hub plan before using Content Autopilot.'],
    invalid_content_item: [400, 'This content draft is not valid.'], content_item_not_found: [404, 'This content draft was not found.'],
    content_item_locked: [409, 'Published or active content cannot be edited as a draft.'], video_not_found: [409, 'The private video upload has not finished yet.'],
    platform_posts_required: [400, 'Add at least one platform draft.'], select_platform: [400, 'Select at least one platform.'],
    video_upload_incomplete: [409, 'Wait for the private video upload to finish.'], privacy_review_required: [409, 'Review and clear the privacy warnings before publishing.'],
    manager_required: [403, 'Only an owner or administrator can manage social connections.'],
    meta_oauth_not_configured: [503, 'Meta connection setup is required. Add the server credentials from the setup guide.'],
    google_oauth_not_configured: [503, 'Google connection setup is required. Add the server credentials from the setup guide.'],
    meta_version_not_configured: [503, 'Set the current Meta Graph API version from the Meta app dashboard.'],
    content_encryption_not_configured: [503, 'Secure social-token encryption must be configured before connecting accounts.'],
    ai_content_disabled: [503, 'AI content generation is disabled for this rollout.'], openai_not_configured: [503, 'The server-side OpenAI key is not configured.'],
    representative_frames_required: [400, 'Keep the selected video on this device for the first AI analysis, then retry.'],
    privacy_review_required_manual: [409, 'This content needs an owner privacy review before publishing.'],
    autopilot_level4_disabled: [409, 'Level 4 Autopilot is feature-flagged off and cannot be enabled yet.'],
    post_not_retryable: [409, 'Only a failed platform can be retried.'], retry_limit_reached: [409, 'Automatic retry limit reached. Review the provider error before continuing.'],
    invalid_platform_post: [400, 'This platform post is not valid.'],
    platform_post_not_removable: [409, 'Only a confirmed published platform post can be removed.'],
  }
  if (exact[code]) return { status: exact[code][0], message: exact[code][1] }
  if (code.endsWith('_not_connected')) return { status: 409, message: 'Connect and select the requested social account before publishing.' }
  if (code.endsWith('_publishing_disabled')) return { status: 409, message: 'Live publishing for this provider is feature-flagged off until setup and review are complete.' }
  if (/authorization|token|invalid_grant/i.test(code)) return { status: 401, message: 'The social authorization expired. Reconnect the account and retry.' }
  if (/permission|scope|403/i.test(code)) return { status: 403, message: 'The provider is missing a required permission. Reconnect and review the requested scopes.' }
  console.error('Content Autopilot request failed.', { code })
  return { status: 500, message: 'Content Autopilot could not complete that request. Your existing records remain safe.' }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!setContentCors(request, response)) return sendJson(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end() }
  if (!['GET', 'POST'].includes(request.method ?? '')) return sendJson(response, 405, { error: 'Method not allowed.' })
  if (!contentFeatureEnabled()) return sendJson(response, 404, { error: 'Content Autopilot is not enabled.' })
  try {
    const workspace = await authenticatedWorkspace(request)
    if (!workspace) return sendJson(response, 401, { error: 'Your secure session expired. Sign in and retry.' })
    await requireActiveSubscription(workspace.organizationId)
    const body = request.method === 'POST' ? await readJsonBody(request) : {}
    const action = request.method === 'GET'
      ? new URL(request.url ?? '', 'http://owner-hub.local').searchParams.get('action') ?? ''
      : cleanText(body.action, 80)
    let result: unknown
    switch (action) {
      case 'bootstrap': result = await bootstrap(workspace); break
      case 'prepare-upload': result = await prepareUpload(workspace, body); break
      case 'finalize-upload': result = await saveDraft(workspace, body, true); break
      case 'update-draft': result = await saveDraft(workspace, body, false); break
      case 'discard-draft': result = await discardDraft(workspace, body); break
      case 'publish': result = await publish(workspace, body); break
      case 'generate-ai': result = await generateContentAi(workspace, body); break
      case 'oauth-start': result = await oauthStart(request, workspace, body); break
      case 'list-provider-accounts': result = await listProviderAccounts(workspace, body); break
      case 'select-provider-account': result = await selectProviderAccount(workspace, body); break
      case 'test-connection': result = await testConnection(workspace, body); break
      case 'disconnect': result = await disconnect(workspace, body); break
      case 'save-brand-profile': result = await saveBrandProfile(workspace, body); break
      case 'retry': result = await retryPost(workspace, body); break
      case 'cancel': result = await cancelPost(workspace, body); break
      case 'unpublish-platform': result = await unpublishPlatformPost(workspace, body); break
      case 'ai-feedback': result = await aiFeedback(workspace, body); break
      case 'detail': {
        const contentItemId = cleanText(body.contentItemId, 80)
        const items = await loadItems(workspace.organizationId, contentItemId)
        if (!items[0]) throw new Error('content_item_not_found')
        const auditLog = await databaseJson<Json[]>(`/rest/v1/content_audit_logs?organization_id=eq.${workspace.organizationId}&content_item_id=eq.${contentItemId}&select=action,metadata,created_at&order=created_at.desc&limit=100`)
        result = { item: items[0], auditLog }; break
      }
      case 'playback-url': {
        const contentItemId = cleanText(body.contentItemId, 80)
        const rows = await databaseJson<Json[]>(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}&select=video_storage_key&limit=1`)
        if (!rows[0]) throw new Error('content_item_not_found')
        result = { url: await signedVideoUrl(String(rows[0].video_storage_key), 3_600) }; break
      }
      default: return sendJson(response, 400, { error: 'Unknown Content Autopilot action.' })
    }
    return sendJson(response, 200, result)
  } catch (error) {
    const { status, message } = publicError(error)
    return sendJson(response, status, { error: message })
  }
}

export const config = { maxDuration: 60 }
