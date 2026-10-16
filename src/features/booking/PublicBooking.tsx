import {
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'

import './PublicBooking.css'

const apiOrigin = (import.meta.env.VITE_OWNER_HUB_API_URL ?? '').replace(/\/$/, '')

type BookingProfile = {
  businessName: string
  phone: string
  email: string
  city: string
  state: string
}

type BookingDraft = {
  name: string
  phone: string
  email: string
  service: string
  address: string
  description: string
  preferredDate: string
  preferredWindow: 'morning' | 'afternoon' | 'evening' | 'flexible'
  urgency: 'standard' | 'soon' | 'urgent'
  consent: boolean
  company: string
}

const emptyDraft: BookingDraft = {
  name: '',
  phone: '',
  email: '',
  service: '',
  address: '',
  description: '',
  preferredDate: '',
  preferredWindow: 'flexible',
  urgency: 'standard',
  consent: false,
  company: '',
}

export default function PublicBooking({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<BookingProfile | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    void fetch(`${apiOrigin}/api/public-booking?slug=${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as BookingProfile & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'This booking page is unavailable.')
        setProfile(payload)
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'This booking page is unavailable.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [slug])

  function update<K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.consent) {
      setError('Confirm that the business may contact you about this request.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`${apiOrigin}/api/public-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, slug }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Your request could not be submitted.')
      setSubmitted(true)
      setDraft(emptyDraft)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <main className="booking-shell booking-loading"><LoaderCircle className="booking-spin"/><p>Opening secure booking…</p></main>
  }

  if (!profile) {
    return <main className="booking-shell booking-loading"><Wrench/><h1>Booking is unavailable</h1><p>{error || 'Check the link and try again.'}</p></main>
  }

  if (submitted) {
    return (
      <main className="booking-shell">
        <section className="booking-success">
          <span><CheckCircle2 size={42}/></span>
          <p className="booking-eyebrow">REQUEST RECEIVED</p>
          <h1>You’re on the list.</h1>
          <p>{profile.businessName} received your project details. This is a request—not a confirmed appointment—and the team will contact you to confirm scope and timing.</p>
          <button onClick={() => setSubmitted(false)} type="button">Submit another request</button>
        </section>
      </main>
    )
  }

  return (
    <main className="booking-shell">
      <header className="booking-hero">
        <div className="booking-brand"><span><Wrench size={22}/></span><strong>{profile.businessName}</strong></div>
        <p className="booking-eyebrow">ONLINE PROJECT REQUEST</p>
        <h1>Tell us what needs fixing.</h1>
        <p>Share the basics in about two minutes. We’ll review the scope and contact you before anything is scheduled.</p>
        <div className="booking-trust-row">
          <span><ShieldCheck size={17}/> Private request</span>
          <span><Clock3 size={17}/> Fast follow-up</span>
          <span><MapPin size={17}/> {profile.city}{profile.city && profile.state ? ', ' : ''}{profile.state}</span>
        </div>
      </header>

      <form className="booking-form" onSubmit={(event) => void submit(event)}>
        <section>
          <div className="booking-section-heading"><span>1</span><div><h2>Your contact information</h2><p>Used only to respond to this request.</p></div></div>
          <div className="booking-grid two">
            <label><span>Name</span><input autoComplete="name" onChange={(event) => update('name', event.target.value)} required value={draft.name}/></label>
            <label><span>Phone</span><input autoComplete="tel" inputMode="tel" onChange={(event) => update('phone', event.target.value)} required value={draft.phone}/></label>
            <label><span>Email</span><input autoComplete="email" onChange={(event) => update('email', event.target.value)} required type="email" value={draft.email}/></label>
            <label><span>Service address</span><input autoComplete="street-address" onChange={(event) => update('address', event.target.value)} required value={draft.address}/></label>
          </div>
        </section>

        <section>
          <div className="booking-section-heading"><span>2</span><div><h2>What can we help with?</h2><p>More detail helps us prepare the right questions.</p></div></div>
          <label><span>Type of work</span><input onChange={(event) => update('service', event.target.value)} placeholder="Drywall, tile, door repair…" required value={draft.service}/></label>
          <label><span>Project details</span><textarea maxLength={4000} onChange={(event) => update('description', event.target.value)} placeholder="Describe the problem, approximate size, and anything we should know about access." required rows={6} value={draft.description}/><small>{draft.description.length}/4000</small></label>
        </section>

        <section>
          <div className="booking-section-heading"><span>3</span><div><h2>Preferred timing</h2><p>We’ll confirm the actual appointment with you.</p></div></div>
          <div className="booking-grid two">
            <label><span>Preferred date</span><input min={new Date().toISOString().slice(0, 10)} onChange={(event) => update('preferredDate', event.target.value)} type="date" value={draft.preferredDate}/></label>
            <label><span>Time window</span><select onChange={(event) => update('preferredWindow', event.target.value as BookingDraft['preferredWindow'])} value={draft.preferredWindow}><option value="flexible">Flexible</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
            <label><span>Priority</span><select onChange={(event) => update('urgency', event.target.value as BookingDraft['urgency'])} value={draft.urgency}><option value="standard">Standard timing</option><option value="soon">As soon as practical</option><option value="urgent">Urgent—contact me quickly</option></select></label>
          </div>
        </section>

        <label className="booking-honeypot" aria-hidden="true">Company<input autoComplete="off" onChange={(event) => update('company', event.target.value)} tabIndex={-1} value={draft.company}/></label>
        <label className="booking-consent"><input checked={draft.consent} onChange={(event) => update('consent', event.target.checked)} type="checkbox"/><span>I agree that {profile.businessName} may call, text, or email me about this request. Message and data rates may apply.</span></label>
        {error ? <p className="booking-error" role="alert">{error}</p> : null}
        <button className="booking-submit" disabled={submitting} type="submit">{submitting ? <><LoaderCircle className="booking-spin"/>Sending securely…</> : <><CalendarCheck2/>Request an appointment</>}</button>
        <p className="booking-disclaimer">Submitting does not confirm an appointment or price. Final scope, availability, and pricing are confirmed directly by the business.</p>
      </form>
    </main>
  )
}
