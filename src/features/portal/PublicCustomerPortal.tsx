import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  Hammer,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

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
}

type PortalData = {
  expiresAt: string
  customer: { firstName: string; lastName: string }
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

  const load = useCallback(async () => {
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
      setError('')
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
                {item.balance <= 0 ? (
                  <div className="portal-approved">
                    <CheckCircle2 /> Paid
                  </div>
                ) : (
                  <button
                    className="portal-pay"
                    disabled={paymentInvoiceId === item.id}
                    onClick={() => void payInvoice(item)}
                    type="button"
                  >
                    {paymentInvoiceId === item.id
                      ? 'Opening secure Square checkout…'
                      : `Pay ${money.format(item.balance)} securely with Square`}
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="portal-empty">No invoices are available.</p>
          )}
        </article>
      </section>

      <footer className="portal-footer">
        Secure link expires {new Date(data.expiresAt).toLocaleDateString()} ·
        Rabbit's Foot Handyman Services · 574-703-5978
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
