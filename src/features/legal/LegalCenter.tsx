import { type FormEvent, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileText, LifeBuoy, ShieldCheck, Trash2 } from 'lucide-react'

import './LegalCenter.css'

type LegalView = 'privacy' | 'terms' | 'delete-account' | 'support'

const apiOrigin = (import.meta.env.VITE_OWNER_HUB_API_URL ?? '').replace(/\/$/, '')

export default function LegalCenter({ view }: { view: LegalView }) {
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function requestDeletion(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(''); setError('')
    try {
      const response = await fetch(`${apiOrigin}/api/account-deletion-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason, source: 'public-web' }),
      })
      const payload = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(payload.error || 'The request could not be submitted.')
      setMessage(payload.message || 'Your request was received.'); setEmail(''); setReason('')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The request could not be submitted.')
    } finally { setBusy(false) }
  }

  return <main className="legal-page">
    <header className="legal-header"><img alt="Rabbit's Foot Owner Hub" height="72" src="/rabbits-foot-logo.png" width="72"/><div><strong>RABBIT'S FOOT</strong><span>OWNER HUB</span></div><a href="/">Sign in</a></header>
    <section className="legal-shell">
      <nav aria-label="Legal and support"><a className={view === 'privacy' ? 'active' : ''} href="#privacy"><ShieldCheck/>Privacy</a><a className={view === 'terms' ? 'active' : ''} href="#terms"><FileText/>Terms</a><a className={view === 'delete-account' ? 'active danger' : ''} href="#delete-account"><Trash2/>Delete account</a><a className={view === 'support' ? 'active' : ''} href="#support"><LifeBuoy/>Support</a></nav>
      {view === 'privacy' && <article><p className="eyebrow">PRIVACY POLICY</p><h1>Your business data stays yours.</h1><p className="legal-updated">Effective August 9, 2026</p><h2>Information we collect</h2><p>Owner Hub stores account details, business settings, customers, leads, estimates, invoices, job records, appointments, communications, uploaded photos, payment references, and usage records that you provide while operating your business.</p><h2>How information is used</h2><p>We use this information only to provide, secure, support, and improve Owner Hub features such as cloud synchronization, customer portals, AI-assisted estimates, document generation, team access, and payment status updates.</p><h2>Service providers</h2><p>Owner Hub relies on Supabase for authentication and data storage, Vercel for application hosting, OpenAI for requested AI features, and Square for connected payments. Each provider receives only the information required to perform its service.</p><h2>Security and retention</h2><p>Business records are separated by workspace and protected by authenticated access policies. Private photos use signed access links. Data is retained while an account is active and during any legally required or requested recovery period.</p><h2>Your choices</h2><p>You can export business data from Settings, correct saved information, disconnect integrations, or request deletion of your account and associated data.</p><h2>Contact</h2><p>Privacy questions can be sent to <a href="mailto:callrabbitsfoot@gmail.com">callrabbitsfoot@gmail.com</a>.</p></article>}
      {view === 'terms' && <article><p className="eyebrow">TERMS OF SERVICE</p><h1>Clear rules for using Owner Hub.</h1><p className="legal-updated">Effective August 9, 2026</p><h2>Business use</h2><p>Owner Hub is a contractor business-management tool. You are responsible for reviewing estimates, measurements, prices, taxes, contract terms, code requirements, and customer-facing documents before relying on or sending them.</p><h2>AI assistance</h2><p>AI output is a draft, not a guarantee or professional inspection. It may be incomplete. The contractor must verify scope, quantities, site conditions, and pricing.</p><h2>Payments</h2><p>Customer payments are processed by the connected Square merchant account. Owner Hub does not store full payment-card details. Subscription charges, renewals, cancellations, and refunds follow the plan shown when purchased and applicable store or payment-provider rules.</p><h2>Acceptable use</h2><p>Do not use Owner Hub to violate law, access another business's information, distribute malware, abuse platform resources, or misrepresent work to customers.</p><h2>Availability and backups</h2><p>We work to keep the service reliable, but internet and third-party services can fail. Maintain appropriate business records and periodically export your portable backup.</p><h2>Support</h2><p>Questions can be sent to <a href="mailto:callrabbitsfoot@gmail.com">callrabbitsfoot@gmail.com</a>.</p></article>}
      {view === 'delete-account' && <article><p className="eyebrow">DATA CONTROL</p><h1>Request account deletion.</h1><p>Submit the email used to sign in. We will verify ownership before deleting the account. A request includes the account profile and associated workspace data when the requester is the sole workspace owner. Records required for legal, fraud-prevention, payment, or tax obligations may be retained only as required.</p><form className="deletion-form" onSubmit={(event) => void requestDeletion(event)}><label><span>Account email</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email}/></label><label><span>Optional note</span><textarea maxLength={800} onChange={(event) => setReason(event.target.value)} value={reason}/></label>{error && <p className="legal-error" role="alert">{error}</p>}{message && <p className="legal-success" role="status"><CheckCircle2/>{message}</p>}<button disabled={busy} type="submit"><Trash2/>{busy ? 'Submitting…' : 'Request deletion'}</button></form></article>}
      {view === 'support' && <article><p className="eyebrow">OWNER HUB SUPPORT</p><h1>Help when the work cannot wait.</h1><h2>Contact support</h2><p>Email <a href="mailto:callrabbitsfoot@gmail.com?subject=Owner%20Hub%20Support">callrabbitsfoot@gmail.com</a> with your account email, the screen you were using, and what happened. Never email passwords, API keys, or complete payment-card information.</p><h2>Before contacting support</h2><p>Confirm the Online and Cloud synced indicators are visible, retry once, and note the approximate time of the problem. Your portable backup is available from Settings.</p><h2>Account access</h2><p>Use Forgot password on the sign-in screen. For deletion or privacy requests, use the dedicated deletion form so the request can be tracked safely.</p></article>}
      <a className="legal-back" href="/"><ArrowLeft/>Return to Owner Hub</a>
    </section>
  </main>
}

export type { LegalView }
