import {
  CalendarClock,
  Check,
  FileVideo,
  FolderOpen,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { loadCustomers } from '../../customers/data/customerStore'
import { loadJobs } from '../../jobs/data/jobStore'
import {
  providerLabels,
  publicJobContext,
  validatePlatformPost,
  validateVideo,
} from '../contentRules'
import {
  discardContentDraft,
  finalizeVideoUpload,
  generateContentWithAi,
  loadContentDetail,
  publishContent,
  saveAiFeedback,
  updateContentDraft,
  uploadVideoResumable,
  prepareVideoUpload,
} from '../services/contentApi'
import { extractRepresentativeFrames, readVideoMetadata } from '../services/videoMetadata'
import type {
  AiContentResult,
  BrandProfile,
  ContentItemSummary,
  ContentProvider,
  ContentType,
  PlatformPostDraft,
  SocialConnection,
  VideoMetadata,
} from '../types'
import PlatformEditors from './PlatformEditors'
import PostPreviewModal from './PostPreviewModal'

type Props = {
  aiEnabled: boolean
  brandProfile: BrandProfile
  connections: SocialConnection[]
  mockMode: boolean
  onOpenConnections: () => void
  onRefresh: () => Promise<void>
}

type ScheduleChoice = 'now' | 'today' | 'tomorrow' | 'custom' | 'recommended'

const contentTypeOptions: Array<{ value: ContentType; label: string }> = [
  { value: 'before_after', label: 'Before & After' }, { value: 'repair', label: 'Repair' },
  { value: 'installation', label: 'Installation' }, { value: 'transformation', label: 'Transformation' },
  { value: 'maintenance', label: 'Maintenance' }, { value: 'tip', label: 'Tip' },
  { value: 'educational', label: 'Educational' }, { value: 'customer_result', label: 'Customer Result' },
  { value: 'promotion', label: 'Promotion' }, { value: 'business_update', label: 'Business Update' },
  { value: 'other', label: 'Other' },
]

function defaultPosts(profile: BrandProfile): PlatformPostDraft[] {
  const defaults: Record<ContentProvider, boolean> = { facebook: true, google_business: true, youtube: true }
  try {
    const saved = JSON.parse(localStorage.getItem('content-autopilot-platform-selection') ?? '{}') as Partial<Record<ContentProvider, boolean>>
    Object.assign(defaults, saved)
  } catch {
    // Keep safe defaults.
  }
  return [
    {
      provider: 'facebook', enabled: defaults.facebook, title: '', caption: '', description: '', hashtags: [], tags: [],
      callToAction: profile.defaultCta, callToActionUrl: profile.website, scheduledAt: null,
      metadata: { publishAsReel: true },
    },
    {
      provider: 'google_business', enabled: defaults.google_business, title: '', caption: '', description: '', hashtags: [], tags: [],
      callToAction: profile.phone ? 'CALL' : 'LEARN_MORE', callToActionUrl: profile.website, scheduledAt: null,
      metadata: { googleTopicType: 'STANDARD' },
    },
    {
      provider: 'youtube', enabled: defaults.youtube, title: '', caption: '', description: '', hashtags: [], tags: [],
      callToAction: profile.defaultCta, callToActionUrl: profile.website, scheduledAt: null,
      metadata: { youtubeCategoryId: profile.youtubeCategoryId || '26', youtubeVisibility: 'private', madeForKids: false, containsSyntheticMedia: false },
    },
  ]
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function suggestedTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 100)
}

function scheduleDate(choice: ScheduleChoice, customValue: string): string | null {
  if (choice === 'now') return null
  if (choice === 'custom') return customValue ? new Date(customValue).toISOString() : null
  const date = new Date()
  if (choice === 'today') {
    date.setHours(18, 0, 0, 0)
    if (date.getTime() <= Date.now() + 60_000) date.setTime(Date.now() + 60 * 60_000)
  } else {
    date.setDate(date.getDate() + 1)
    date.setHours(choice === 'recommended' ? 18 : 10, 0, 0, 0)
  }
  return date.toISOString()
}

