import {
  Camera,
  Download,
  FileImage,
  Fuel,
  Link2,
  Minus,
  Package,
  Pencil,
  Printer,
  Plus,
  ReceiptText,
  ScanLine,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cloudClient } from '../../cloud/cloudClient'
import { recordBusinessEvent } from '../../aiOperations/data/operationsStore'
import { loadCustomers } from '../../customers/data/customerStore'
import type { PreparedEstimatePhoto } from '../../estimates/ai/estimatePhotos'
import { loadJobs } from '../../jobs/data/jobStore'
import { deletePhoto, getPhotoBlob, loadPhotos, queuePhotoFiles, savePhotos } from '../../photos/data/photoStore'
import {
  actOnPhoto,
  preparePhotoPrintWindow,
  type PhotoAction,
} from '../../photos/services/photoActions'
import { loadExpenses, saveExpenses } from '../data/expenseStore'
import { syncExpenseToJobs } from '../services/expenseJobLink'
import { hasNativeReceiptCamera, takeNativeReceiptPhoto } from '../services/receiptCamera'
import { prepareReceiptPhoto, scanReceiptPhoto } from '../services/receiptScanner'
import type { ExpenseCategory, ExpenseRecord } from '../types/ExpenseRecord'
import { expenseAmountLabel, expenseCategoryLabels, expensesToCsv, expenseTotals, money, receiptPhotoDescription } from '../utils/expenseUtils'
import { matchReceiptToJobs } from '../utils/receiptMatching'
import './Receipts.css'
import './ReceiptsIntelligence.css'
import './ReceiptActions.css'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

