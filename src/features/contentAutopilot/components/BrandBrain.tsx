import { Brain, Check, LockKeyhole, Save, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { saveBrandProfile } from '../services/contentApi'
import type { BrandProfile, ContentItemSummary, LearnedPreference } from '../types'

type Props = {
  items: ContentItemSummary[]
  learnedPreferences: LearnedPreference[]
  profile: BrandProfile
  onRefresh: () => Promise<void>
}

export default function BrandBrain({ items, learnedPreferences, profile, onRefresh }: Props) {
  const [draft, setDraft] = useState(profile)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const published = items.filter((item) => item.status === 'published' || item.status === 'partially_published')
  const aiPublished = published.filter((item) => item.creationMode !== 'manual')
  const contentTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of published) counts.set(item.contentType, (counts.get(item.contentType) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [published])

  function update<K extends keyof BrandProfile>(key: K, value: BrandProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setBusy(true); setError(''); setMessage('')
    try {
      await saveBrandProfile(draft)
      setMessage('Brand Profile saved. Locked owner choices remain primary over performance suggestions.')
      await onRefresh()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Brand Profile could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ca-brand-layout">
      {message ? <div className="ca-success" role="status"><Check size={18} />{message}</div> : null}
      {error ? <div className="ca-error" role="alert">{error}</div> : null}
      <section className="ca-brain-hero">
        <span className="ca-brain-icon"><Brain size={34} /></span>
        <div><span className="ca-eyebrow">RABBIT&apos;S FOOT BRAND BRAIN</span><h2>The system learns from real owner choices</h2><p>AI output is not magically retrained after every post. Owner Hub stores structured preferences, exact edit history, feedback, and approved examples for retrieval.</p></div>
        <dl><div><dt>Posts learned from</dt><dd>{published.length || 'Not enough data yet'}</dd></div><div><dt>AI-assisted posts published</dt><dd>{aiPublished.length || 'Not enough data yet'}</dd></div><div><dt>Accepted learned preferences</dt><dd>{learnedPreferences.filter((item) => item.accepted).length || 'Not enough data yet'}</dd></div></dl>
      </section>

      <section className="ca-brand-profile-card">
        <header><div><span className="ca-eyebrow">BRAND PROFILE</span><h2>Owner-controlled facts and voice</h2><p>These settings are authoritative. AI may suggest preferences later, but it cannot override a locked owner choice.</p></div><button className="ca-primary-button" disabled={busy} onClick={() => void save()} type="button"><Save size={17} />{busy ? 'Saving…' : 'Save profile'}</button></header>
        <div className="ca-two-column">
          <label className="ca-field"><span>Business name</span><input onChange={(event) => update('businessName', event.target.value)} value={draft.businessName} /></label>
          <label className="ca-field"><span>Service area</span><input onChange={(event) => update('serviceArea', event.target.value)} placeholder="South Bend, Mishawaka, and nearby communities" value={draft.serviceArea} /></label>
        </div>
        <label className="ca-field"><span>Business description</span><textarea onChange={(event) => update('businessDescription', event.target.value)} rows={4} value={draft.businessDescription} /></label>
        <div className="ca-two-column">
          <label className="ca-field"><span>Website</span><input inputMode="url" onChange={(event) => update('website', event.target.value)} value={draft.website} /></label>
          <label className="ca-field"><span>Phone</span><input inputMode="tel" onChange={(event) => update('phone', event.target.value)} value={draft.phone} /></label>
        </div>
        <label className="ca-field"><span>Default CTA</span><input onChange={(event) => update('defaultCta', event.target.value)} value={draft.defaultCta} /></label>
        <div className="ca-two-column">
          <label className="ca-field"><span>Primary services</span><textarea onChange={(event) => update('primaryServices', event.target.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))} placeholder="Drywall repair, tile repair, fixture installation" rows={4} value={draft.primaryServices.join(', ')} /></label>
          <label className="ca-field"><span>Words or phrases to avoid</span><textarea onChange={(event) => update('phrasesToAvoid', event.target.value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))} rows={4} value={draft.phrasesToAvoid.join(', ')} /></label>
        </div>
        <label className="ca-field"><span>Writing style</span><textarea onChange={(event) => update('writingStyle', event.target.value)} rows={3} value={draft.writingStyle} /></label>
        <div className="ca-three-column">
          <label className="ca-field"><span>Emoji use</span><select onChange={(event) => update('emojiPreference', event.target.value)} value={draft.emojiPreference}><option value="none">None</option><option value="minimal">Minimal</option><option value="moderate">Moderate</option></select></label>
          <label className="ca-field"><span>Hashtag use</span><select onChange={(event) => update('hashtagPreference', event.target.value)} value={draft.hashtagPreference}><option value="none">None</option><option value="1-2 relevant hashtags">1–2 relevant</option><option value="2-4 relevant hashtags">2–4 relevant</option><option value="up to 6 relevant hashtags">Up to 6 relevant</option></select></label>
          <label className="ca-field"><span>YouTube category ID</span><input inputMode="numeric" onChange={(event) => update('youtubeCategoryId', event.target.value)} value={draft.youtubeCategoryId} /></label>
        </div>
        <div className="ca-goals-grid"><strong>Weekly content goals</strong>{(['facebook', 'google_business', 'youtube'] as const).map((provider) => <label key={provider}><span>{provider === 'google_business' ? 'Google Business' : provider[0].toUpperCase() + provider.slice(1)}</span><input min="0" onChange={(event) => update('contentGoals', { ...draft.contentGoals, [provider]: Number(event.target.value) })} type="number" value={draft.contentGoals[provider]} /></label>)}</div>
        <fieldset className="ca-autonomy"><legend>Automation level</legend>{[
          ['0', 'Manual', 'You write everything; Owner Hub only publishes.'], ['1', 'AI Assist', 'AI suggests copy; you edit and publish.'],
          ['2', 'AI Draft', 'AI prepares platform drafts; you approve.'], ['3', 'Smart Approval', 'High-confidence drafts are grouped for one-button approval.'],
        ].map(([value, label, description]) => <label key={value}><input checked={draft.autonomyLevel === Number(value)} onChange={() => update('autonomyLevel', Number(value) as 0 | 1 | 2 | 3)} type="radio" /><span><strong>Level {value} · {label}</strong><small>{description}</small></span></label>)}<label className="disabled"><input disabled type="radio" /><span><strong>Level 4 · Autopilot</strong><small>Opt-in feature flag remains off until privacy checks, confidence thresholds, and provider approvals are production-validated.</small></span></label></fieldset>
      </section>

      <section className="ca-learned-preferences">
        <header><div><span className="ca-eyebrow">AI LEARNED PREFERENCES</span><h2>Evidence-backed suggestions</h2></div><Sparkles size={26} /></header>
        {learnedPreferences.length ? <div>{learnedPreferences.map((preference) => <article key={preference.id}><span>{preference.locked ? <LockKeyhole size={18} /> : preference.accepted === false ? <X size={18} /> : <Sparkles size={18} />}</span><div><strong>{preference.key.replaceAll('_', ' ')}</strong><p>{typeof preference.value === 'string' ? preference.value : JSON.stringify(preference.value)}</p><small>{preference.evidenceCount} evidence records · {preference.confidence === null ? 'confidence pending' : `${Math.round(preference.confidence * 100)}% confidence`}</small></div></article>)}</div> : <div className="ca-empty"><Brain size={32} /><h3>Not enough data yet</h3><p>Learned preferences appear only after actual AI drafts, owner edits, approvals, and published examples exist.</p></div>}
        {contentTypeCounts.length ? <div className="ca-actual-patterns"><strong>Actual published content mix</strong>{contentTypeCounts.map(([type, count]) => <span key={type}>{type.replaceAll('_', ' ')} · {count}</span>)}</div> : null}
      </section>
    </div>
  )
}

