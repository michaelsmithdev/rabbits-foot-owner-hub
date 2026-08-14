import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Hammer,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react'
import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

import './PublicCustomerPortal.css'

type PortalEstimate = {
  id: string
  estimateNumber: string
  jobName: string
  serviceAddress: string
  scopeOfWork?: string
  exclusions?: string[]
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
  }>
  status: string
  expirationDate: string
  total: number
  approval?: { customerName?: string; acceptedAt?: string }
}

type PortalInvoice = {
  id: string
  invoiceNumber: string
  jobName: string
  dueDate: string
  status: string
  total: number
  balance: number
  cardProcessingFeePercent: number
  cardFeeAmount: number
  cardCheckoutTotal: number
  payments: Array<{
    id: string
    date: string
    amount: number
    method: string
  }>
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
  }>
}

type PortalData = {
  expiresAt: string
  realtime?: { token: string; expiresAt: number } | null
  business: {
    name: string
    email: string
    phoneDisplay: string
    phoneDigits: string
    phoneTel: string
    phoneSms: string
  }
  customer: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone: string
  }
  estimates: PortalEstimate[]
  invoices: PortalInvoice[]
  appointments: Array<{
    id: string
    title: string
    serviceAddress: string
    startAt: string
    endAt: string
    status: string
  }>
  jobs: Array<{
    id: string
    jobNumber: string
    jobName: string
    scopeOfWork?: string
    status: string
    completedAt?: string
  }>
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})
const apiOrigin =
  import.meta.env.VITE_OWNER_HUB_API_URL?.trim().replace(/\/$/, '') ?? ''

