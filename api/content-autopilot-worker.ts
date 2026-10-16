import {
  auditContent,
  database,
  databaseJson,
  findConnection,
  isProvider,
  loadConnectionSecrets,
  providerMockMode,
  providerPublishingEnabled,
  providerSafeError,
  sendJson,
  signedVideoUrl,
} from './_content-autopilot-server.js'
import type { ApiRequest, ApiResponse, ContentProvider, Json } from './_content-autopilot-server.js'
import { freshGoogleAccessToken, publisherFor } from './_content-publishers/index.js'
import { aggregateContentStatus, retryDelaySeconds } from './_content-publish-logic.js'

function workerAuthorized(request: ApiRequest): boolean {
  const expected = [process.env.CONTENT_WORKER_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
  if (!expected.length) return process.env.VERCEL_ENV !== 'production'
  const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : ''
  const direct = Array.isArray(request.headers['x-content-worker-key'])
    ? request.headers['x-content-worker-key'][0]
    : request.headers['x-content-worker-key']
  return expected.includes(bearer) || (typeof direct === 'string' && expected.includes(direct))
}

async function refreshContentStatus(contentItemId: string) {
  const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?content_item_id=eq.${contentItemId}&enabled=eq.true&select=status`)
  const status = aggregateContentStatus(posts.map((post) => String(post.status)))
  await database(`/rest/v1/content_items?id=eq.${contentItemId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  })
}

async function markStaleJobsForReview() {
  const stale = await databaseJson<Json[]>(
    `/rest/v1/content_publish_jobs?status=eq.publishing&leased_until=lt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=25`,
  )
  for (const job of stale) {
    const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?id=eq.${job.platform_post_id}&select=*&limit=1`)
    const post = posts[0]
    if (!post) continue
    let reconciled = false
    if (post.provider_post_id && isProvider(post.provider)) {
      try {
        const connection = await findConnection(String(job.organization_id), post.provider)
        if (connection) {
          const secrets = await loadConnectionSecrets(String(connection.id))
          const accessToken = post.provider === 'facebook'
            ? secrets.accessToken
            : await freshGoogleAccessToken({ connection, accessToken: secrets.accessToken, refreshToken: secrets.refreshToken })
          await publisherFor(post.provider).getStatus(connection, accessToken, String(post.provider_post_id))
          const now = new Date().toISOString()
          await Promise.all([
            database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'published', progress: 100, completed_at: now, leased_until: null, updated_at: now }) }),
            database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'published', published_at: post.published_at ?? now, updated_at: now }) }),
          ])
          reconciled = true
        }
      } catch {
        reconciled = false
      }
    }
    if (!reconciled) {
      const now = new Date().toISOString()
      const message = 'Owner Hub paused this post after an interrupted provider response to prevent a duplicate. Verify the provider before retrying.'
      await Promise.all([
        database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'needs_review', error_code: 'provider_reconciliation_required', error_message: message, leased_until: null, updated_at: now }) }),
        database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'needs_review', last_error_code: 'provider_reconciliation_required', last_error_message: message, updated_at: now }) }),
      ])
    }
    await refreshContentStatus(String(post.content_item_id))
  }
}

async function processJob(job: Json) {
  const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?id=eq.${job.platform_post_id}&select=*&limit=1`)
  const post = posts[0]
  if (!post || !isProvider(post.provider)) throw new Error('platform_post_not_found')
  const provider = post.provider as ContentProvider
  const items = await databaseJson<Json[]>(`/rest/v1/content_items?id=eq.${post.content_item_id}&select=*&limit=1`)
  const content = items[0]
  if (!content) throw new Error('content_item_not_found')
  if (post.provider_post_id || post.status === 'published') {
    const now = new Date().toISOString()
    await database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'published', progress: 100, completed_at: now, leased_until: null, updated_at: now }),
    })
    await refreshContentStatus(String(content.id))
    return
  }

  if (providerMockMode()) {
    const now = new Date().toISOString()
    const mockId = `mock:${provider}:${String(job.id)}`
    await Promise.all([
      database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'published', progress: 100, completed_at: now, leased_until: null, provider_state: { mock: true }, updated_at: now }) }),
      database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'published', provider_post_id: mockId, provider_url: null, published_at: now, provider_metadata: { ...(post.provider_metadata as Json ?? {}), mock: true }, updated_at: now }) }),
    ])
    await auditContent({ organizationId: String(job.organization_id), contentItemId: String(content.id), platformPostId: String(post.id), action: 'content.mock_published', metadata: { provider, mock: true } })
    await refreshContentStatus(String(content.id))
    return
  }

  if (!providerPublishingEnabled(provider)) throw new Error(`${provider}_publishing_disabled`)
  const connection = await findConnection(String(job.organization_id), provider)
  if (!connection || connection.status !== 'connected') throw new Error('authorization_expired')
  const secrets = await loadConnectionSecrets(String(connection.id))
  const accessToken = provider === 'facebook'
    ? secrets.accessToken
    : await freshGoogleAccessToken({ connection, accessToken: secrets.accessToken, refreshToken: secrets.refreshToken })
  const videoUrl = await signedVideoUrl(String(content.video_storage_key), 21_600)
  const checkpoint = async (state: Json, providerSessionId?: string) => {
    const result = await database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        provider_state: state, provider_session_id: providerSessionId ?? job.provider_session_id ?? null,
        leased_until: new Date(Date.now() + 5 * 60_000).toISOString(), updated_at: new Date().toISOString(),
      }),
    })
    if (!result.ok) throw new Error('provider_checkpoint_not_saved')
  }
  const result = await publisherFor(provider).publish({
    job, post, content, connection, accessToken, refreshToken: secrets.refreshToken, videoUrl, checkpoint,
  })
  const now = new Date().toISOString()
  if (result.state === 'processing') {
    await Promise.all([
      database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'queued', progress: result.progress, provider_state: result.providerState, next_attempt_at: new Date(Date.now() + 2_000).toISOString(), leased_until: null, updated_at: now }),
      }),
      database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'uploading', updated_at: now }),
      }),
    ])
    return
  }
  await Promise.all([
    database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'published', progress: 100, provider_state: result.providerState, completed_at: now, leased_until: null, updated_at: now }),
    }),
    database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'published', provider_post_id: result.providerPostId, provider_url: result.providerUrl ?? null,
        published_at: now, last_error_code: null, last_error_message: result.warning ?? null,
        provider_metadata: { ...(post.provider_metadata as Json ?? {}), publishResult: result.providerState }, updated_at: now,
      }),
    }),
    database('/rest/v1/usage_events', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ organization_id: job.organization_id, event_type: 'social_publish', quantity: 1, metadata: { provider } }),
    }),
  ])
  await auditContent({ organizationId: String(job.organization_id), contentItemId: String(content.id), platformPostId: String(post.id), action: 'content.platform_published', metadata: { provider, providerPostId: result.providerPostId ?? null, warning: result.warning ?? null } })
  await refreshContentStatus(String(content.id))
}

