import { CirclePlay, MapPin, MessagesSquare } from 'lucide-react'

import { normalizeTagList, providerLabels } from '../contentRules'
import type { ContentProvider, PlatformPostDraft, SocialConnection } from '../types'

const icons = { facebook: MessagesSquare, google_business: MapPin, youtube: CirclePlay }

type Props = {
  posts: PlatformPostDraft[]
  connections: SocialConnection[]
  onChange: (post: PlatformPostDraft) => void
  onToggle: (provider: ContentProvider, enabled: boolean) => void
}

function statusLabel(connection: SocialConnection | undefined) {
  if (!connection || connection.status === 'disconnected') return 'Not connected'
  if (connection.status === 'token_expired') return 'Token expired'
  if (connection.status === 'error') return 'Connection error'
  if (connection.status === 'pending') return 'Choose account'
  return 'Ready'
}

export default function PlatformEditors({ posts, connections, onChange, onToggle }: Props) {
  return (
    <div className="ca-platform-editors">
      {posts.map((post) => {
        const Icon = icons[post.provider]
        const connection = connections.find((item) => item.provider === post.provider)
        return (
          <article className={`ca-platform-editor ca-${post.provider}`} key={post.provider}>
            <header>
              <span className="ca-provider-icon"><Icon aria-hidden="true" size={20} /></span>
              <div>
                <h3>{providerLabels[post.provider]}</h3>
                <small className={`ca-connection-label ca-connection-${connection?.status ?? 'disconnected'}`}>{statusLabel(connection)}</small>
              </div>
              <label className="ca-switch">
                <input checked={post.enabled} onChange={(event) => onToggle(post.provider, event.target.checked)} type="checkbox" />
                <span>{post.enabled ? 'On' : 'Off'}</span>
              </label>
            </header>

            {post.enabled && post.provider === 'facebook' ? (
              <div className="ca-editor-fields">
                <label>
                  <span>Facebook caption</span>
                  <textarea onChange={(event) => onChange({ ...post, caption: event.target.value })} rows={5} value={post.caption} />
                </label>
                <div className="ca-two-column">
                  <label><span>Title (optional)</span><input maxLength={100} onChange={(event) => onChange({ ...post, title: event.target.value })} value={post.title} /></label>
                  <label><span>CTA</span><input onChange={(event) => onChange({ ...post, callToAction: event.target.value })} value={post.callToAction} /></label>
                </div>
                <label><span>Hashtags</span><input onChange={(event) => onChange({ ...post, hashtags: normalizeTagList(event.target.value, 6) })} placeholder="drywall, South Bend, handyman" value={post.hashtags.join(', ')} /></label>
                <label className="ca-check-row"><input checked={post.metadata.publishAsReel === true} onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, publishAsReel: event.target.checked } })} type="checkbox" /><span>Publish as a Reel when the connected Page supports it</span></label>
              </div>
            ) : null}

            {post.enabled && post.provider === 'google_business' ? (
              <div className="ca-editor-fields">
                <label>
                  <span>Google Business summary</span>
                  <textarea maxLength={1500} onChange={(event) => onChange({ ...post, caption: event.target.value })} rows={5} value={post.caption} />
                  <small>{post.caption.length} / 1,500</small>
                </label>
                <div className="ca-two-column">
                  <label><span>Post type</span><select onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, googleTopicType: event.target.value as 'STANDARD' | 'EVENT' | 'OFFER' } })} value={post.metadata.googleTopicType ?? 'STANDARD'}><option value="STANDARD">Update</option><option value="EVENT">Event</option><option value="OFFER">Offer</option></select></label>
                  <label><span>Call to action</span><select onChange={(event) => onChange({ ...post, callToAction: event.target.value })} value={post.callToAction || 'LEARN_MORE'}><option value="LEARN_MORE">Learn more</option><option value="CALL">Call</option><option value="BOOK">Book</option><option value="SIGN_UP">Sign up</option></select></label>
                </div>
                {post.callToAction !== 'CALL' ? <label><span>CTA URL</span><input inputMode="url" onChange={(event) => onChange({ ...post, callToActionUrl: event.target.value })} placeholder="https://callrabbitsfoot.com" value={post.callToActionUrl} /></label> : null}
                <p className="ca-capability-note">Owner Hub publishes the Local Post and uploads the video as location media separately. Google does not document direct video attachment parity for Local Posts.</p>
              </div>
            ) : null}

            {post.enabled && post.provider === 'youtube' ? (
              <div className="ca-editor-fields">
                <label><span>Video title</span><input maxLength={100} onChange={(event) => onChange({ ...post, title: event.target.value })} value={post.title} /><small>{post.title.length} / 100</small></label>
                <label><span>Description</span><textarea maxLength={5000} onChange={(event) => onChange({ ...post, description: event.target.value })} rows={6} value={post.description} /></label>
                <label><span>Tags</span><input onChange={(event) => onChange({ ...post, tags: normalizeTagList(event.target.value, 20) })} value={post.tags.join(', ')} /></label>
                <div className="ca-three-column">
                  <label><span>Visibility</span><select onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, youtubeVisibility: event.target.value as 'private' | 'unlisted' | 'public' } })} value={post.metadata.youtubeVisibility ?? 'private'}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
                  <label><span>Category ID</span><input inputMode="numeric" onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, youtubeCategoryId: event.target.value } })} value={post.metadata.youtubeCategoryId ?? '26'} /></label>
                  <label><span>Audience</span><select onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, madeForKids: event.target.value === 'yes' } })} value={post.metadata.madeForKids ? 'yes' : 'no'}><option value="no">Not made for kids</option><option value="yes">Made for kids</option></select></label>
                </div>
                <label className="ca-check-row"><input checked={post.metadata.containsSyntheticMedia === true} onChange={(event) => onChange({ ...post, metadata: { ...post.metadata, containsSyntheticMedia: event.target.checked } })} type="checkbox" /><span>Contains realistic altered or synthetic media</span></label>
                <p className="ca-capability-note">Unverified YouTube API projects can upload only private videos until Google completes its compliance audit.</p>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
