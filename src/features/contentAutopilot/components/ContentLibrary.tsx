import { ExternalLink, Film, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { loadCustomers } from '../../customers/data/customerStore'
import { loadJobs } from '../../jobs/data/jobStore'
import { providerLabels } from '../contentRules'
import { getPlaybackUrl, removePlatformPost, retryPlatformPost } from '../services/contentApi'
import type { ContentItemSummary } from '../types'

type Props = { items: ContentItemSummary[]; onRefresh: () => Promise<void> }
type Filter = 'all' | 'draft' | 'scheduled' | 'published' | 'failed' | 'facebook' | 'google_business' | 'youtube' | 'ai' | 'manual'

const filters: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' }, { value: 'failed', label: 'Failed' }, { value: 'facebook', label: 'Facebook' },
  { value: 'google_business', label: 'Google' }, { value: 'youtube', label: 'YouTube' }, { value: 'ai', label: 'AI generated' },
  { value: 'manual', label: 'Manual' },
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function ContentLibrary({ items, onRefresh }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ContentItemSummary | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [busyPostId, setBusyPostId] = useState('')
  const [error, setError] = useState('')
  const privateSearchContext = useMemo(() => {
    const customers = new Map(loadCustomers().map((customer) => [customer.id, `${customer.firstName} ${customer.lastName}`.trim()]))
    return new Map(loadJobs().map((job) => [job.id, `${job.jobName} ${job.description} ${job.scopeOfWork} ${customers.get(job.customerId) ?? ''}`.toLowerCase()]))
  }, [])
  const visibleItems = useMemo(() => items.filter((item) => {
    const platformMatch = ['facebook', 'google_business', 'youtube'].includes(filter)
      ? item.platformPosts.some((post) => post.provider === filter)
      : true
    const statusMatch = ['draft', 'scheduled', 'published', 'failed'].includes(filter) ? item.status === filter || (filter === 'failed' && item.status === 'partially_published') : true
    const modeMatch = filter === 'ai' ? item.creationMode !== 'manual' : filter === 'manual' ? item.creationMode === 'manual' : true
    const haystack = [item.originalFilename, item.masterCaption, item.jobName, privateSearchContext.get(item.linkedJobId), ...item.platformPosts.flatMap((post) => [post.title, post.caption, post.description])].join(' ').toLowerCase()
    return platformMatch && statusMatch && modeMatch && haystack.includes(search.trim().toLowerCase())
  }), [filter, items, privateSearchContext, search])

  async function openDetail(item: ContentItemSummary) {
    setSelected(item)
    setPlaybackUrl('')
    setError('')
    try {
      const result = await getPlaybackUrl(item.id)
      setPlaybackUrl(result.url)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The private video preview is unavailable.')
    }
  }

  async function retry(postId: string) {
    setBusyPostId(postId)
    setError('')
    try {
      await retryPlatformPost(postId)
      await onRefresh()
      const refreshed = items.find((item) => item.id === selected?.id)
      if (refreshed) setSelected(refreshed)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The retry could not be queued.')
    } finally {
      setBusyPostId('')
    }
  }

  async function removeFromPlatform(postId: string, provider: string) {
    if (!window.confirm(`Remove this post from ${provider}? The Content Library record and audit history will remain.`)) return
    setBusyPostId(postId)
    setError('')
    try {
      await removePlatformPost(postId)
      setSelected(null)
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The platform post could not be removed.')
    } finally {
      setBusyPostId('')
    }
  }

  return (
    <section className="ca-library">
      <div className="ca-library-toolbar">
        <label className="ca-library-search"><Search size={19} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search captions, job, customer, title, or notes" value={search} /></label>
        <div className="ca-filter-row">{filters.map((item) => <button className={filter === item.value ? 'active' : ''} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div>
      </div>
      {error ? <div className="ca-error" role="alert">{error}</div> : null}
      {visibleItems.length ? (
        <div className="ca-library-grid">
          {visibleItems.map((item) => (
            <button className="ca-library-card" key={item.id} onClick={() => void openDetail(item)} type="button">
              <span className="ca-library-thumb"><Film size={32} /><small>{item.aspectRatio || 'Video'}</small></span>
              <span className="ca-library-copy"><span className="ca-card-topline"><b className={`ca-status-pill ca-status-${item.status}`}>{item.status.replaceAll('_', ' ')}</b><em>{item.creationMode === 'manual' ? 'Manual' : 'AI assist'}</em></span><strong>{item.jobName || item.originalFilename}</strong><p>{item.masterCaption || item.platformPosts.find((post) => post.caption)?.caption || 'No caption yet'}</p><small>{formatDate(item.createdAt)}</small><span className="ca-platform-dots">{item.platformPosts.filter((post) => post.enabled).map((post) => <i className={`ca-dot ca-dot-${post.provider}`} key={post.provider} title={providerLabels[post.provider]} />)}</span></span>
            </button>
          ))}
        </div>
      ) : <div className="ca-empty"><Film size={34} /><h2>No matching content yet</h2><p>New uploads and drafts will appear here with their real provider status.</p></div>}

      {selected ? (
        <div className="ca-modal-backdrop" onMouseDown={() => setSelected(null)} role="presentation">
          <section aria-label="Content detail" aria-modal="true" className="ca-modal ca-detail-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <header className="ca-modal-header"><div><span className="ca-eyebrow">CONTENT DETAIL</span><h2>{selected.jobName || selected.originalFilename}</h2></div><button aria-label="Close" onClick={() => setSelected(null)} type="button"><X size={22} /></button></header>
            <div className="ca-detail-grid">
              <div>{playbackUrl ? <video controls playsInline src={playbackUrl} /> : <div className="ca-preview-placeholder">Loading private video…</div>}<dl><div><dt>Created</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Type</dt><dd>{String(selected.contentType).replaceAll('_', ' ')}</dd></div><div><dt>Mode</dt><dd>{selected.creationMode.replaceAll('_', ' ')}</dd></div><div><dt>Status</dt><dd>{selected.status.replaceAll('_', ' ')}</dd></div></dl></div>
              <div className="ca-detail-content"><article><span>Master caption</span><p>{selected.masterCaption || 'No master caption saved.'}</p></article>{selected.privacyWarnings.length ? <article className="ca-privacy-warning"><strong>Recorded privacy warnings</strong><p>{selected.privacyWarnings.join(', ')}</p></article> : null}{selected.platformPosts.map((post) => <article className="ca-detail-platform" key={post.provider}><header><div><strong>{providerLabels[post.provider]}</strong><span className={`ca-status-pill ca-status-${post.status}`}>{post.status?.replaceAll('_', ' ')}</span></div>{post.providerUrl ? <a href={post.providerUrl} rel="noreferrer" target="_blank"><ExternalLink size={16} />Open</a> : null}</header>{post.title ? <h3>{post.title}</h3> : null}<p>{post.provider === 'youtube' ? post.description : post.caption}</p>{post.lastErrorMessage ? <small className="ca-platform-error">{post.lastErrorMessage}</small> : null}{post.id && ['failed', 'needs_review'].includes(post.status ?? '') ? <button className="ca-secondary-button" disabled={busyPostId === post.id} onClick={() => void retry(post.id!)} type="button"><RefreshCw className={busyPostId === post.id ? 'spin' : ''} size={16} />Retry only {providerLabels[post.provider]}</button> : null}{post.id && post.status === 'published' ? <button className="ca-secondary-button ca-remove-button" disabled={busyPostId === post.id} onClick={() => void removeFromPlatform(post.id!, providerLabels[post.provider])} type="button"><Trash2 size={16} />Remove from {providerLabels[post.provider]}</button> : null}</article>)}</div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