export default function PublicCustomerPortal({ token }: { token: string }) {
  const [data, setData] = useState<PortalData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [approval, setApproval] = useState<{
    estimateId: string
    name: string
    note: string
  } | null>(null)
  const [change, setChange] = useState<{
    estimateId: string
    message: string
  } | null>(null)
  const [message, setMessage] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)
  const [paymentConfirmation, setPaymentConfirmation] = useState<PortalInvoice | null>(null)
  const [realtimeConfig, setRealtimeConfig] = useState<PortalData['realtime']>(null)
  const [workRequest, setWorkRequest] = useState({
    service: '',
    preferredTiming: '',
    details: '',
  })
  const [requestBusy, setRequestBusy] = useState(false)
  const revalidationTimer = useRef<number | null>(null)

  const load = useCallback(async (source: 'initial' | 'realtime' | 'resume' = 'initial') => {
    try {
      const response = await fetch(
        `${apiOrigin}/api/customer-portal?token=${encodeURIComponent(token)}`,
        { headers: { Accept: 'application/json' } },
      )
      const payload = (await response.json()) as PortalData & { error?: string }

      if (!response.ok) {
        throw new Error(payload.error || 'Customer Hub could not be opened.')
      }

      setData(payload)
      setRealtimeConfig((current) => {
        const hasUsableToken = current && current.expiresAt * 1000 > Date.now() + 5 * 60_000
        return hasUsableToken ? current : payload.realtime ?? null
      })
      setError('')
      if (source === 'realtime') setMessage('Customer Hub updated with the latest information.')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Customer Hub could not be opened.',
      )
    } finally {
      setBusy(false)
    }
  }, [token])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    function refreshWhenActive() {
      if (document.visibilityState === 'visible') void load('resume')
    }

    window.addEventListener('online', refreshWhenActive)
    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenActive)
    // Realtime is the primary path. This short, quiet revalidation is the
    // production fallback when a browser or network blocks a socket.
    const interval = window.setInterval(refreshWhenActive, 15_000)

    return () => {
      window.removeEventListener('online', refreshWhenActive)
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenActive)
      window.clearInterval(interval)
    }
  }, [load])

  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    if (!realtimeConfig?.token || !supabaseUrl || !publishableKey) return

    const realtimeClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
    let channel: RealtimeChannel | null = null
    let active = true

    void realtimeClient.realtime.setAuth(realtimeConfig.token).then(() => {
      if (!active) return
      channel = realtimeClient
        .channel(`customer-portal-${token.slice(0, 12)}`, {
          config: { private: true },
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'business_records',
          },
          () => {
            if (revalidationTimer.current) {
              window.clearTimeout(revalidationTimer.current)
            }
            revalidationTimer.current = window.setTimeout(
              () => void load('realtime'),
              250,
            )
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void load('resume')
        })
    })

    return () => {
      active = false
      if (revalidationTimer.current) window.clearTimeout(revalidationTimer.current)
      if (channel) void realtimeClient.removeChannel(channel)
    }
  }, [load, realtimeConfig, token])

  async function action(payload: Record<string, unknown>) {
    setMessage('')
    const response = await fetch(`${apiOrigin}/api/customer-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload }),
    })
    const result = (await response.json()) as { error?: string }

    if (!response.ok) {
      throw new Error(result.error || 'Your request could not be saved.')
    }

    await load()
  }

  async function approve() {
    if (!approval?.name.trim()) return

    try {
      await action({
        action: 'approve_estimate',
        estimateId: approval.estimateId,
        customerName: approval.name,
        note: approval.note,
      })
      setApproval(null)
      setMessage("Estimate approved. Rabbit's Foot has been notified.")
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Approval failed.')
    }
  }

  async function requestChange() {
    if (!change?.message.trim()) return

    try {
      await action({
        action: 'request_change',
        estimateId: change.estimateId,
        message: change.message,
      })
      setChange(null)
      setMessage("Your requested change was delivered to Rabbit's Foot.")
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Request failed.')
    }
  }

  async function payInvoice(invoice: PortalInvoice) {
    setPaymentInvoiceId(invoice.id)
    setMessage('')

    try {
      const response = await fetch(`${apiOrigin}/api/customer-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'create_payment',
          invoiceId: invoice.id,
        }),
      })
      const result = (await response.json()) as {
        url?: string
        error?: string
      }

      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Square checkout could not be opened.')
      }

      window.location.assign(result.url)
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Square checkout could not be opened.',
      )
      setPaymentInvoiceId(null)
    }
  }

  async function requestMoreWork() {
    if (!workRequest.service.trim() || !workRequest.details.trim()) {
      setMessage('Tell us what kind of work you need and add a few details.')
      return
    }

    setRequestBusy(true)
    try {
      await action({
        action: 'request_work',
        service: workRequest.service,
        preferredTiming: workRequest.preferredTiming,
        details: workRequest.details,
      })
      setWorkRequest({ service: '', preferredTiming: '', details: '' })
      setMessage("Your request was sent to Rabbit's Foot. We'll follow up shortly.")
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Your request could not be sent.')
    } finally {
      setRequestBusy(false)
    }
  }

  if (busy) {
    return (
      <main className="portal-shell portal-loading">
        <RefreshCw className="portal-spin" />
        <h1>Opening your Customer Hub…</h1>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="portal-shell portal-loading">
        <h1>Customer Hub unavailable</h1>
        <p>{error}</p>
        <button
          onClick={() => {
            setBusy(true)
            void load()
          }}
          type="button"
        >
          Try again
        </button>
      </main>
    )
  }

  return (
    <main className="portal-shell">
      <header className="portal-hero">
        <img alt="Rabbit's Foot Handyman Services" src="/rabbits-foot-logo.png" />
        <div>
          <p>RABBIT'S FOOT HANDYMAN SERVICES</p>
          <h1>Welcome, {data.customer.firstName}.</h1>
          <span>
            Review your work, appointments, estimates and invoices securely.
          </span>
        </div>
      </header>

      <nav aria-label="Contact Rabbit's Foot" className="portal-contact-bar">
        <span>Questions about your project?</span>
        <div>
          <a href={data.business.phoneTel}>Call {data.business.phoneDisplay}</a>
          <a href={data.business.phoneSms}>Text Rabbit&apos;s Foot</a>
          <a href={`mailto:${data.business.email}`}>Email us</a>
        </div>
      </nav>

      {message && (
        <div className="portal-message" role="status">
          {message}
        </div>
      )}

      <section className="portal-grid">
        <article className="portal-section">
          <header>
            <CalendarDays />
            <div>
              <p>APPOINTMENTS</p>
              <h2>Upcoming work</h2>
            </div>
          </header>
          {data.appointments.length ? (
            data.appointments
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((item) => (
                <div className="portal-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {new Date(item.startAt).toLocaleString([], {
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}
                    </span>
                    <span>{item.serviceAddress}</span>
                  </div>
                  <b>{item.status.replace('_', ' ')}</b>
                </div>
              ))
          ) : (
            <p className="portal-empty">No appointments are currently scheduled.</p>
          )}
        </article>

        <article className="portal-section">
          <header>
            <FileText />
            <div>
              <p>ESTIMATES</p>
              <h2>Review and approve</h2>
            </div>
          </header>
          {data.estimates.length ? (
            data.estimates.map((item) => (
              <div className="portal-document" key={item.id}>
                <div className="portal-doc-head">
                  <div>
                    <strong>
                      {item.estimateNumber} · {item.jobName}
                    </strong>
                    <span>{item.serviceAddress}</span>
                  </div>
                  <b>{money.format(item.total)}</b>
                </div>
                {item.scopeOfWork && <p>{item.scopeOfWork}</p>}
                <details>
                  <summary>View pricing</summary>
                  {item.lineItems?.map((line, index) => (
                    <div
                      className="portal-line"
                      key={`${line.description}-${index}`}
                    >
                      <span>
                        {line.description} × {line.quantity}
                      </span>
                      <b>{money.format(line.quantity * line.unitPrice)}</b>
                    </div>
                  ))}
                </details>
                {item.status === 'approved' ? (
                  <div className="portal-approved">
                    <CheckCircle2 /> Approved by {item.approval?.customerName}
                  </div>
                ) : (
                  <div className="portal-actions">
                    <button
                      onClick={() =>
                        setApproval({
                          estimateId: item.id,
                          name: `${data.customer.firstName} ${data.customer.lastName}`.trim(),
                          note: '',
                        })
                      }
                      type="button"
                    >
                      Approve estimate
                    </button>
                    <button
                      className="secondary"
                      onClick={() =>
                        setChange({ estimateId: item.id, message: '' })
                      }
                      type="button"
                    >
                      Request changes
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="portal-empty">No estimates are available.</p>
          )}
        </article>

        <article className="portal-section">
          <header>
            <Hammer />
            <div>
              <p>JOBS</p>
              <h2>Work progress</h2>
            </div>
          </header>
          {data.jobs.length ? (
            data.jobs.map((item) => (
              <div className="portal-row" key={item.id}>
                <div>
                  <strong>{item.jobName}</strong>
                  <span>{item.jobNumber}</span>
                  {item.scopeOfWork && <span>{item.scopeOfWork}</span>}
                </div>
                <b>{item.status.replace('_', ' ')}</b>
              </div>
            ))
          ) : (
            <p className="portal-empty">No active jobs are available.</p>
          )}
        </article>

        <article className="portal-section">
          <header>
            <CreditCard />
            <div>
              <p>INVOICES</p>
              <h2>Balances and payment</h2>
            </div>
          </header>
          {data.invoices.length ? (
            data.invoices.map((item) => (
              <div className="portal-document" key={item.id}>
                <div className="portal-doc-head">
                  <div>
                    <strong>
                      {item.invoiceNumber} · {item.jobName}
                    </strong>
                    <span>
                      Due{' '}
                      {new Date(`${item.dueDate}T12:00:00`).toLocaleDateString()}
                    </span>
                  </div>
                  <b>{money.format(item.balance)}</b>
                </div>
                {item.lineItems?.map((lineItem, index) => (
                  <div className="portal-line" key={`${item.id}-${index}`}>
                    <span>{lineItem.description} × {lineItem.quantity}</span>
                    <strong>{money.format(lineItem.quantity * lineItem.unitPrice)}</strong>
                  </div>
                ))}
                {item.payments.length > 0 && (
                  <div className="portal-payment-history">
                    <strong>Payment history</strong>
                    {item.payments.map((payment) => (
                      <span key={payment.id}>
                        {new Date(`${payment.date}T12:00:00`).toLocaleDateString()} · {money.format(payment.amount)} · {payment.method}
                      </span>
                    ))}
                  </div>
                )}
                {item.balance <= 0 ? (
                  <div className="portal-approved">
                    <CheckCircle2 /> Paid
                  </div>
                ) : (
                  <button
                    className="portal-pay"
                    disabled={paymentInvoiceId === item.id}
                    onClick={() => setPaymentConfirmation(item)}
                    type="button"
                  >
                    {paymentInvoiceId === item.id
                      ? 'Opening secure Square checkout…'
                      : 'Pay securely with Square'}
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="portal-empty">No invoices are available.</p>
          )}
        </article>

        <article className="portal-section portal-request-work">
          <header>
            <MessageSquarePlus />
            <div>
              <p>REQUEST MORE WORK</p>
              <h2>Need help with another project?</h2>
            </div>
          </header>
          <p className="portal-empty">
            Send the details here. Your contact information is already connected.
          </p>
          <label>
            Service needed
            <input
              placeholder="Door repair, painting, drywall..."
              value={workRequest.service}
              onChange={(event) => setWorkRequest({ ...workRequest, service: event.target.value })}
            />
          </label>
          <label>
            Preferred timing (optional)
            <input
              placeholder="This week, before Friday, flexible..."
              value={workRequest.preferredTiming}
              onChange={(event) => setWorkRequest({ ...workRequest, preferredTiming: event.target.value })}
            />
          </label>
          <label>
            Project details
            <textarea
              placeholder="Describe the work, location, measurements, or anything we should know."
              rows={4}
              value={workRequest.details}
              onChange={(event) => setWorkRequest({ ...workRequest, details: event.target.value })}
            />
          </label>
          <button disabled={requestBusy} onClick={() => void requestMoreWork()} type="button">
            {requestBusy ? 'Sending request...' : 'Request an estimate'}
          </button>
        </article>
      </section>

      <footer className="portal-footer">
        Secure link expires {new Date(data.expiresAt).toLocaleDateString()} ·
        {data.business.name} · {data.business.phoneDisplay}
      </footer>

      {approval && (
        <div className="portal-modal">
          <section aria-modal="true" role="dialog">
            <h2>Approve estimate</h2>
            <p>This records your acceptance of the displayed scope and price.</p>
            <label>
              Your full name
              <input
                value={approval.name}
                onChange={(event) =>
                  setApproval({ ...approval, name: event.target.value })
                }
              />
            </label>
            <label>
              Approval note (optional)
              <textarea
                value={approval.note}
                onChange={(event) =>
                  setApproval({ ...approval, note: event.target.value })
                }
              />
            </label>
            <div>
              <button onClick={() => void approve()} type="button">
                Approve
              </button>
              <button
                className="secondary"
                onClick={() => setApproval(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {paymentConfirmation && (
        <div className="portal-modal">
          <section aria-labelledby="card-payment-title" aria-modal="true" role="dialog">
            <h2 id="card-payment-title">Confirm card payment</h2>
            <p>Review the amount before continuing to Square&apos;s secure checkout.</p>
            <div className="portal-payment-summary">
              <span>Invoice balance <strong>{money.format(paymentConfirmation.balance)}</strong></span>
              <span>Card processing fee ({paymentConfirmation.cardProcessingFeePercent.toFixed(1)}%) <strong>{money.format(paymentConfirmation.cardFeeAmount)}</strong></span>
              <span className="portal-payment-total">Card total <strong>{money.format(paymentConfirmation.cardCheckoutTotal)}</strong></span>
            </div>
            <p className="portal-payment-note">This fee applies only to card checkout. Contact Rabbit&apos;s Foot to pay by cash or check without this card fee.</p>
            <div>
              <button
                disabled={paymentInvoiceId === paymentConfirmation.id}
                onClick={() => void payInvoice(paymentConfirmation)}
                type="button"
              >
                {paymentInvoiceId === paymentConfirmation.id ? 'Opening Square…' : 'Continue to Square'}
              </button>
              <button
                className="secondary"
                disabled={paymentInvoiceId === paymentConfirmation.id}
                onClick={() => setPaymentConfirmation(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {change && (
        <div className="portal-modal">
          <section aria-modal="true" role="dialog">
            <h2>Request changes</h2>
            <label>
              What should Rabbit's Foot change?
              <textarea
                autoFocus
                rows={5}
                value={change.message}
                onChange={(event) =>
                  setChange({ ...change, message: event.target.value })
                }
              />
            </label>
            <div>
              <button onClick={() => void requestChange()} type="button">
                Send request
              </button>
              <button
                className="secondary"
                onClick={() => setChange(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
