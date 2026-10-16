import type { Json } from '../_content-autopilot-server.js'
import { YOUTUBE_API_VERSION } from '../_content-autopilot-server.js'
import { providerFetch } from './types.js'
import type { ProviderAccount, PublishRecord, PublishResult, SocialPublisher } from './types.js'

const CHUNK_BYTES = 8 * 1024 * 1024

export class YouTubePublisher implements SocialPublisher {
  readonly provider = 'youtube' as const

  async listAccounts(accessToken: string): Promise<ProviderAccount[]> {
    const value = await providerFetch<{ items?: Array<{ id?: string; snippet?: { title?: string } }> }>(
      `https://www.googleapis.com/youtube/${YOUTUBE_API_VERSION}/channels?part=snippet&mine=true&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    return (value.items ?? []).flatMap((channel) => channel.id
      ? [{ id: channel.id, name: channel.snippet?.title ?? channel.id }]
      : [])
  }

  async testConnection(connection: Json, accessToken: string) {
    const channelId = String(connection.external_resource_id ?? '')
    if (!channelId) throw new Error('youtube_channel_not_selected')
    const channel = (await this.listAccounts(accessToken)).find((account) => account.id === channelId)
    if (!channel) throw new Error('youtube_channel_not_found')
    return {
      checks: ['Connected', 'Offline access available', `${channel.name} found`, 'YouTube API access available'],
      warning: 'Google restricts uploads from unverified API projects to private until the project passes an API compliance audit.',
    }
  }

  async publish(record: PublishRecord): Promise<PublishResult> {
    const totalBytes = Number(record.content.file_size ?? 0)
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('youtube_video_size_missing')
    const mimeType = String(record.content.mime_type ?? 'video/mp4')
    const metadata = (record.post.provider_metadata && typeof record.post.provider_metadata === 'object' ? record.post.provider_metadata : {}) as Json
    const state = (record.job.provider_state && typeof record.job.provider_state === 'object' ? record.job.provider_state : {}) as Json
    let uploadUri = typeof state.uploadUri === 'string' ? state.uploadUri : ''
    const offset = typeof state.offset === 'number' && Number.isFinite(state.offset) ? state.offset : 0
    if (!uploadUri) {
      const initialization = await fetch(
        `https://www.googleapis.com/upload/youtube/${YOUTUBE_API_VERSION}/videos?uploadType=resumable&part=snippet,status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${record.accessToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Length': String(totalBytes),
            'X-Upload-Content-Type': mimeType,
          },
          body: JSON.stringify({
            snippet: {
              title: String(record.post.title ?? '').slice(0, 100),
              description: String(record.post.description ?? '').slice(0, 5_000),
              tags: Array.isArray(record.post.tags) ? record.post.tags.slice(0, 30) : [],
              categoryId: String(metadata.youtubeCategoryId ?? '26'),
            },
            status: {
              privacyStatus: String(metadata.youtubeVisibility ?? 'private'),
              selfDeclaredMadeForKids: metadata.madeForKids === true,
              containsSyntheticMedia: metadata.containsSyntheticMedia === true,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      )
      uploadUri = initialization.headers.get('location') ?? ''
      if (!initialization.ok || !uploadUri) throw new Error(`${initialization.status}:youtube_upload_session_failed`)
      await record.checkpoint({ ...state, uploadUri, offset: 0, totalBytes, phase: 'uploading' }, uploadUri)
    }

    const end = Math.min(offset + CHUNK_BYTES, totalBytes) - 1
    const source = await fetch(record.videoUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
      signal: AbortSignal.timeout(60_000),
    })
    if (!source.ok && source.status !== 206) throw new Error(`${source.status}:video_chunk_not_available`)
    const sourceLength = Number(source.headers.get('content-length') ?? 0)
    if (source.status === 200 && (sourceLength === 0 || sourceLength > CHUNK_BYTES)) {
      await source.body?.cancel()
      throw new Error('video_range_not_supported')
    }
    const chunk = Buffer.from(await source.arrayBuffer())
    const actualEnd = offset + chunk.length - 1
    const upload = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${record.accessToken}`,
        'Content-Length': String(chunk.length),
        'Content-Type': mimeType,
        'Content-Range': `bytes ${offset}-${actualEnd}/${totalBytes}`,
      },
      body: chunk,
      signal: AbortSignal.timeout(90_000),
    })

    if (upload.status === 308) {
      const range = upload.headers.get('range')?.match(/bytes=0-(\d+)/i)
      const nextOffset = range ? Number(range[1]) + 1 : actualEnd + 1
      const progress = Math.min(99, Math.floor(nextOffset / totalBytes * 100))
      const nextState = { ...state, uploadUri, offset: nextOffset, totalBytes, phase: 'uploading' }
      await record.checkpoint(nextState, uploadUri)
      return { state: 'processing', progress, providerState: nextState }
    }

    const payload = await upload.json().catch(() => ({})) as { id?: string; error?: { message?: string } }
    if (!upload.ok || !payload.id) throw new Error(`${upload.status}:${payload.error?.message ?? 'youtube_upload_failed'}`)
    return {
      state: 'published', providerPostId: payload.id,
      providerUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(payload.id)}`,
      progress: 100, providerState: { uploadUri, offset: totalBytes, totalBytes, phase: 'uploaded', videoId: payload.id },
    }
  }

  async getStatus(_connection: Json, accessToken: string, providerPostId: string): Promise<Json> {
    return providerFetch<Json>(
      `https://www.googleapis.com/youtube/${YOUTUBE_API_VERSION}/videos?part=status,processingDetails&id=${encodeURIComponent(providerPostId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  }

  async deletePost(_connection: Json, accessToken: string, providerPostId: string): Promise<void> {
    const result = await fetch(`https://www.googleapis.com/youtube/${YOUTUBE_API_VERSION}/videos?id=${encodeURIComponent(providerPostId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000),
    })
    if (!result.ok && result.status !== 404) throw new Error(`${result.status}:youtube_delete_failed`)
  }
}