export default function CreatePost({ aiEnabled, brandProfile, connections, mockMode, onOpenConnections, onRefresh }: Props) {
  const browseRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const pollTimer = useRef<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [contentItemId, setContentItemId] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadState, setUploadState] = useState<'idle' | 'preparing' | 'uploading' | 'uploaded' | 'failed'>('idle')
  const [masterCaption, setMasterCaption] = useState('')
  const [contentType, setContentType] = useState<ContentType>('other')
  const [linkedJobId, setLinkedJobId] = useState('')
  const [posts, setPosts] = useState<PlatformPostDraft[]>(() => defaultPosts(brandProfile))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<'preview' | 'review' | null>(null)
  const [scheduleChoice, setScheduleChoice] = useState<ScheduleChoice>('now')
  const [customSchedule, setCustomSchedule] = useState('')
  const [aiResult, setAiResult] = useState<AiContentResult | null>(null)
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)
  const [publishedItem, setPublishedItem] = useState<ContentItemSummary | null>(null)
  const jobs = useMemo(() => loadJobs().filter((job) => ['in_progress', 'completed', 'invoiced'].includes(job.status)), [])
  const selectedJob = jobs.find((job) => job.id === linkedJobId)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (pollTimer.current) window.clearInterval(pollTimer.current)
  }, [previewUrl])

  function currentJobContext() {
    if (!selectedJob) return {}
    const customer = loadCustomers().find((item) => item.id === selectedJob.customerId)
    return publicJobContext({
      jobName: selectedJob.jobName, description: selectedJob.description, scopeOfWork: selectedJob.scopeOfWork,
      materials: selectedJob.materials, city: customer?.city ?? '', status: selectedJob.status,
    })
  }

  function updatePost(nextPost: PlatformPostDraft) {
    setPosts((current) => current.map((post) => post.provider === nextPost.provider ? nextPost : post))
  }

  function togglePost(provider: ContentProvider, enabled: boolean) {
    setPosts((current) => {
      const next = current.map((post) => post.provider === provider ? { ...post, enabled } : post)
      localStorage.setItem('content-autopilot-platform-selection', JSON.stringify(Object.fromEntries(next.map((post) => [post.provider, post.enabled]))))
      return next
    })
  }

  async function chooseVideo(nextFile: File | undefined) {
    if (!nextFile) return
    const validationError = validateVideo(nextFile)
    if (validationError) { setError(validationError); return }
    setError('')
    setMessage('')
    setAiResult(null)
    setPrivacyAcknowledged(false)
    setPublishedItem(null)
    setBusy(true)
    setUploadState('preparing')
    try {
      if (contentItemId) await discardContentDraft(contentItemId)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const localPreview = URL.createObjectURL(nextFile)
      setFile(nextFile)
      setPreviewUrl(localPreview)
      const metadataPromise = readVideoMetadata(nextFile)
      const prepared = await prepareVideoUpload(nextFile)
      setContentItemId(prepared.contentItemId)
      setUploadState('uploading')
      await uploadVideoResumable(nextFile, prepared.storageKey, setUploadProgress)
      const nextMetadata = await metadataPromise
      setMetadata(nextMetadata)
      const title = suggestedTitle(nextFile.name)
      const nextPosts = posts.map((post) => post.provider === 'youtube' && !post.title ? { ...post, title } : post)
      setPosts(nextPosts)
      await finalizeVideoUpload({
        contentItemId: prepared.contentItemId, metadata: nextMetadata, masterCaption, contentType,
        linkedJobId, jobContext: currentJobContext(), platformPosts: nextPosts,
      })
      setUploadProgress(100)
      setUploadState('uploaded')
      setMessage('Video secured in private storage. You can safely finish the post.')
    } catch (caughtError) {
      setUploadState('failed')
      setError(caughtError instanceof Error ? caughtError.message : 'The video could not be uploaded.')
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft() {
    if (!contentItemId || uploadState !== 'uploaded') throw new Error('Upload a video before saving this post.')
    await updateContentDraft({ contentItemId, masterCaption, contentType, linkedJobId, jobContext: currentJobContext(), platformPosts: posts })
  }

  async function generateAi() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveDraft()
      const frames = file ? await extractRepresentativeFrames(file, 3) : []
      const result = await generateContentWithAi({
        contentItemId, masterCaption, contentType, jobContext: currentJobContext(), frameDataUrls: frames,
      })
      setAiResult(result)
      setContentType(result.contentType)
      setPosts((current) => current.map((post) => {
        if (post.provider === 'facebook') return { ...post, caption: result.facebook.caption, hashtags: result.facebook.hashtags, callToAction: result.facebook.callToAction, metadata: { ...post.metadata, publishAsReel: result.facebook.publishAsReel } }
        if (post.provider === 'google_business') return { ...post, caption: result.googleBusiness.summary, callToAction: result.googleBusiness.callToAction, callToActionUrl: result.googleBusiness.callToActionUrl }
        return { ...post, title: result.youtube.title, description: result.youtube.description, tags: result.youtube.tags, metadata: { ...post.metadata, youtubeCategoryId: result.youtube.categoryId } }
      }))
      setPrivacyAcknowledged(result.privacyWarnings.length === 0)
      setMessage('Platform-specific drafts generated. Review every field before publishing.')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'AI content could not be generated.')
    } finally {
      setBusy(false)
    }
  }

  async function openModal(nextModal: 'preview' | 'review') {
    setError('')
    const errors = posts.flatMap(validatePlatformPost)
    if (!posts.some((post) => post.enabled)) errors.push('Select at least one platform.')
    if (errors.length) { setError(errors.join(' ')); return }
    try {
      setBusy(true)
      await saveDraft()
      setModal(nextModal)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The draft could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmPublish() {
    const privacyWarnings = aiResult?.privacyWarnings ?? []
    if (privacyWarnings.length > 0 && !privacyAcknowledged) {
      setError('Review and acknowledge the privacy warnings before publishing.')
      setModal(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      const scheduledAt = scheduleDate(scheduleChoice, customSchedule)
      const result = await publishContent({ contentItemId, platformPosts: posts, scheduledAt, privacyAcknowledged })
      setPublishedItem(result.item)
      setModal(null)
      setMessage(scheduledAt ? 'Post scheduled. The backend will publish it even when Owner Hub is closed.' : 'Independent provider jobs queued. You can close Owner Hub safely.')
      await onRefresh()
      if (pollTimer.current) window.clearInterval(pollTimer.current)
      pollTimer.current = window.setInterval(() => {
        void loadContentDetail(contentItemId).then(({ item }) => {
          setPublishedItem(item)
          if (item.platformPosts.every((post) => ['published', 'failed', 'needs_review', 'canceled'].includes(post.status ?? ''))) {
            if (pollTimer.current) window.clearInterval(pollTimer.current)
            pollTimer.current = null
            void onRefresh()
          }
        }).catch(() => null)
      }, 5_000)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Publishing jobs could not be created.')
      setModal(null)
    } finally {
      setBusy(false)
    }
  }

  async function removeVideo() {
    setBusy(true)
    try {
      if (contentItemId) await discardContentDraft(contentItemId)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(null); setPreviewUrl(''); setMetadata(null); setContentItemId(''); setUploadState('idle'); setUploadProgress(0); setAiResult(null); setPublishedItem(null)
      setMessage('Private draft removed.')
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The draft could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function recordFeedback(provider: ContentProvider, rating: -1 | 1) {
    if (!aiResult) return
    const originalOutput = provider === 'facebook' ? aiResult.facebook : provider === 'google_business' ? aiResult.googleBusiness : aiResult.youtube
    const finalPost = posts.find((post) => post.provider === provider)
    try {
      await saveAiFeedback({ generationId: aiResult.generationId, platform: provider, rating, reason: '', originalOutput, finalOutput: finalPost ?? {} })
      setMessage(`Feedback saved for ${providerLabels[provider]}.`)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Feedback could not be saved.')
    }
  }

  const selectedConnectionsReady = posts.filter((post) => post.enabled).every((post) => connections.find((connection) => connection.provider === post.provider)?.status === 'connected')
  const scheduledAt = scheduleDate(scheduleChoice, customSchedule)

  return (
    <div className="ca-create-layout">
      {mockMode ? <div className="ca-mock-banner"><strong>Development mock mode</strong><span>Provider jobs are recorded as MOCK and no public account is contacted.</span></div> : null}
      {message ? <div className="ca-success" role="status"><Check size={18} />{message}</div> : null}
      {error ? <div className="ca-error" role="alert">{error}</div> : null}

      <section className="ca-composer-card">
        <header><div><span className="ca-eyebrow">CREATE POST</span><h2>Drop in today&apos;s job video</h2><p>The original uploads to private Owner Hub storage before any platform job begins.</p></div></header>
        <input accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/avi" className="ca-hidden-input" onChange={(event) => void chooseVideo(event.target.files?.[0])} ref={browseRef} type="file" />
        <input accept="video/*" capture="environment" className="ca-hidden-input" onChange={(event) => void chooseVideo(event.target.files?.[0])} ref={cameraRef} type="file" />
        {!previewUrl ? (
          <div className="ca-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseVideo(event.dataTransfer.files[0]) }}>
            <span className="ca-drop-icon"><UploadCloud size={34} /></span>
            <h3>Drop a video here</h3>
            <p>MP4, MOV, WebM, M4V, or AVI · up to 2 GB</p>
            <div><button className="ca-primary-button" onClick={() => browseRef.current?.click()} type="button"><FolderOpen size={18} />Browse files</button><button className="ca-secondary-button" onClick={() => cameraRef.current?.click()} type="button"><Video size={18} />Use camera</button></div>
          </div>
        ) : (
          <div className="ca-video-selected">
            <video controls playsInline preload="metadata" src={previewUrl} />
            <div className="ca-video-details">
              <div><FileVideo size={22} /><span><strong>{file?.name}</strong><small>{metadata ? `${formatDuration(metadata.durationSeconds)} · ${metadata.width}×${metadata.height} · ${metadata.aspectRatio} · ${formatBytes(file?.size ?? 0)}` : formatBytes(file?.size ?? 0)}</small></span></div>
              <span className={`ca-upload-state ca-upload-${uploadState}`}>{uploadState === 'uploaded' ? 'Private upload complete' : uploadState === 'failed' ? 'Upload needs retry' : `Uploading ${uploadProgress}%`}</span>
              {uploadState === 'uploading' || uploadState === 'preparing' ? <div className="ca-progress"><span style={{ width: `${uploadProgress}%` }} /></div> : null}
              <div className="ca-inline-actions"><button disabled={busy || publishedItem !== null} onClick={() => browseRef.current?.click()} type="button"><RefreshCw size={16} />Replace</button><button disabled={busy || publishedItem !== null} onClick={() => void removeVideo()} type="button"><Trash2 size={16} />Remove</button></div>
            </div>
          </div>
        )}
      </section>

      <section className="ca-composer-card">
        <header className="ca-section-heading"><div><span className="ca-eyebrow">CONTEXT</span><h2>What should the post know?</h2></div></header>
        <div className="ca-two-column">
          <label className="ca-field"><span>Related job (optional)</span><select onChange={(event) => setLinkedJobId(event.target.value)} value={linkedJobId}><option value="">No job linked</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.jobName}</option>)}</select><small>Only non-sensitive work context is sent to AI. Customer names and contact details are excluded.</small></label>
          <label className="ca-field"><span>Content type</span><select onChange={(event) => setContentType(event.target.value as ContentType)} value={contentType}>{contentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <label className="ca-field"><span>Master caption</span><textarea onChange={(event) => setMasterCaption(event.target.value)} placeholder="Start with what happened on this job. Each platform can be customized below." rows={5} value={masterCaption} /></label>
        <button className="ca-ai-button" disabled={!aiEnabled || busy || uploadState !== 'uploaded'} onClick={() => void generateAi()} type="button"><Sparkles size={19} />{busy ? 'Working…' : 'Generate with AI'}<small>Creates different copy for Facebook, Google, and YouTube</small></button>
        {aiResult ? (
          <div className={`ca-ai-review ca-confidence-${aiResult.confidence}`}>
            <div><strong>{aiResult.confidence === 'high' ? 'High confidence' : aiResult.confidence === 'medium' ? 'Medium confidence' : 'Needs review'}</strong><span>{aiResult.videoSummary}</span></div>
            <div className="ca-score"><strong>{aiResult.score.overall}/100</strong><span>Heuristic content score</span></div>
            {aiResult.score.recommendations.length ? <ul>{aiResult.score.recommendations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          </div>
        ) : null}
        {aiResult?.privacyWarnings.length ? (
          <div className="ca-privacy-warning"><strong>Privacy review required</strong><p>AI flagged: {aiResult.privacyWarnings.join(', ')}. Detection can miss things—watch the full video yourself.</p><label><input checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} type="checkbox" /><span>I reviewed the full video and choose to continue.</span></label></div>
        ) : null}
      </section>

      <section className="ca-composer-card">
        <header className="ca-platform-heading"><div><span className="ca-eyebrow">PLATFORMS</span><h2>Platform-specific posts</h2></div><button className="ca-text-button" onClick={() => { const allEnabled = posts.every((post) => post.enabled); posts.forEach((post) => togglePost(post.provider, !allEnabled)) }} type="button">{posts.every((post) => post.enabled) ? 'Clear all' : 'Select all'}</button></header>
        {!mockMode && !selectedConnectionsReady ? <button className="ca-setup-required" onClick={onOpenConnections} type="button"><span><strong>Setup required</strong><small>Connect every selected platform before live publishing.</small></span><span>Open Social Accounts →</span></button> : null}
        <PlatformEditors connections={connections} onChange={updatePost} onToggle={togglePost} posts={posts} />
        {aiResult ? <div className="ca-feedback-row"><span>Help Brand Brain learn:</span>{posts.filter((post) => post.enabled).map((post) => <span key={post.provider}><b>{providerLabels[post.provider]}</b><button aria-label={`Good ${providerLabels[post.provider]} draft`} onClick={() => void recordFeedback(post.provider, 1)} type="button"><ThumbsUp size={16} /></button><button aria-label={`Not good ${providerLabels[post.provider]} draft`} onClick={() => void recordFeedback(post.provider, -1)} type="button"><ThumbsDown size={16} /></button></span>)}</div> : null}
      </section>

      <section className="ca-publish-bar">
        <div className="ca-schedule-control"><CalendarClock size={20} /><label><span>Publish timing</span><select onChange={(event) => setScheduleChoice(event.target.value as ScheduleChoice)} value={scheduleChoice}><option value="now">Now</option><option value="today">Today at 6 PM</option><option value="tomorrow">Tomorrow at 10 AM</option><option value="custom">Custom date/time</option><option value="recommended">Recommended baseline · tomorrow 6 PM</option></select></label>{scheduleChoice === 'custom' ? <input aria-label="Custom publish date and time" onChange={(event) => setCustomSchedule(event.target.value)} type="datetime-local" value={customSchedule} /> : null}</div>
        <div><button className="ca-secondary-button" disabled={busy || uploadState !== 'uploaded'} onClick={() => void openModal('preview')} type="button">Preview posts</button><button className="ca-primary-button" disabled={busy || uploadState !== 'uploaded'} onClick={() => void openModal('review')} type="button">{scheduleChoice === 'now' ? 'Publish' : 'Schedule'}</button></div>
      </section>

      {publishedItem ? <section className="ca-live-status"><header><div><span className="ca-eyebrow">PUBLISHING STATUS</span><h2>{publishedItem.status.replaceAll('_', ' ')}</h2></div><span>Safe to close Owner Hub</span></header>{publishedItem.platformPosts.filter((post) => post.enabled).map((post) => <article key={post.provider}><strong>{providerLabels[post.provider]}</strong><span className={`ca-status-pill ca-status-${post.status}`}>{post.status?.replaceAll('_', ' ')}</span>{post.lastErrorMessage ? <small>{post.lastErrorMessage}</small> : null}{post.providerUrl ? <a href={post.providerUrl} rel="noreferrer" target="_blank">Open post</a> : null}</article>)}</section> : null}

      {modal ? <PostPreviewModal businessName={brandProfile.businessName} busy={busy} mode={modal} onClose={() => setModal(null)} onConfirm={modal === 'review' ? () => void confirmPublish() : undefined} posts={posts} previewUrl={previewUrl} scheduledAt={scheduledAt} /> : null}
    </div>
  )
}

