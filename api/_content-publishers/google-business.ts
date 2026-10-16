import type { Json } from '../_content-autopilot-server.js'
import { GOOGLE_BUSINESS_API_VERSION } from '../_content-autopilot-server.js'
import { providerFetch } from './types.js'
import type { ProviderAccount, PublishRecord, PublishResult, SocialPublisher } from './types.js'

export class GoogleBusinessPublisher implements SocialPublisher {
  readonly provider = 'google_business' as const

  async listAccounts(accessToken: string): Promise<ProviderAccount[]> {
    const accounts = await providerFetch<{ accounts?: Array<{ name?: string; accountName?: string }> }>(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const output: ProviderAccount[] = []
    for (const account of accounts.accounts ?? []) {
      if (!account.name) continue
      const locations = await providerFetch<{ locations?: Array<{ name?: string; title?: string }> }>(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode&pageSize=100`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      for (const location of locations.locations ?? []) {
        if (location.name) output.push({
          id: location.name,
          parentId: account.name,
          name: `${location.title ?? location.name} · ${account.accountName ?? account.name}`,
        })
      }
    }
    return output
  }

  async testConnection(connection: Json, accessToken: string) {
    const location = String(connection.external_resource_id ?? '')
    if (!location) throw new Error('google_location_not_selected')
    const value = await providerFetch<{ name?: string; title?: string }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${location}?readMask=name,title`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!value.name) throw new Error('google_location_not_found')
    return {
      checks: ['Connected', 'Offline access available', `${value.title ?? 'Business location'} found`, 'Business Profile management permission available'],
      warning: 'Local Posts and location video are separate Google resources; Owner Hub publishes both when supported.',
    }
  }

  async publish(record: PublishRecord): Promise<PublishResult> {
    const account = String(record.connection.external_account_id ?? '').replace(/^accounts\//, '')
    const location = String(record.connection.external_resource_id ?? '').replace(/^locations\//, '')
    if (!account || !location) throw new Error('google_location_not_selected')
    const parent = `accounts/${account}/locations/${location}`
    const prior = (record.job.provider_state && typeof record.job.provider_state === 'object' ? record.job.provider_state : {}) as Json
    const metadata = (record.post.provider_metadata && typeof record.post.provider_metadata === 'object' ? record.post.provider_metadata : {}) as Json
    let localPostName = typeof prior.localPostName === 'string' ? prior.localPostName : ''
    let searchUrl = typeof prior.searchUrl === 'string' ? prior.searchUrl : ''
    if (!localPostName) {
      const callToAction = String(record.post.call_to_action ?? 'LEARN_MORE')
      const callToActionUrl = String(record.post.call_to_action_url ?? '')
      const postBody: Json = {
        languageCode: 'en-US',
        summary: String(record.post.caption ?? '').slice(0, 1_500),
        topicType: typeof metadata.googleTopicType === 'string' ? metadata.googleTopicType : 'STANDARD',
      }
      if (callToAction) {
        postBody.callToAction = callToAction === 'CALL'
          ? { actionType: 'CALL' }
          : { actionType: callToAction, url: callToActionUrl }
      }
      const post = await providerFetch<{ name?: string; searchUrl?: string }>(
        `https://mybusiness.googleapis.com/${GOOGLE_BUSINESS_API_VERSION}/${parent}/localPosts`,
        {
          method: 'POST', headers: { Authorization: `Bearer ${record.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        },
      )
      if (!post.name) throw new Error('google_local_post_id_missing')
      localPostName = post.name
      searchUrl = post.searchUrl ?? ''
      await record.checkpoint({ ...prior, localPostName, searchUrl, phase: 'local_post_published' }, localPostName)
    }

    let mediaName = typeof prior.mediaName === 'string' ? prior.mediaName : ''
    let mediaWarning = ''
    if (!mediaName) {
      try {
        const media = await providerFetch<{ name?: string; googleUrl?: string }>(
          `https://mybusiness.googleapis.com/${GOOGLE_BUSINESS_API_VERSION}/${parent}/media`,
          {
            method: 'POST', headers: { Authorization: `Bearer ${record.accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaFormat: 'VIDEO',
              locationAssociation: { category: 'ADDITIONAL' },
              description: String(record.post.caption ?? '').slice(0, 1_500),
              sourceUrl: record.videoUrl,
            }),
          },
        )
        if (media.name) {
          mediaName = media.name
          await record.checkpoint({ ...prior, localPostName, searchUrl, mediaName, mediaUrl: media.googleUrl ?? '', phase: 'video_added' }, localPostName)
        }
      } catch (error) {
        mediaWarning = 'The Local Post published, but Google did not accept the video as location media. The text post remains live.'
        console.error('Google Business location video was not accepted.', { name: error instanceof Error ? error.name : 'UnknownError' })
      }
    }
    return {
      state: 'published', providerPostId: localPostName, providerUrl: searchUrl,
      progress: 100, providerState: { localPostName, searchUrl, mediaName, phase: 'published', mediaWarning },
      warning: mediaWarning || undefined,
    }
  }

  async getStatus(_connection: Json, accessToken: string, providerPostId: string): Promise<Json> {
    return providerFetch<Json>(`https://mybusiness.googleapis.com/${GOOGLE_BUSINESS_API_VERSION}/${providerPostId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }

  async deletePost(_connection: Json, accessToken: string, providerPostId: string, providerState: Json = {}): Promise<void> {
    const mediaName = typeof providerState.mediaName === 'string' ? providerState.mediaName : ''
    if (mediaName) {
      const mediaDelete = await fetch(`https://mybusiness.googleapis.com/${GOOGLE_BUSINESS_API_VERSION}/${mediaName}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000),
      })
      if (!mediaDelete.ok && mediaDelete.status !== 404) throw new Error(`${mediaDelete.status}:google_location_video_delete_failed`)
    }
    const postDelete = await fetch(`https://mybusiness.googleapis.com/${GOOGLE_BUSINESS_API_VERSION}/${providerPostId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30_000),
    })
    if (!postDelete.ok && postDelete.status !== 404) throw new Error(`${postDelete.status}:google_local_post_delete_failed`)
  }
}
