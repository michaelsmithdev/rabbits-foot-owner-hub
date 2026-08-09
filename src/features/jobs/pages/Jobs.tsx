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
import { approvedChangeOrderTotal, jobRevenue } from '../utils/jobMath'
import type { Job, JobChangeOrder, JobExpenseCategory, JobMaterialItem } from '../types/Job'
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
  const [changeOrder, setChangeOrder] = useState({ discoveredCondition: '', additionalWork: '', additionalMaterial: '', estimatedMaterialCost: 0, additionalLaborHours: 0, priceChange: 0, scheduleImpact: '' })
  const [changeApprovalId, setChangeApprovalId] = useState<string | null>(null)
  const [changeApprovalName, setChangeApprovalName] = useState('')
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
    const otherRunningJob = jobs.find((item) => item.id !== job.id && item.timeEntries.some((entry) => !entry.endedAt))
    if (otherRunningJob) {
      setMessage(`Pause ${otherRunningJob.jobNumber} before starting another timer.`)
      return
    }
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

  function updateMaterial(job: Job, materialId: string, patch: Partial<JobMaterialItem>) {
    updateJob(job.id, (current) => ({
      ...current,
      materialChecklist: current.materialChecklist.map((item) => item.id === materialId ? { ...item, ...patch } : item),
    }))
  }

  function saveChangeOrder(job: Job) {
    if (['completed', 'invoiced'].includes(job.status)) {
      setMessage('This job is complete. Create a new revision before adding more work.')
      return
    }
    if (!changeOrder.discoveredCondition.trim() || !changeOrder.additionalWork.trim() || changeOrder.priceChange <= 0) {
      setMessage('Describe the discovered condition, added work, and positive customer price.')
      return
    }
    const createdAt = new Date().toISOString()
    const draft: JobChangeOrder = {
      id: createId(),
      discoveredCondition: changeOrder.discoveredCondition.trim(),
      additionalWork: changeOrder.additionalWork.trim(),
      additionalMaterial: changeOrder.additionalMaterial.trim(),
      estimatedMaterialCost: Math.max(0, changeOrder.estimatedMaterialCost),
      additionalLaborHours: Math.max(0, changeOrder.additionalLaborHours),
      priceChange: Math.round(changeOrder.priceChange * 100) / 100,
      scheduleImpact: changeOrder.scheduleImpact.trim(),
      status: 'draft',
      createdAt,
    }
    updateJob(job.id, (current) => ({ ...current, changeOrders: [...current.changeOrders, draft] }))
    setChangeOrder({ discoveredCondition: '', additionalWork: '', additionalMaterial: '', estimatedMaterialCost: 0, additionalLaborHours: 0, priceChange: 0, scheduleImpact: '' })
    setMessage('Change-order draft saved. Record customer approval before billing it.')
  }

  function approveChangeOrder(job: Job, changeOrderId: string) {
    if (['completed', 'invoiced'].includes(job.status)) {
      setMessage('Completed job economics are locked. Reopen through a new revision before approving changes.')
      return
    }
    const approvedBy = changeApprovalName.trim()
    if (!approvedBy) return
    const approvedAt = new Date().toISOString()
    updateJob(job.id, (current) => ({
      ...current,
      changeOrders: current.changeOrders.map((item) => item.id === changeOrderId ? { ...item, status: 'approved', approvedBy, approvedAt } : item),
    }))
    setChangeApprovalId(null)
    setChangeApprovalName('')
    setMessage('Customer approval recorded. The change will flow into profitability and the final invoice.')
  }

  function declineChangeOrder(job: Job, changeOrderId: string) {
    updateJob(job.id, (current) => ({
      ...current,
      changeOrders: current.changeOrders.map((item) => item.id === changeOrderId ? { ...item, status: 'declined' } : item),
    }))
    setMessage('Change order marked declined and excluded from billing.')
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
      const changeOrderTotal = approvedChangeOrderTotal(current.changeOrders)
      const revenue = current.quotedPrice + changeOrderTotal
      const approvedChanges = current.changeOrders.filter((item) => item.status === 'approved')
      const changeLaborHours = approvedChanges.reduce((sum, item) => sum + item.additionalLaborHours, 0)
      const changeLaborCost = changeLaborHours * settings.defaultLaborRate
      const changeMaterialCost = approvedChanges.reduce((sum, item) => sum + item.estimatedMaterialCost, 0)
      const updatedEstimatedCost = current.estimatedCost + changeLaborCost + changeMaterialCost
      const estimatedProfit = revenue - updatedEstimatedCost
      const actualProfit = revenue - actualCost

      return {
        ...completedJob,
        status: 'completed',
        completedAt: endedAt,
        profitability: {
          estimatedLaborHours: current.estimatedLaborHours + changeLaborHours,
          actualLaborHours,
          estimatedLaborCost: current.estimatedLaborCost + changeLaborCost,
          actualLaborCost,
          estimatedMaterialCost: current.estimatedMaterialCost + changeMaterialCost,
          actualMaterialCost,
          estimatedCost: updatedEstimatedCost,
          actualCost,
          estimatedProfit,
          actualProfit,
          estimatedMargin: revenue > 0 ? estimatedProfit / revenue * 100 : 0,
          actualMargin: revenue > 0 ? actualProfit / revenue * 100 : 0,
          approvedChangeOrderTotal: changeOrderTotal,
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
        ...job.changeOrders.filter((item) => item.status === 'approved').map((item) => ({ id: createId(), description: `Approved change order: ${item.additionalWork}`, quantity: 1, unit: 'change', unitPrice: item.priceChange })),
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
  const revenue = jobRevenue(selectedJob)
  const changeOrderTotal = approvedChangeOrderTotal(selectedJob.changeOrders)
  const profit = revenue - actualCost
  const margin = revenue > 0 ? profit / revenue * 100 : 0

  return (
    <div className="jobs-page">
      <header className="page-heading"><div><span className="eyebrow">RUN THE JOB</span><h1>Job Mode</h1><p>Track field time, photos, voice notes, costs, completion, and the final invoice.</p></div><div className="metric-card"><strong>{jobs.filter((job) => !['completed','invoiced'].includes(job.status)).length}</strong><span>Active jobs</span></div></header>
      {message && <div className="job-message" role="status">{message}</div>}
      <div className="job-layout">
        <aside className="job-list">{jobs.map((job) => <button className={job.id === selectedJob.id ? 'active' : ''} key={job.id} onClick={() => setSelectedId(job.id)} type="button"><span>{job.jobNumber}</span><strong>{job.jobName}</strong><small>{job.status.replace('_', ' ')}</small></button>)}</aside>
        <main className="job-workspace">
          <header className="job-header"><div><span className={`job-status ${selectedJob.status}`}>{selectedJob.status.replace('_', ' ')}</span><h2>{selectedJob.jobName}</h2><p>{customer ? `${customer.firstName} ${customer.lastName} · ` : ''}{selectedJob.serviceAddress}</p></div><div className="job-timer"><span>Actual time</span><strong>{hours.toFixed(2)} hr</strong></div></header>
          <section className="job-brief">
            <article><span>Approved job price</span><strong>{currency.format(revenue)}</strong>{changeOrderTotal > 0 && <small>Includes {currency.format(changeOrderTotal)} approved changes</small>}</article>
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

          <section className="job-section"><h3>Material checklist</h3>{selectedJob.materialChecklist.length === 0 ? <p className="job-section-help">No AI materials were attached to the accepted estimate. Add details in internal notes as needed.</p> : <div className="material-checklist"><header><span>Item</span><span>Purchased</span><span>Loaded</span><span>Delivered</span></header>{selectedJob.materialChecklist.map((material) => <div key={material.id}><strong>{material.item}</strong><label><input checked={material.purchased} onChange={(event) => updateMaterial(selectedJob, material.id, { purchased: event.target.checked })} type="checkbox" /><span>Purchased</span></label><label><input checked={material.loaded} onChange={(event) => updateMaterial(selectedJob, material.id, { loaded: event.target.checked })} type="checkbox" /><span>Loaded</span></label><label><input checked={material.delivered} onChange={(event) => updateMaterial(selectedJob, material.id, { delivered: event.target.checked })} type="checkbox" /><span>Delivered</span></label></div>)}</div>}</section>

          <section className="job-section"><h3>Add expense</h3><div className="expense-form"><select onChange={(event) => setExpense({ ...expense, category: event.target.value as JobExpenseCategory })} value={expense.category}>{['materials','delivery','disposal','equipment','subcontractor','other'].map((category) => <option key={category}>{category}</option>)}</select><input onChange={(event) => setExpense({ ...expense, description: event.target.value })} placeholder="What was purchased?" value={expense.description} /><input onChange={(event) => setExpense({ ...expense, vendor: event.target.value })} placeholder="Vendor" value={expense.vendor} /><input min="0" onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} step="0.01" type="number" value={expense.amount} /><input className="expense-notes" onChange={(event) => setExpense({ ...expense, notes: event.target.value })} placeholder="Expense notes (optional)" value={expense.notes} /><label><input checked={expense.billable} onChange={(event) => setExpense({ ...expense, billable: event.target.checked })} type="checkbox" /> Add to invoice</label><input accept="image/*" capture="environment" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} ref={receiptInputRef} type="file" /><button onClick={() => void addExpense(selectedJob)} type="button"><Plus size={17} /> Save expense</button></div><div className="expense-list">{selectedJob.expenses.map((item) => <div key={item.id}><span>{item.category} · {item.description}{item.vendor ? ` · ${item.vendor}` : ''}{item.billable ? ' · billable' : ''}{item.notes ? <small>{item.notes}</small> : null}</span><strong>{currency.format(item.amount)}</strong></div>)}</div></section>

          <section className="job-section"><h3>Change orders</h3><p className="job-section-help">Document newly discovered work, then record customer approval before it affects the final bill.</p>{!['completed','invoiced'].includes(selectedJob.status) && <div className="change-order-form"><textarea onChange={(event) => setChangeOrder({ ...changeOrder, discoveredCondition: event.target.value })} placeholder="Discovered condition" value={changeOrder.discoveredCondition} /><textarea onChange={(event) => setChangeOrder({ ...changeOrder, additionalWork: event.target.value })} placeholder="Additional work" value={changeOrder.additionalWork} /><input onChange={(event) => setChangeOrder({ ...changeOrder, additionalMaterial: event.target.value })} placeholder="Additional materials" value={changeOrder.additionalMaterial} /><input min="0" onChange={(event) => setChangeOrder({ ...changeOrder, estimatedMaterialCost: Number(event.target.value) })} placeholder="Estimated material cost" step="0.01" type="number" value={changeOrder.estimatedMaterialCost} /><input min="0" onChange={(event) => setChangeOrder({ ...changeOrder, additionalLaborHours: Number(event.target.value) })} placeholder="Additional labor hours" step="0.25" type="number" value={changeOrder.additionalLaborHours} /><input min="0" onChange={(event) => setChangeOrder({ ...changeOrder, priceChange: Number(event.target.value) })} placeholder="Customer price change" step="0.01" type="number" value={changeOrder.priceChange} /><input onChange={(event) => setChangeOrder({ ...changeOrder, scheduleImpact: event.target.value })} placeholder="Schedule impact" value={changeOrder.scheduleImpact} /><button onClick={() => saveChangeOrder(selectedJob)} type="button"><Plus size={17} /> Save change-order draft</button></div>}<div className="change-order-list">{selectedJob.changeOrders.map((item) => <article className={item.status} key={item.id}><header><strong>{currency.format(item.priceChange)}</strong><span>{item.status}</span></header><p><b>Condition:</b> {item.discoveredCondition}</p><p><b>Added work:</b> {item.additionalWork}</p>{item.additionalMaterial && <p><b>Materials:</b> {item.additionalMaterial} · est. {currency.format(item.estimatedMaterialCost)}</p>}{item.additionalLaborHours > 0 && <p><b>Added labor:</b> {item.additionalLaborHours.toFixed(2)} hr</p>}{item.scheduleImpact && <p><b>Schedule:</b> {item.scheduleImpact}</p>}{item.approvedBy && <small>Approved by {item.approvedBy} · {new Date(item.approvedAt ?? '').toLocaleString()}</small>}{item.status === 'draft' && !['completed','invoiced'].includes(selectedJob.status) && <footer><button onClick={() => { setChangeApprovalId(item.id); setChangeApprovalName('') }} type="button">Record approval</button><button className="secondary" onClick={() => declineChangeOrder(selectedJob, item.id)} type="button">Decline</button></footer>}{changeApprovalId === item.id && <div className="change-approval"><label><span>Approving customer name / signature</span><input autoFocus onChange={(event) => setChangeApprovalName(event.target.value)} value={changeApprovalName} /></label><button disabled={!changeApprovalName.trim()} onClick={() => approveChangeOrder(selectedJob, item.id)} type="button">Save customer approval</button><button className="secondary" onClick={() => { setChangeApprovalId(null); setChangeApprovalName('') }} type="button">Cancel</button></div>}</article>)}</div></section>

          {['completed','invoiced'].includes(selectedJob.status) && <section className="job-invoice-callout"><div><span className="eyebrow">PAID WORKFLOW</span><h3>{selectedJob.invoiceId ? 'Final invoice created' : 'Job complete and ready to bill'}</h3><p>Actual costs remain internal. The customer invoice uses the approved scope plus marked billable expenses.</p></div><button disabled={Boolean(selectedJob.invoiceId)} onClick={() => createInvoice(selectedJob)} type="button"><FileText size={19} /> {selectedJob.invoiceId ? 'Invoice created' : 'Create final invoice'}</button></section>}
        </main>
      </div>
    </div>
  )
}
