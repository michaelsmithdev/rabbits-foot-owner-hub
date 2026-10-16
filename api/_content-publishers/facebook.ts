import { metaGraphVersion } from '../_content-autopilot-server.js'
import type { Json } from '../_content-autopilot-server.js'
import { providerFetch } from './types.js'
import type { ProviderAccount, PublishRecord, PublishResult, SocialPublisher } from './types.js'

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${metaGraphVersion()}/${path.replace(/^\//, '')}`
}

export class FacebookPublisher implements SocialPublisher {
  readonly provider = 'facebook' as const

  async listAccounts(accessToken: string): Promise<ProviderAccount[]> {
    const value = await providerFetch<{ data?: Array<{ id?: string; name?: string; access_token?: string; tasks?: string[] }> }>(
      `${graphUrl('me/accounts')}?fields=id,name,access_token,tasks&limit=100&access_token=${encodeURIComponent(accessToken)}`,
    )
    return (value.data ?? []).flatMap((page) => page.id && page.name && page.access_token
      ? [{ id: page.id, name: page.name, accessToken: page.access_token }]
      : [])
  }

  async testConnection(connection: Json, accessToken: string) {
    const pageId = String(connection.external_resource_id ?? '')
    if (!pageId) throw new Error('facebook_page_not_selected')
    const page = await providerFetch<{ id?: string; name?: string }>(
      `${graphUrl(pageId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    )
    if (!page.id) throw new Error('facebook_page_not_found')
    return { checks: ['Connected', 'Page token valid', `${page.name ?? 'Facebook Page'} found`, 'Publishing permission available'] }
  }

  async publish(record: PublishRecord): Promise<PublishResult> {
    const pageId = String(record.connection.external_resource_id ?? '')
    if (!pageId) throw new Error('facebook_page_not_selected')
    const metadata = (record.post.provider_metadata && typeof record.post.provider_metadata === 'object'
      ? record.post.provider_metadata
      : {}) as Json
    const caption = String(record.post.caption ?? '')
    const hashtags = Array.isArray(record.post.hashtags) ? record.post.hashtags.map((tag) => `#${String(tag).replace(/^#/, '')}`).join(' ') : ''
    const description = `${caption}${hashtags ? `\n\n${hashtags}` : ''}`.trim()
    const existingState = (record.job.provider_state && typeof record.job.provider_state === 'object'
      ? record.job.provider_state
      : {}) as Json

    if (metadata.publishAsReel === true) {
      let videoId = typeof existingState.videoId === 'string' ? existingState.videoId : ''
      let uploadUrl = typeof existingState.uploadUrl === 'string' ? existingState.uploadUrl : ''
      if (!videoId || !uploadUrl) {
        const started = await providerFetch<{ video_id?: string; upload_url?: string }>(
          `${graphUrl(`${pageId}/video_reels`)}?upload_phase=start&access_token=${encodeURIComponent(record.accessToken)}`,
          { method: 'POST' },
        )
        if (!started.video_id || !started.upload_url) throw new Error('facebook_reel_session_missing')
        videoId = started.video_id
        uploadUrl = started.upload_url
        await record.checkpoint({ ...existingState, videoId, uploadUrl, phase: 'started' }, videoId)
      }
      if (existingState.phase !== 'uploaded') {
        const upload = await fetch(uploadUrl, {
          method: 'POST',
          headers: { Authorization: `OAuth ${record.accessToken}`, file_url: record.videoUrl },
          signal: AbortSignal.timeout(90_000),
        })
        if (!upload.ok) throw new Error(`${upload.status}:facebook_reel_upload_failed`)
        await record.checkpoint({ ...existingState, videoId, uploadUrl, phase: 'uploaded' }, videoId)
      }
      await providerFetch<Json>(graphUrl(`${pageId}/video_reels`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: record.accessToken,
          video_id: videoId,
          upload_phase: 'finish',
          video_state: 'PUBLISHED',
          description,
        }),
      })
      return {
        state: 'published', providerPostId: videoId,
        providerUrl: `https://www.facebook.com/reel/${encodeURIComponent(videoId)}`,
        progress: 100, providerState: { videoId, phase: 'published' },
      }
    }

    const value = await providerFetch<{ id?: string }>(graphUrl(`${pageId}/videos`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: record.accessToken,
        file_url: record.videoUrl,
        title: String(record.post.title ?? ''),
        description,
        published: true,
      }),
    })
    if (!value.id) throw new Error('facebook_video_id_missing')
    return {
      state: 'published', providerPostId: value.id,
      providerUrl: `https://www.facebook.com/${encodeURIComponent(pageId)}/videos/${encodeURIComponent(value.id)}`,
      progress: 100, providerState: { videoId: value.id, phase: 'published' },
    }
  }

  async getStatus(_connection: Json, accessToken: string, providerPostId: string): Promise<Json> {
    return providerFetch<Json>(`${graphUrl(providerPostId)}?fields=id,status,permalink_url&access_token=${encodeURIComponent(accessToken)}`)
  }

  async deletePost(_connection: Json, accessToken: string, providerPostId: string): Promise<void> {
    const result = await fetch(`${graphUrl(providerPostId)}?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'DELETE', signal: AbortSignal.timeout(30_000),
    })
    if (!result.ok && result.status !== 404) throw new Error(`${result.status}:facebook_delete_failed`)
  }
}
