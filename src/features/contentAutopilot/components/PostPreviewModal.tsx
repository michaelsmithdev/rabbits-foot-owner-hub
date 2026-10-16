import { CirclePlay, MapPin, MessagesSquare, X } from 'lucide-react'

import { providerLabels } from '../contentRules'
import type { ContentProvider, PlatformPostDraft } from '../types'

const icons = { facebook: MessagesSquare, google_business: MapPin, youtube: CirclePlay }

type Props = {
  businessName: string
  posts: PlatformPostDraft[]
  previewUrl: string
  mode: 'preview' | 'review'
  scheduledAt: string | null
  busy: boolean
  onClose: () => void
  onConfirm?: () => void
}

function copyFor(post: PlatformPostDraft) {
  if (post.provider === 'youtube') return post.description
  return post.caption
}

export default function PostPreviewModal({ businessName, posts, previewUrl, mode, scheduledAt, busy, onClose, onConfirm }: Props) {
  const enabledPosts = posts.filter((post) => post.enabled)
  return (
    <div className="ca-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section aria-label={mode === 'review' ? 'Ready to publish' : 'Platform previews'} aria-modal="true" className="ca-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="ca-modal-header">
          <div><span className="ca-eyebrow">{mode === 'review' ? 'FINAL REVIEW' : 'APPROXIMATE PREVIEW'}</span><h2>{mode === 'review' ? 'Ready to publish' : 'How each post may look'}</h2></div>
          <button aria-label="Close" onClick={onClose} type="button"><X size={22} /></button>
        </header>
        <p className="ca-modal-note">Provider layouts change. These previews show content hierarchy, not an exact replica of Facebook, Google, or YouTube.</p>
        <div className="ca-preview-grid">
          {enabledPosts.map((post) => {
            const Icon = icons[post.provider as ContentProvider]
            return (
              <article className="ca-social-preview" key={post.provider}>
                <header><span><Icon size={18} /></span><div><strong>{businessName || "Rabbit's Foot Handyman Services LLC"}</strong><small>{providerLabels[post.provider]}</small></div></header>
                {previewUrl ? <video controls={false} muted playsInline preload="metadata" src={previewUrl} /> : <div className="ca-preview-placeholder">Video preview</div>}
                <div className="ca-social-copy">
                  {post.title ? <h3>{post.title}</h3> : null}
                  <p>{copyFor(post) || 'Add platform copy before publishing.'}</p>
                  {post.hashtags.length ? <small>{post.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}</small> : null}
                  {post.callToAction ? <button tabIndex={-1} type="button">{post.callToAction.replaceAll('_', ' ')}</button> : null}
                </div>
              </article>
            )
          })}
        </div>
        {mode === 'review' ? (
          <footer className="ca-modal-actions">
            <div><strong>{scheduledAt ? 'Scheduled' : 'Publish now'}</strong><span>{scheduledAt ? new Date(scheduledAt).toLocaleString() : `${enabledPosts.length} independent provider jobs will be queued.`}</span></div>
            <button className="ca-secondary-button" disabled={busy} onClick={onClose} type="button">Cancel</button>
            <button className="ca-primary-button" disabled={busy} onClick={onConfirm} type="button">{busy ? 'Creating secure jobs…' : scheduledAt ? 'Confirm schedule' : 'Publish to all'}</button>
          </footer>
        ) : null}
      </section>
    </div>
  )
}