async function failJob(job: Json, error: unknown) {
  const safe = providerSafeError(error)
  const attempts = Number(job.attempt_count ?? 1)
  const maxAttempts = Number(job.max_attempts ?? 6)
  const retry = safe.transient && attempts < maxAttempts
  const nextAttempt = retry ? new Date(Date.now() + retryDelaySeconds(attempts) * 1_000).toISOString() : null
  const now = new Date().toISOString()
  const posts = await databaseJson<Json[]>(`/rest/v1/content_platform_posts?id=eq.${job.platform_post_id}&select=content_item_id,id,provider&limit=1`)
  const post = posts[0]
  await Promise.all([
    database(`/rest/v1/content_publish_jobs?id=eq.${job.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: retry ? 'retrying' : 'failed', next_attempt_at: nextAttempt, leased_until: null, error_code: safe.code, error_message: safe.message, updated_at: now, ...(!retry ? { completed_at: now } : {}) }),
    }),
    post ? database(`/rest/v1/content_platform_posts?id=eq.${post.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: retry ? 'retrying' : 'failed', last_error_code: safe.code, last_error_message: safe.message, updated_at: now }),
    }) : Promise.resolve(new Response(null, { status: 204 })),
  ])
  if (post) {
    await auditContent({ organizationId: String(job.organization_id), contentItemId: String(post.content_item_id), platformPostId: String(post.id), action: retry ? 'content.platform_retrying' : 'content.platform_failed', metadata: { provider: post.provider, code: safe.code, attempt: attempts } })
    await refreshContentStatus(String(post.content_item_id))
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!['GET', 'POST'].includes(request.method ?? '')) return sendJson(response, 405, { error: 'Method not allowed.' })
  if (!workerAuthorized(request)) return sendJson(response, 401, { error: 'Worker authorization failed.' })
  try {
    await markStaleJobsForReview()
    const jobs = await databaseJson<Json[]>('/rest/v1/rpc/claim_content_publish_jobs', {
      method: 'POST', body: JSON.stringify({ claim_limit: 3 }),
    })
    let succeeded = 0
    for (const job of jobs) {
      try {
        await processJob(job)
        succeeded += 1
      } catch (error) {
        console.error('Content publish job failed.', { jobId: job.id, name: error instanceof Error ? error.name : 'UnknownError' })
        await failJob(job, error)
      }
    }
    return sendJson(response, 200, { claimed: jobs.length, processed: succeeded })
  } catch (error) {
    console.error('Content publish worker failed.', { name: error instanceof Error ? error.name : 'UnknownError' })
    return sendJson(response, 500, { error: 'Content publishing worker could not complete this cycle.' })
  }
}

export const config = { maxDuration: 300 }
