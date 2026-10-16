import { type FormEvent, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
  Download,
  FileWarning,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'

import { APP_VERSION } from '../../../config/release'
import { useCloudSync } from '../../cloud/cloudSyncContext'
import { DATA_REFRESHED_EVENT, loadSyncQueue } from '../../cloud/syncQueue'
import {
  getPhotoUploadSummary,
  retryAllPhotoUploads,
} from '../../photos/data/photoStore'
import {
  clearResolvedReliabilityEvents,
  loadReliabilityEvents,
  RELIABILITY_UPDATED_EVENT,
  resolveReliabilityEvent,
} from '../data/reliabilityStore'
import { createSupportReport } from '../data/supportReportStore'
import { createDiagnosticSnapshot } from '../services/diagnosticSnapshot'
import type { SupportReportCategory } from '../types'
import './ReliabilityCenter.css'

const categoryLabels: Record<SupportReportCategory, string> = {
  authentication: 'Account or email authentication',
  cloud_sync: 'Cloud sync or missing records',
  receipt_or_photo: 'Receipt or photo attachment',
  app_crash: 'App crash or frozen screen',
  other: 'Something else',
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ReliabilityCenter() {
  const {
    errorMessage,
    lastAttemptAt,
    lastSyncedAt,
    organizationId,
    pendingRecordCount,
    status,
    syncNow,
  } = useCloudSync()
  const [, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<SupportReportCategory>('other')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)

  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1)
    window.addEventListener(RELIABILITY_UPDATED_EVENT, refresh)
    window.addEventListener(DATA_REFRESHED_EVENT, refresh)
    return () => {
      window.removeEventListener(RELIABILITY_UPDATED_EVENT, refresh)
      window.removeEventListener(DATA_REFRESHED_EVENT, refresh)
    }
  }, [])

  const events = loadReliabilityEvents()
  const unresolvedEvents = events.filter((event) => event.resolvedAt === null)
  const unresolvedErrors = unresolvedEvents.filter((event) => event.severity === 'error')
  const photoSummary = getPhotoUploadSummary()
  const queueSummary = (() => {
    const queue = loadSyncQueue()
    return queue.reduce<Record<string, number>>((result, change) => {
      result[change.recordType] = (result[change.recordType] ?? 0) + 1
      return result
    }, {})
  })()

  const needsAttention = status === 'error' || photoSummary.error > 0 || unresolvedErrors.length > 0
  const healthTitle = !navigator.onLine
    ? 'Your work is safe on this device'
    : needsAttention
      ? 'Some items need attention'
      : pendingRecordCount > 0 || photoSummary.queued > 0
        ? 'Protection is in progress'
        : 'Owner Hub is protected'
  const HealthIcon = !navigator.onLine
    ? WifiOff
    : needsAttention
      ? AlertTriangle
      : ShieldCheck

  function diagnostics() {
    return createDiagnosticSnapshot({
      cloudStatus: status,
      cloudError: errorMessage,
      lastAttemptAt,
      lastSyncedAt,
      organizationConnected: Boolean(organizationId),
    })
  }

  async function synchronizeNow() {
    setBusy(true)
    setMessage('Checking cloud protection and retrying queued work…')
    await syncNow()
    setRevision((current) => current + 1)
    setMessage('Sync check finished. Review the status cards below.')
    setBusy(false)
  }

  async function retryUploads() {
    const retryCount = retryAllPhotoUploads()
    if (retryCount === 0) {
      setMessage('There are no failed photo or receipt uploads to retry.')
      return
    }

    setBusy(true)
    setMessage(`Retrying ${retryCount} attachment${retryCount === 1 ? '' : 's'}…`)
    await syncNow()
    setRevision((current) => current + 1)
    setMessage('Attachment retry finished. Any remaining issue is listed below.')
    setBusy(false)
  }

  function downloadDiagnostics() {
    const blob = new Blob([JSON.stringify(diagnostics(), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `owner-hub-diagnostics-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Private diagnostics downloaded. They do not include passwords or access tokens.')
  }

  async function submitProblemReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!summary.trim() || !details.trim()) {
      setMessage('Add a short summary and explain what happened before sending the report.')
      return
    }

    createSupportReport({
      category,
      summary,
      details,
      includeDiagnostics,
      diagnostics: includeDiagnostics ? diagnostics() : null,
    })
    setSummary('')
    setDetails('')
    setBusy(true)
    setMessage('Problem report saved privately and queued for secure cloud delivery…')
    await syncNow()
    setRevision((current) => current + 1)
    setMessage('Problem report saved. It will remain queued safely if the device is offline.')
    setBusy(false)
  }

  return (
    <section className="reliability-page">
      <header className={`reliability-hero ${needsAttention ? 'needs-attention' : ''}`}>
        <div>
          <span className="eyebrow">COMMERCIAL-READY PROTECTION · VERSION {APP_VERSION}</span>
          <h1>{healthTitle}</h1>
          <p>See exactly what is protected, what is waiting, and what needs a retry—without exposing customer records in diagnostic logs.</p>
        </div>
        <HealthIcon aria-hidden="true" size={54} />
      </header>

      {message ? <p className="reliability-message" role="status">{message}</p> : null}

      <div className="reliability-status-grid">
        <article>
          <CloudCog aria-hidden="true" />
          <span>Cloud status</span>
          <strong>{status.replace('_', ' ')}</strong>
          <small>Last protected: {formatDateTime(lastSyncedAt)}</small>
        </article>
        <article>
          <RefreshCw aria-hidden="true" />
          <span>Business records queued</span>
          <strong>{pendingRecordCount}</strong>
          <small>Last attempt: {formatDateTime(lastAttemptAt)}</small>
        </article>
        <article className={photoSummary.error > 0 ? 'warning' : ''}>
          <FileWarning aria-hidden="true" />
          <span>Attachment failures</span>
          <strong>{photoSummary.error}</strong>
          <small>{photoSummary.queued} waiting · {photoSummary.uploaded} protected</small>
        </article>
        <article className={unresolvedErrors.length > 0 ? 'warning' : ''}>
          <AlertTriangle aria-hidden="true" />
          <span>Unresolved errors</span>
          <strong>{unresolvedErrors.length}</strong>
          <small>{unresolvedEvents.length} total items need review</small>
        </article>
      </div>

      <div className="reliability-actions">
        <button disabled={busy || status === 'syncing'} onClick={() => void synchronizeNow()} type="button">
          <RefreshCw aria-hidden="true" /> Sync and verify now
        </button>
        <button disabled={busy || photoSummary.error === 0} onClick={() => void retryUploads()} type="button">
          <RotateCcw aria-hidden="true" /> Retry failed attachments
        </button>
        <button onClick={downloadDiagnostics} type="button">
          <Download aria-hidden="true" /> Download private diagnostics
        </button>
      </div>

      <section className="reliability-panel">
        <header>
          <div><span className="eyebrow">SAFE QUEUE</span><h2>Waiting for cloud protection</h2></div>
          <b>{Object.values(queueSummary).reduce((sum, count) => sum + count, 0)}</b>
        </header>
        {Object.keys(queueSummary).length === 0 ? (
          <div className="reliability-empty"><CheckCircle2 aria-hidden="true" /><strong>Nothing is waiting.</strong><span>The newest saved records are protected.</span></div>
        ) : (
          <div className="queue-breakdown">
            {Object.entries(queueSummary).sort((a, b) => b[1] - a[1]).map(([recordType, count]) => (
              <span key={recordType}><b>{count}</b>{recordType.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}
      </section>

      <section className="reliability-panel">
        <header>
          <div><span className="eyebrow">RECENT DIAGNOSTICS</span><h2>Problems Owner Hub detected</h2></div>
          <button className="text-button" onClick={() => { clearResolvedReliabilityEvents(); setRevision((current) => current + 1) }} type="button">Clear resolved</button>
        </header>
        {events.length === 0 ? (
          <div className="reliability-empty"><CheckCircle2 aria-hidden="true" /><strong>No detected problems.</strong><span>Automatic monitoring is active.</span></div>
        ) : (
          <div className="reliability-events">
            {events.slice(0, 50).map((event) => (
              <article className={`${event.severity} ${event.resolvedAt ? 'resolved' : ''}`} key={event.id}>
                <div><strong>{event.message}</strong><span>{event.area} · {formatDateTime(event.lastSeenAt)}{event.occurrences > 1 ? ` · ${event.occurrences} times` : ''}</span>{event.detail ? <small>{event.detail}</small> : null}</div>
                {!event.resolvedAt ? <button onClick={() => { resolveReliabilityEvent(event.id); setRevision((current) => current + 1) }} type="button">Mark resolved</button> : <span className="resolved-label">Resolved</span>}
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="reliability-panel problem-report" onSubmit={(event) => void submitProblemReport(event)}>
        <header><div><span className="eyebrow">IN-APP SUPPORT</span><h2>Report a problem</h2><p>Describe what you expected and what happened. A private diagnostic snapshot can be attached without passwords, tokens, customer emails, or phone numbers.</p></div></header>
        <div className="problem-report-grid">
          <label><span>Problem type</span><select onChange={(event) => setCategory(event.target.value as SupportReportCategory)} value={category}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Short summary</span><input maxLength={160} onChange={(event) => setSummary(event.target.value)} placeholder="Receipt would not attach" value={summary} /></label>
          <label className="wide"><span>What happened?</span><textarea maxLength={5000} onChange={(event) => setDetails(event.target.value)} placeholder="Tell us the steps you took and what appeared on screen." value={details} /></label>
          <label className="diagnostic-check"><input checked={includeDiagnostics} onChange={(event) => setIncludeDiagnostics(event.target.checked)} type="checkbox" /><span>Include privacy-safe diagnostics so the problem can be fixed faster.</span></label>
        </div>
        <button className="send-report-button" disabled={busy} type="submit"><Send aria-hidden="true" /> Send private problem report</button>
      </form>
    </section>
  )
}
