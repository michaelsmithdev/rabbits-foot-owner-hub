import {
  Camera,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileText,
  Pause,
  Play,
  Plus,
  Receipt,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { loadCustomers } from '../../customers/data/customerStore'
import { createInvoiceNumber, loadInvoices, saveInvoices } from '../../invoices/data/invoiceStore'
import type { Invoice } from '../../invoices/types/Invoice'
import { queuePhotoFiles } from '../../photos/data/photoStore'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import VoiceCapture from '../../voice/components/VoiceCapture'
import { actualJobHours, loadJobs, saveJobs } from '../data/jobStore'
import type { Job, JobExpenseCategory } from '../types/Job'
import './Jobs.css'
import './JobsEnhancements.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function createId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function Jobs() {
  const customers = useMemo(() => loadCustomers(), [])
  const settings = loadBusinessSettings()
  const [jobs, setJobs] = useState<Job[]>(loadJobs)
  const [selectedId, setSelectedId] = useState(() => loadJobs()[0]?.id ?? '')
  const [clock, setClock] = useState(() => Date.now())
  const [message, setMessage] = useState('')
  const [expense, setExpense] = useState({ category: 'materials' as JobExpenseCategory, description: '', vendor: '', notes: '', amount: 0, billable: false })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null
  const customer = selectedJob ? customers.find((item) => item.id === selectedJob.customerId) : null
  const activeTimer = selectedJob?.timeEntries.some((entry) => !entry.endedAt) ?? false

  useEffect(() => {
    if (!activeTimer) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [activeTimer])

  function updateJob(jobId: string, update: (job: Job) => Job) {
    const next = jobs.map((job) => job.id === jobId ? update({ ...job, updatedAt: new Date().toISOString() }) : job)
    setJobs(next)
    saveJobs(next)
  }

  function startTimer(job: Job) {
    if (job.timeEntries.some((entry) => !entry.endedAt)) return
    updateJob(job.id, (current) => ({ ...current, status: 'in_progress', timeEntries: [...current.timeEntries, { id: createId(), startedAt: new Date().toISOString(), endedAt: null }] }))
    setMessage('Job timer started and saved.')
  }

  function pauseTimer(job: Job) {
    const endedAt = new Date().toISOString()
    updateJob(job.id, (current) => ({ ...current, status: 'paused', timeEntries: current.timeEntries.map((entry) => entry.endedAt ? entry : { ...entry, endedAt }) }))
    setMessage('Job timer paused. Time is saved.')
  }

  async function addJobPhotos(job: Job, files: File[]) {
    if (!files.length) return
    try {
      const photos = await queuePhotoFiles(files.slice(0, 10), {
        customerId: job.customerId,
        jobName: job.jobName,
        category: 'progress',
        caption: `${job.jobNumber} job progress`,
        capturedAt: new Date().toISOString(),
      })
      updateJob(job.id, (current) => ({ ...current, photoIds: [...current.photoIds, ...photos.map((photo) => photo.id)] }))
      setMessage(`${photos.length} job photo${photos.length === 1 ? '' : 's'} saved.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The job photos could not be saved.')
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  async function addExpense(job: Job) {
    if (!expense.description.trim() || expense.amount <= 0) {
      setMessage('Enter an expense description and amount.')
      return
    }
    let receiptPhotoIds: string[] = []
    try {
      if (receiptFile) {
        const receipts = await queuePhotoFiles([receiptFile], {
          customerId: job.customerId,
          jobName: job.jobName,
          category: 'receipt',
          caption: expense.description.trim(),
          capturedAt: new Date().toISOString(),
        })
        receiptPhotoIds = receipts.map((photo) => photo.id)
      }
      const createdAt = new Date().toISOString()
      updateJob(job.id, (current) => ({
        ...current,
        expenses: [...current.expenses, { id: createId(), ...expense, description: expense.description.trim(), amount: Math.round(expense.amount * 100) / 100, receiptPhotoIds, createdAt }],
      }))
      setExpense({ category: 'materials', description: '', vendor: '', notes: '', amount: 0, billable: false })
      setReceiptFile(null)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
      setMessage('Expense and receipt saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The expense could not be saved.')
    }
  }

  function completeJob(job: Job) {
    const endedAt = new Date().toISOString()
    updateJob(job.id, (current) => {
      const timeEntries = current.timeEntries.map((entry) => entry.endedAt ? entry : { ...entry, endedAt })
      const completedJob = { ...current, timeEntries }
      const actualLaborHours = actualJobHours(completedJob, new Date(endedAt).getTime())
      const actualLaborCost = actualLaborHours * settings.defaultLaborRate
      const actualMaterialCost = current.expenses
        .filter((item) => item.category === 'materials')
        .reduce((sum, item) => sum + item.amount, 0)
      const actualExpenseCost = current.expenses.reduce((sum, item) => sum + item.amount, 0)
      const actualCost = actualLaborCost + actualExpenseCost
      const estimatedProfit = current.quotedPrice - current.estimatedCost
      const actualProfit = current.quotedPrice - actualCost

      return {
        ...completedJob,
        status: 'completed',
        completedAt: endedAt,
        profitability: {
          estimatedLaborHours: current.estimatedLaborHours,
          actualLaborHours,
          estimatedLaborCost: current.estimatedLaborCost,
          actualLaborCost,
          estimatedMaterialCost: current.estimatedMaterialCost,
          actualMaterialCost,
          estimatedCost: current.estimatedCost,
          actualCost,
          estimatedProfit,
          actualProfit,
          estimatedMargin: current.quotedPrice > 0 ? estimatedProfit / current.quotedPrice * 100 : 0,
          actualMargin: current.quotedPrice > 0 ? actualProfit / current.quotedPrice * 100 : 0,
          capturedAt: endedAt,
        },
      }
    })
    setMessage('Job marked complete. Review actual profit, then create the final invoice.')
  }

  function createInvoice(job: Job) {
    const invoices = loadInvoices()
    const existing = invoices.find((invoice) => invoice.jobId === job.id || invoice.estimateId === job.estimateId)
    if (existing) {
      updateJob(job.id, (current) => ({ ...current, invoiceId: existing.id, status: 'invoiced' }))
      window.alert(`${existing.invoiceNumber} already covers this job.`)
      return
    }
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + settings.invoiceDueDays)
    const timestamp = now.toISOString()
    const invoice: Invoice = {
      id: createId(),
      invoiceNumber: createInvoiceNumber(invoices, settings.invoicePrefix),
      customerId: job.customerId,
      estimateId: job.estimateId,
      jobId: job.id,
      jobName: job.jobName,
      serviceAddress: job.serviceAddress,
      description: job.description,
      scopeOfWork: job.scopeOfWork,
      exclusions: job.exclusions,
      issueDate: timestamp.slice(0, 10),
      dueDate: dueDate.toISOString().slice(0, 10),
      lineItems: [
        ...job.lineItems.map((item) => ({ ...item, id: createId() })),
        ...job.expenses.filter((item) => item.billable).map((item) => ({ id: createId(), description: item.description, quantity: 1, unit: item.category, unitPrice: item.amount })),
      ],
      taxRate: job.taxRate,
      discount: job.discount,
      notes: settings.invoiceTerms,
      completionDate: job.completedAt?.slice(0, 10),
      photoIds: [...job.photoIds],
      status: 'draft',
      payments: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      paidAt: null,
    }
    saveInvoices([invoice, ...invoices])
    updateJob(job.id, (current) => ({ ...current, invoiceId: invoice.id, status: 'invoiced' }))
    setMessage(`${invoice.invoiceNumber} created. Open Documents to review and send it.`)
  }

  if (!selectedJob) {
    return <div className="jobs-page"><header className="page-heading"><div><span className="eyebrow">RUN THE JOB</span><h1>Jobs</h1><p>Approve an estimate, then use Create job to open the field workflow.</p></div></header><div className="empty-state"><Clock3 size={44} /><h2>No jobs yet</h2><p>Approved estimates become job workspaces with time, expenses, photos, and final invoicing.</p></div></div>
  }

  const hours = actualJobHours(selectedJob, clock)
  const expenseTotal = selectedJob.expenses.reduce((sum, item) => sum + item.amount, 0)
  const actualCost = hours * settings.defaultLaborRate + expenseTotal
  const profit = selectedJob.quotedPrice - actualCost
  const margin = selectedJob.quotedPrice > 0 ? profit / selectedJob.quotedPrice * 100 : 0

  return (
    <div className="jobs-page">
      <header className="page-heading"><div><span className="eyebrow">RUN THE JOB</span><h1>Job Mode</h1><p>Track field time, photos, voice notes, costs, completion, and the final invoice.</p></div><div className="metric-card"><strong>{jobs.filter((job) => !['completed','invoiced'].includes(job.status)).length}</strong><span>Active jobs</span></div></header>
      {message && <div className="job-message" role="status">{message}</div>}
      <div className="job-layout">
        <aside className="job-list">{jobs.map((job) => <button className={job.id === selectedJob.id ? 'active' : ''} key={job.id} onClick={() => setSelectedId(job.id)} type="button"><span>{job.jobNumber}</span><strong>{job.jobName}</strong><small>{job.status.replace('_', ' ')}</small></button>)}</aside>
        <main className="job-workspace">
          <header className="job-header"><div><span className={`job-status ${selectedJob.status}`}>{selectedJob.status.replace('_', ' ')}</span><h2>{selectedJob.jobName}</h2><p>{customer ? `${customer.firstName} ${customer.lastName} · ` : ''}{selectedJob.serviceAddress}</p></div><div className="job-timer"><span>Actual time</span><strong>{hours.toFixed(2)} hr</strong></div></header>
          <section className="job-brief">
            <article><span>Approved job price</span><strong>{currency.format(selectedJob.quotedPrice)}</strong></article>
            <article className="job-brief-wide"><span>Scope of work</span><p>{selectedJob.scopeOfWork || selectedJob.description}</p></article>
            {selectedJob.materials.length > 0 && <article className="job-brief-wide"><span>Planned materials</span><p>{selectedJob.materials.join(' · ')}</p></article>}
            {selectedJob.exclusions.length > 0 && <article className="job-brief-wide"><span>Exclusions</span><p>{selectedJob.exclusions.join(' · ')}</p></article>}
            <label className="job-brief-wide"><span>Internal job notes</span><textarea onChange={(event) => updateJob(selectedJob.id, (current) => ({ ...current, internalNotes: event.target.value }))} placeholder="Crew instructions, access details, reminders..." value={selectedJob.internalNotes} /></label>
          </section>
          <div className="job-primary-actions">
            {activeTimer ? <button className="pause" onClick={() => pauseTimer(selectedJob)} type="button"><Pause /> Pause work</button> : !['completed','invoiced'].includes(selectedJob.status) && <button onClick={() => startTimer(selectedJob)} type="button"><Play /> Start work</button>}
            <input accept="image/*" capture="environment" hidden multiple onChange={(event) => void addJobPhotos(selectedJob, Array.from(event.target.files ?? []))} ref={photoInputRef} type="file" />
            <button className="secondary" onClick={() => photoInputRef.current?.click()} type="button"><Camera /> Job photo</button>
            {!['completed','invoiced'].includes(selectedJob.status) && <button className="complete" onClick={() => completeJob(selectedJob)} type="button"><CheckCircle2 /> Complete</button>}
          </div>

          <section className="job-profit-grid"><article><Clock3 /><span>Estimated / actual hours</span><strong>{selectedJob.estimatedLaborHours.toFixed(1)} / {hours.toFixed(2)}</strong></article><article><Receipt /><span>Job expenses</span><strong>{currency.format(expenseTotal)}</strong></article><article><DollarSign /><span>Actual cost</span><strong>{currency.format(actualCost)}</strong></article><article className={margin < settings.targetGrossMarginPercent ? 'warning' : ''}><strong>{margin.toFixed(1)}%</strong><span>Actual margin · {currency.format(profit)} profit</span></article></section>

          {selectedJob.profitability && <section className="job-section job-profit-comparison"><h3>Estimated vs. actual profitability</h3><div><span>Labor hours</span><strong>{selectedJob.profitability.estimatedLaborHours.toFixed(2)}</strong><strong>{selectedJob.profitability.actualLaborHours.toFixed(2)}</strong></div><div><span>Labor cost</span><strong>{currency.format(selectedJob.profitability.estimatedLaborCost)}</strong><strong>{currency.format(selectedJob.profitability.actualLaborCost)}</strong></div><div><span>Material cost</span><strong>{currency.format(selectedJob.profitability.estimatedMaterialCost)}</strong><strong>{currency.format(selectedJob.profitability.actualMaterialCost)}</strong></div><div><span>Total cost</span><strong>{currency.format(selectedJob.profitability.estimatedCost)}</strong><strong>{currency.format(selectedJob.profitability.actualCost)}</strong></div><div><span>Profit</span><strong>{currency.format(selectedJob.profitability.estimatedProfit)}</strong><strong>{currency.format(selectedJob.profitability.actualProfit)}</strong></div><div><span>Margin</span><strong>{selectedJob.profitability.estimatedMargin.toFixed(1)}%</strong><strong>{selectedJob.profitability.actualMargin.toFixed(1)}%</strong></div><footer><span>Metric</span><span>Estimated</span><span>Actual</span></footer></section>}

          <section className="job-section"><h3>Field voice notes</h3><VoiceCapture label="Record job note" notes={selectedJob.voiceNotes} onChange={(voiceNotes) => updateJob(selectedJob.id, (current) => ({ ...current, voiceNotes }))} /></section>

          <section className="job-section"><h3>Add expense</h3><div className="expense-form"><select onChange={(event) => setExpense({ ...expense, category: event.target.value as JobExpenseCategory })} value={expense.category}>{['materials','delivery','disposal','equipment','subcontractor','other'].map((category) => <option key={category}>{category}</option>)}</select><input onChange={(event) => setExpense({ ...expense, description: event.target.value })} placeholder="What was purchased?" value={expense.description} /><input onChange={(event) => setExpense({ ...expense, vendor: event.target.value })} placeholder="Vendor" value={expense.vendor} /><input min="0" onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} step="0.01" type="number" value={expense.amount} /><input className="expense-notes" onChange={(event) => setExpense({ ...expense, notes: event.target.value })} placeholder="Expense notes (optional)" value={expense.notes} /><label><input checked={expense.billable} onChange={(event) => setExpense({ ...expense, billable: event.target.checked })} type="checkbox" /> Add to invoice</label><input accept="image/*" capture="environment" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} ref={receiptInputRef} type="file" /><button onClick={() => void addExpense(selectedJob)} type="button"><Plus size={17} /> Save expense</button></div><div className="expense-list">{selectedJob.expenses.map((item) => <div key={item.id}><span>{item.category} · {item.description}{item.vendor ? ` · ${item.vendor}` : ''}{item.billable ? ' · billable' : ''}{item.notes ? <small>{item.notes}</small> : null}</span><strong>{currency.format(item.amount)}</strong></div>)}</div></section>

          {['completed','invoiced'].includes(selectedJob.status) && <section className="job-invoice-callout"><div><span className="eyebrow">PAID WORKFLOW</span><h3>{selectedJob.invoiceId ? 'Final invoice created' : 'Job complete and ready to bill'}</h3><p>Actual costs remain internal. The customer invoice uses the approved scope plus marked billable expenses.</p></div><button disabled={Boolean(selectedJob.invoiceId)} onClick={() => createInvoice(selectedJob)} type="button"><FileText size={19} /> {selectedJob.invoiceId ? 'Invoice created' : 'Create final invoice'}</button></section>}
        </main>
      </div>
    </div>
  )
}