type DraftExpense = {
  id: string | null
  category: ExpenseCategory
  merchant: string
  purchaseDate: string
  description: string
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  receiptNumber: string
  storeLocation: string
  notes: string
  customerId: string
  jobId: string
  billable: boolean
  receiptPhotoId: string | null
  lineItems: ExpenseRecord['lineItems']
  scanConfidence: ExpenseRecord['scanConfidence']
  fieldConfidence: ExpenseRecord['fieldConfidence']
  suggestedJobId: string | null
  jobMatchConfidence: number | null
  jobMatchReason: string
  createdAt: string | null
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function emptyDraft(): DraftExpense {
  return {
    id: null,
    category: 'materials',
    merchant: '',
    purchaseDate: today(),
    description: '',
    subtotal: 0,
    tax: 0,
    total: 0,
    paymentMethod: '',
    receiptNumber: '',
    storeLocation: '',
    notes: '',
    customerId: '',
    jobId: '',
    billable: false,
    receiptPhotoId: null,
    lineItems: [],
    scanConfidence: null,
    fieldConfidence: null,
    suggestedJobId: null,
    jobMatchConfidence: null,
    jobMatchReason: '',
    createdAt: null,
  }
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function confidenceLabel(value: number | null | undefined) {
  if (typeof value !== 'number') return null
  const percent = Math.round(value * 100)
  return <small className={value < 0.7 ? 'field-confidence low' : 'field-confidence'}>{percent}%</small>
}

export default function Receipts() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(loadExpenses)
  const [draft, setDraft] = useState<DraftExpense>(emptyDraft)
  const [preparedPhoto, setPreparedPhoto] = useState<PreparedEstimatePhoto | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [filter, setFilter] = useState<'all' | ExpenseCategory>('all')
  const [query, setQuery] = useState('')
  const [isPreparing, setIsPreparing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [isOpeningCamera, setIsOpeningCamera] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeReceiptAction, setActiveReceiptAction] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [jobs] = useState(loadJobs)
  const [customers] = useState(loadCustomers)

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const monthStart = useMemo(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
  }, [])
  const totals = useMemo(() => expenseTotals(expenses, monthStart), [expenses, monthStart])
  const availableJobs = useMemo(
    () => jobs.filter((job) => !draft.customerId || job.customerId === draft.customerId || job.id === draft.jobId),
    [draft.customerId, draft.jobId, jobs],
  )
  const customerNames = useMemo<Record<string, string>>(
    () => Object.fromEntries(customers.map((customer) => [
      customer.id,
      `${customer.firstName} ${customer.lastName}`.trim(),
    ])),
    [customers],
  )
  const visibleExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return expenses.filter((expense) => {
      if (filter !== 'all' && expense.category !== filter) return false
      if (!normalizedQuery) return true
      const linkedJob = jobs.find((job) => job.id === expense.jobId)
      const customerId = expense.customerId ?? linkedJob?.customerId ?? null
      const customer = customers.find((item) => item.id === customerId)
      return [
        expense.merchant,
        expense.description,
        expense.notes,
        expense.purchaseDate,
        customer?.firstName,
        customer?.lastName,
        linkedJob?.jobNumber,
        linkedJob?.jobName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [customers, expenses, filter, jobs, query])

  function updateDraft(patch: Partial<DraftExpense>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function selectCustomer(customerId: string) {
    const linkedJob = jobs.find((job) => job.id === draft.jobId)
    const clearsJob = Boolean(linkedJob && linkedJob.customerId !== customerId)
    updateDraft({
      customerId,
      jobId: clearsJob ? '' : draft.jobId,
      billable: clearsJob ? false : draft.billable,
    })
  }

  function selectJob(jobId: string) {
    const linkedJob = jobs.find((job) => job.id === jobId)
    updateDraft({
      jobId,
      customerId: linkedJob?.customerId ?? draft.customerId,
      billable: jobId ? draft.billable : false,
    })
  }

  function resetForm() {
    setDraft(emptyDraft())
    setPreparedPhoto(null)
    setPreviewUrl('')
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  async function chooseReceipt(file: File | null) {
    if (!file) return
    setMessage('')
    setIsPreparing(true)
    try {
      const prepared = await prepareReceiptPhoto(file)
      setPreparedPhoto(prepared)
      setPreviewUrl(URL.createObjectURL(prepared.file))
      setMessage('Receipt photo is ready. Scan it, then review every field before saving.')
    } catch (error) {
      setPreparedPhoto(null)
      setMessage(error instanceof Error ? error.message : 'The receipt photo could not be prepared.')
    } finally {
      setIsPreparing(false)
    }
  }

  async function takeReceiptPhoto() {
    if (!hasNativeReceiptCamera()) {
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      cameraInputRef.current?.click()
      return
    }

    setMessage('Opening the rear camera…')
    setIsOpeningCamera(true)
    try {
      const file = await takeNativeReceiptPhoto()
      if (file) await chooseReceipt(file)
      else setMessage('Camera closed without taking a photo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The camera could not take a receipt photo.')
    } finally {
      setIsOpeningCamera(false)
    }
  }

  async function scanReceipt() {
    if (!preparedPhoto) {
      setMessage('Take or choose a receipt photo first.')
      return
    }
    setIsScanning(true)
    setMessage('Reading the receipt…')
    try {
      const result = await scanReceiptPhoto(preparedPhoto)
      const match = matchReceiptToJobs({
        purchaseDate: result.purchaseDate || draft.purchaseDate,
        merchant: result.merchant,
        description: result.description,
        lineItems: result.lineItems,
      }, jobs)
      setDraft((current) => ({
        ...current,
        category: result.suggestedCategory,
        merchant: result.merchant,
        purchaseDate: result.purchaseDate || current.purchaseDate,
        description: result.description || current.description,
        subtotal: result.subtotal,
        tax: result.tax,
        total: result.total,
        paymentMethod: result.paymentMethod,
        receiptNumber: result.receiptNumber,
        storeLocation: result.storeLocation,
        lineItems: result.lineItems,
        scanConfidence: result.confidence,
        fieldConfidence: result.fieldConfidence,
        suggestedJobId: match?.jobId ?? null,
        jobMatchConfidence: match?.confidence ?? null,
        jobMatchReason: match?.reason ?? '',
      }))
      recordBusinessEvent({
        id: `event:receipt_scanned:${createId()}`,
        type: 'receipt_scanned',
        timestamp: new Date().toISOString(),
        entityType: 'expense',
        metadata: { confidence: result.confidence, suggestedJobId: match?.jobId ?? null },
      })
      setMessage(
        result.warnings.length > 0
          ? `Scan complete. Review carefully: ${result.warnings.join(' ')}`
          : 'Scan complete. Review the merchant, date, category, and total before saving.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The receipt could not be scanned.')
    } finally {
      setIsScanning(false)
    }
  }

  async function saveReceipt() {
    const normalizedTotal = money(draft.total)
    if (!draft.purchaseDate || normalizedTotal <= 0) {
      setMessage('Enter the purchase date and a total greater than $0.')
      return
    }
    if (!draft.merchant.trim() && !draft.description.trim()) {
      setMessage('Enter a merchant or a short description of the purchase.')
      return
    }

    setIsSaving(true)
    setMessage('Saving reviewed expense…')
    try {
      const id = draft.id ?? createId()
      const now = new Date().toISOString()
      const linkedJob = jobs.find((job) => job.id === draft.jobId)
      const customerId = linkedJob?.customerId || draft.customerId || null
      let receiptPhotoId = draft.receiptPhotoId
      let attachmentWarning = ''

      if (preparedPhoto) {
        try {
          const photos = await queuePhotoFiles([preparedPhoto.file], {
            customerId,
            jobName: linkedJob?.jobName ?? '',
            category: 'receipt',
            caption: receiptPhotoDescription(draft.category),
            capturedAt: `${draft.purchaseDate}T12:00:00.000Z`,
          })
          receiptPhotoId = photos[0]?.id ?? receiptPhotoId
        } catch {
          attachmentWarning = ' The expense was saved, but Android could not attach the receipt image; you can edit it and retry.'
        }
      }

      if (receiptPhotoId) {
        const photos = loadPhotos()
        if (photos.some((photo) => photo.id === receiptPhotoId)) {
          savePhotos(photos.map((photo) => photo.id === receiptPhotoId
            ? {
                ...photo,
                customerId,
                jobName: linkedJob?.jobName ?? '',
                caption: receiptPhotoDescription(draft.category),
                capturedAt: `${draft.purchaseDate}T12:00:00.000Z`,
                updatedAt: now,
              }
            : photo))
        }
      }

      const record: ExpenseRecord = {
        id,
        category: draft.category,
        merchant: draft.merchant.trim(),
        purchaseDate: draft.purchaseDate,
        description: draft.description.trim(),
        subtotal: money(draft.subtotal),
        tax: money(draft.tax),
        total: normalizedTotal,
        paymentMethod: draft.paymentMethod.trim(),
        receiptNumber: draft.receiptNumber.trim(),
        storeLocation: draft.storeLocation.trim(),
        notes: draft.notes.trim(),
        customerId,
        jobId: draft.jobId || null,
        billable: Boolean(draft.jobId) && draft.billable,
        receiptPhotoId,
        lineItems: draft.lineItems.map((item) => ({
          description: item.description.trim(),
          quantity: typeof item.quantity === 'number' ? money(item.quantity) : null,
          unitPrice: typeof item.unitPrice === 'number' ? money(item.unitPrice) : null,
          amount: money(item.amount),
          confidence: Math.min(1, Math.max(0, item.confidence)),
        })).filter((item) => item.description || item.amount > 0),
        scanConfidence: draft.scanConfidence,
        fieldConfidence: draft.fieldConfidence,
        suggestedJobId: draft.suggestedJobId,
        jobMatchConfidence: draft.jobMatchConfidence,
        jobMatchReason: draft.jobMatchReason,
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
      }
      const next = [record, ...expenses.filter((expense) => expense.id !== id)]
        .sort((first, second) => second.purchaseDate.localeCompare(first.purchaseDate))
      const syncQueued = saveExpenses(next)
      setExpenses(next)
      let jobWarning = ''
      try {
        syncExpenseToJobs(record, id)
      } catch {
        jobWarning = ' The expense is saved, but its job link will need another save attempt.'
      }
      resetForm()
      setMessage(
        `Expense saved privately.${syncQueued ? ' Cloud backup is queued.' : ' Cloud backup will retry when storage is available.'}${attachmentWarning}${jobWarning}`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The receipt could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  function editReceipt(expense: ExpenseRecord) {
    setDraft({
      id: expense.id,
      category: expense.category,
      merchant: expense.merchant,
      purchaseDate: expense.purchaseDate,
      description: expense.description,
      subtotal: expense.subtotal,
      tax: expense.tax,
      total: expense.total,
      paymentMethod: expense.paymentMethod,
      receiptNumber: expense.receiptNumber,
      storeLocation: expense.storeLocation,
      notes: expense.notes,
      customerId: expense.customerId ?? jobs.find((job) => job.id === expense.jobId)?.customerId ?? '',
      jobId: expense.jobId ?? '',
      billable: expense.billable,
      receiptPhotoId: expense.receiptPhotoId,
      lineItems: expense.lineItems,
      scanConfidence: expense.scanConfidence,
      fieldConfidence: expense.fieldConfidence,
      suggestedJobId: expense.suggestedJobId,
      jobMatchConfidence: expense.jobMatchConfidence,
      jobMatchReason: expense.jobMatchReason,
      createdAt: expense.createdAt,
    })
    setPreparedPhoto(null)
    setPreviewUrl('')
    setMessage('Editing saved receipt. Choose a new image only if you want to replace its attachment.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeReceipt(expense: ExpenseRecord) {
    if (!window.confirm(`Delete the ${expense.merchant || expense.description || 'receipt'} expense?`)) return

    const next = expenses.filter((item) => item.id !== expense.id)
    setExpenses(next)
    saveExpenses(next)
    syncExpenseToJobs(null, expense.id)

    if (expense.receiptPhotoId) {
      const photo = loadPhotos().find((item) => item.id === expense.receiptPhotoId)
      if (photo) await deletePhoto(photo)
    }
    setMessage('Receipt and its linked job expense were deleted.')
  }

  async function runReceiptPhotoAction(expense: ExpenseRecord, action: PhotoAction) {
    if (!expense.receiptPhotoId) return

    const preparedWindow = preparePhotoPrintWindow(action)
    setActiveReceiptAction(`${expense.id}:${action}`)
    setMessage(`${action === 'share' ? 'Opening Send options' : action === 'print' ? 'Preparing receipt to print' : 'Preparing receipt download'}…`)

    try {
      const photo = loadPhotos().find((item) => item.id === expense.receiptPhotoId)
      if (!photo) throw new Error('This receipt image could not be found. Edit the expense and attach it again.')

      const blob = await getPhotoBlob(cloudClient, photo)
      if (!blob) throw new Error('This receipt image is still waiting to finish saving. Try again in a moment.')

      await actOnPhoto(photo, blob, action, preparedWindow)
      setMessage(
        action === 'share'
          ? 'Send options opened for the receipt image.'
          : action === 'print'
            ? 'Print options opened for the receipt image.'
            : 'Receipt image download started.',
      )
    } catch (error) {
      preparedWindow?.close()
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Sending was canceled.'
          : error instanceof Error
            ? error.message
            : `The receipt image could not ${action}.`,
      )
    } finally {
      setActiveReceiptAction(null)
    }
  }

  function exportCsv() {
    const blob = new Blob([expensesToCsv(visibleExpenses, customerNames)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `owner-hub-expenses-${today()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="receipts-page" data-tour="receipts-page">
      <header className="receipts-hero">
        <div>
          <span className="eyebrow">EXPENSE CONTROL</span>
          <h1>Receipt scanner</h1>
          <p>Photograph material, gas, and vehicle-parts receipts, review the scan, and keep every cost connected to the right customer or job.</p>
        </div>
        <ReceiptText aria-hidden="true" size={48} />
      </header>

      {message ? <p className="receipts-message" role="status">{message}</p> : null}

      <section className="receipt-summary" aria-label="This month expense totals">
        <article><ReceiptText /><span>This month</span><strong>{currency.format(totals.all)}</strong></article>
        <article><Package /><span>Materials</span><strong>{currency.format(totals.materials)}</strong></article>
        <article><Fuel /><span>Gas</span><strong>{currency.format(totals.fuel)}</strong></article>
        <article><ReceiptText /><span>Vehicle parts cost</span><strong>{currency.format(totals.vehicle)}</strong></article>
      </section>

      <section className="receipt-workbench" data-tour="receipt-scanner">
        <div className="receipt-capture-panel">
          <div className="receipt-capture-preview">
            {previewUrl ? <img alt="Selected receipt preview" src={previewUrl} /> : <><FileImage size={44} /><strong>Add a clear receipt photo</strong><span>Lay it flat, avoid glare, and include the full receipt.</span></>}
          </div>
          <div className="receipt-capture-actions">
            <button disabled={isOpeningCamera || isPreparing} onClick={() => void takeReceiptPhoto()} type="button"><Camera size={18} /> {isOpeningCamera ? 'Opening camera…' : 'Take photo'}</button>
            <button className="secondary" onClick={() => galleryInputRef.current?.click()} type="button"><FileImage size={18} /> Choose image</button>
            <input accept="image/*" capture="environment" onChange={(event) => void chooseReceipt(event.target.files?.[0] ?? null)} ref={cameraInputRef} type="file" />
            <input accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseReceipt(event.target.files?.[0] ?? null)} ref={galleryInputRef} type="file" />
          </div>
          <button className="receipt-scan-button" disabled={!preparedPhoto || isPreparing || isScanning} onClick={() => void scanReceipt()} type="button">
            <ScanLine size={19} /> {isPreparing ? 'Preparing photo…' : isScanning ? 'Scanning receipt…' : 'Scan receipt'}
          </button>
          <small>AI reads the image only to draft these fields. Nothing is recorded until you review and save.</small>
        </div>

        <form className="receipt-review-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveReceipt() }}>
          <header><div><span className="eyebrow">OWNER REVIEW REQUIRED</span><h2>{draft.id ? 'Edit expense' : 'Review expense'}</h2></div>{draft.id ? <button aria-label="Cancel editing" className="icon-button" onClick={resetForm} type="button"><X size={20} /></button> : null}</header>
          <div className="receipt-form-grid">
            <label><span>Category</span><select onChange={(event) => updateDraft({ category: event.target.value as ExpenseCategory })} value={draft.category}>{Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Purchase date {confidenceLabel(draft.fieldConfidence?.purchaseDate)}</span><input max={today()} onChange={(event) => updateDraft({ purchaseDate: event.target.value })} required type="date" value={draft.purchaseDate} /></label>
            <label className="wide"><span>Merchant {confidenceLabel(draft.fieldConfidence?.merchant)}</span><input onChange={(event) => updateDraft({ merchant: event.target.value })} placeholder="Lowe's, Menards, gas station…" value={draft.merchant} /></label>
            <label className="wide"><span>Description</span><input onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Tile materials, gasoline…" value={draft.description} /></label>
            <label><span>Subtotal {confidenceLabel(draft.fieldConfidence?.subtotal)}</span><input min="0" onChange={(event) => updateDraft({ subtotal: Number(event.target.value) })} step="0.01" type="number" value={draft.subtotal} /></label>
            <label><span>Tax {confidenceLabel(draft.fieldConfidence?.tax)}</span><input min="0" onChange={(event) => updateDraft({ tax: Number(event.target.value) })} step="0.01" type="number" value={draft.tax} /></label>
            <label><span>{expenseAmountLabel(draft.category)} {confidenceLabel(draft.fieldConfidence?.total)}</span><input aria-label={expenseAmountLabel(draft.category)} min="0.01" onChange={(event) => updateDraft({ total: Number(event.target.value) })} required step="0.01" type="number" value={draft.total} /></label>
            <label><span>Payment method {confidenceLabel(draft.fieldConfidence?.paymentMethod)}</span><input onChange={(event) => updateDraft({ paymentMethod: event.target.value })} placeholder="Card, cash, check…" value={draft.paymentMethod} /></label>
            <label><span>Receipt number {confidenceLabel(draft.fieldConfidence?.receiptNumber)}</span><input onChange={(event) => updateDraft({ receiptNumber: event.target.value })} value={draft.receiptNumber} /></label>
            <label><span>Store location</span><input onChange={(event) => updateDraft({ storeLocation: event.target.value })} placeholder="Mishawaka, IN" value={draft.storeLocation} /></label>
            <label><span>Assign to customer</span><select onChange={(event) => selectCustomer(event.target.value)} value={draft.customerId}><option value="">No customer / general business</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}</select></label>
            <label><span>Attach to job (optional)</span><select onChange={(event) => selectJob(event.target.value)} value={draft.jobId}><option value="">No job</option>{availableJobs.map((job) => <option key={job.id} value={job.id}>{job.jobNumber} · {job.jobName}</option>)}</select></label>
            <label className="wide"><span>Notes</span><textarea onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Optional internal note" value={draft.notes} /></label>
            <label className="receipt-checkbox wide"><input checked={draft.billable} disabled={!draft.jobId} onChange={(event) => updateDraft({ billable: event.target.checked })} type="checkbox" /><span>Add this cost to the linked job's final invoice</span></label>
          </div>
          {draft.lineItems.length > 0 ? <section className="receipt-line-items"><header><div><span className="eyebrow">EXTRACTED ITEMS</span><h3>Review line items</h3></div><button onClick={() => updateDraft({ lineItems: [...draft.lineItems, { description: '', quantity: null, unitPrice: null, amount: 0, confidence: 1 }] })} type="button"><Plus size={16}/> Add item</button></header>{draft.lineItems.map((item, index) => <div className="receipt-line-item" key={`${index}-${item.description}`}><input aria-label={`Line item ${index + 1} description`} onChange={(event) => updateDraft({ lineItems: draft.lineItems.map((current, itemIndex) => itemIndex === index ? { ...current, description: event.target.value } : current) })} value={item.description}/><input aria-label={`Line item ${index + 1} quantity`} min="0" onChange={(event) => updateDraft({ lineItems: draft.lineItems.map((current, itemIndex) => itemIndex === index ? { ...current, quantity: event.target.value ? Number(event.target.value) : null } : current) })} placeholder="Qty" step="0.01" type="number" value={item.quantity ?? ''}/><input aria-label={`Line item ${index + 1} unit price`} min="0" onChange={(event) => updateDraft({ lineItems: draft.lineItems.map((current, itemIndex) => itemIndex === index ? { ...current, unitPrice: event.target.value ? Number(event.target.value) : null } : current) })} placeholder="Each" step="0.01" type="number" value={item.unitPrice ?? ''}/><input aria-label={`Line item ${index + 1} amount`} min="0" onChange={(event) => updateDraft({ lineItems: draft.lineItems.map((current, itemIndex) => itemIndex === index ? { ...current, amount: Number(event.target.value) } : current) })} step="0.01" type="number" value={item.amount}/>{confidenceLabel(item.confidence)}<button aria-label={`Remove line item ${index + 1}`} onClick={() => updateDraft({ lineItems: draft.lineItems.filter((_, itemIndex) => itemIndex !== index) })} type="button"><Minus size={16}/></button></div>)}</section> : null}
          {draft.suggestedJobId && !draft.jobId ? <div className="job-match-card"><Sparkles size={20}/><div><strong>Likely job: {jobs.find((job) => job.id === draft.suggestedJobId)?.jobNumber} · {jobs.find((job) => job.id === draft.suggestedJobId)?.jobName}</strong><span>{Math.round((draft.jobMatchConfidence ?? 0) * 100)}% confidence · {draft.jobMatchReason}</span></div><button onClick={() => selectJob(draft.suggestedJobId ?? '')} type="button"><Link2 size={16}/> Approve match</button></div> : null}
          {draft.scanConfidence ? <p className={`scan-confidence ${draft.scanConfidence}`}>Scan confidence: {draft.scanConfidence}. Verify the total against the image.</p> : null}
          <button className="receipt-save-button" disabled={isSaving} type="submit"><Plus size={19} /> {isSaving ? 'Saving expense…' : draft.id ? 'Update expense' : 'Save reviewed expense'}</button>
        </form>
      </section>

      <section className="receipt-history" data-tour="receipt-history">
        <header><div><span className="eyebrow">PRIVATE EXPENSE HISTORY</span><h2>Business expenses</h2></div><button className="receipt-export" disabled={visibleExpenses.length === 0} onClick={exportCsv} type="button"><Download size={17} /> Export CSV</button></header>
        <div className="receipt-toolbar">
          <input aria-label="Search receipts" onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, job, merchant, or notes" value={query} />
          <select aria-label="Filter receipt category" onChange={(event) => setFilter(event.target.value as 'all' | ExpenseCategory)} value={filter}><option value="all">All categories</option>{Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {visibleExpenses.length === 0 ? <div className="receipt-empty"><ReceiptText size={38} /><strong>No matching receipts yet</strong><span>Your reviewed receipts will appear here.</span></div> : <div className="receipt-list">{visibleExpenses.map((expense) => {
          const job = jobs.find((item) => item.id === expense.jobId)
          const customerId = expense.customerId ?? job?.customerId ?? null
          const customer = customers.find((item) => item.id === customerId)
          const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : ''
          const Icon = expense.category === 'fuel' ? Fuel : expense.category === 'materials' ? Package : ReceiptText
          const actionBusy = activeReceiptAction?.startsWith(`${expense.id}:`) ?? false
          return <article key={expense.id}><div className={`receipt-category-icon ${expense.category}`}><Icon size={21} /></div><div className="receipt-list-main"><header><strong>{expense.merchant || expense.description || 'Business expense'}</strong><span><small>{expenseAmountLabel(expense.category)}</small>{currency.format(expense.total)}</span></header><p>{expense.purchaseDate} · {expenseCategoryLabels[expense.category]}{customerName ? ` · ${customerName}` : ''}{job ? ` · ${job.jobNumber}` : customerName ? ' · no job' : ' · general business'}{expense.receiptPhotoId ? ' · receipt attached' : ''}</p>{expense.description && expense.merchant ? <small>{expense.description}</small> : null}{expense.paymentMethod || expense.receiptNumber ? <small>{[expense.paymentMethod, expense.receiptNumber ? `Receipt ${expense.receiptNumber}` : ''].filter(Boolean).join(' · ')}</small> : null}</div><div className="receipt-row-actions">{expense.receiptPhotoId ? <><button aria-label="Download receipt image" disabled={actionBusy} onClick={() => void runReceiptPhotoAction(expense, 'download')} title="Download receipt image" type="button"><Download size={17} /></button><button aria-label="Print receipt image" disabled={actionBusy} onClick={() => void runReceiptPhotoAction(expense, 'print')} title="Print receipt image" type="button"><Printer size={17} /></button><button aria-label="Send receipt image" disabled={actionBusy} onClick={() => void runReceiptPhotoAction(expense, 'share')} title="Send receipt image" type="button"><Send size={17} /></button></> : null}<button aria-label="Edit receipt" disabled={actionBusy} onClick={() => editReceipt(expense)} type="button"><Pencil size={17} /></button><button aria-label="Delete receipt" className="danger" disabled={actionBusy} onClick={() => void removeReceipt(expense)} type="button"><Trash2 size={17} /></button></div></article>
        })}</div>}
      </section>
    </div>
  )
}
