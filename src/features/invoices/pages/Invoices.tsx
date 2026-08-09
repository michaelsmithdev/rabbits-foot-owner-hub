import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  CircleDollarSign,
  FilePenLine,
  Plus,
  ReceiptText,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'

import { loadCustomers } from '../../customers/data/customerStore'
import type { Customer } from '../../customers/types/Customer'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import type { BusinessSettings } from '../../settings/types/BusinessSettings'
import DocumentPdfActions from '../../documents/components/DocumentPdfActions'
import { useAuth } from '../../auth/authContext'
import PricingInsightPanel from '../../pricing/components/PricingInsightPanel'
import {
  createInvoiceNumber,
  loadInvoices,
  saveInvoices,
} from '../data/invoiceStore'
import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
  PaymentMethod,
} from '../types/Invoice'
import {
  calculateInvoiceBalance,
  calculateInvoiceSubtotal,
  calculateInvoiceTotal,
  calculatePaymentsTotal,
  getPaymentAdjustedStatus,
} from '../utils/invoiceMath'

import '../styles/Invoices.css'

type InvoiceDraft = {
  customerId: string
  jobName: string
  serviceAddress: string
  description: string
  issueDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  taxRate: number
  discount: number
  notes: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  materialCost: number
  taxReservePercent: number
  status: InvoiceStatus
}

const statusLabels: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial payment',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  card: 'Card',
  online: 'Online',
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getTodayDate() {
  return getDateInputValue(new Date())
}

function getDefaultDueDate(dueDays = 14) {
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + dueDays)

  return getDateInputValue(dueDate)
}

function createEmptyLineItem(): InvoiceLineItem {
  return {
    id: createId(),
    description: '',
    quantity: 1,
    unitPrice: 0,
  }
}

function createEmptyDraft(settings: BusinessSettings): InvoiceDraft {
  return {
    customerId: '',
    jobName: '',
    serviceAddress: '',
    description: '',
    issueDate: getTodayDate(),
    dueDate: getDefaultDueDate(settings.invoiceDueDays),
    lineItems: [createEmptyLineItem()],
    taxRate: settings.defaultTaxRate,
    discount: 0,
    notes: settings.invoiceTerms,
    propertyType: 'residential',
    jobCategory: 'General handyman',
    materialCost: 0,
    taxReservePercent: settings.defaultTaxReservePercent,
    status: 'draft',
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`)

  if (Number.isNaN(date.getTime())) return dateValue

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatCustomerName(customer: Customer | undefined) {
  if (!customer) return 'Customer not found'

  return `${customer.firstName} ${customer.lastName}`.trim()
}

function formatCustomerAddress(customer: Customer) {
  return [
    customer.streetAddress,
    [customer.city, customer.state].filter(Boolean).join(', '),
    customer.zipCode,
  ]
    .filter(Boolean)
    .join(' ')
}

type SquarePaymentLinkResponse = {
  error?: string
  url?: string
  paymentLinkId?: string
  orderId?: string
  amount?: number
}

async function requestSquarePaymentLink(
  accessToken: string,
  invoiceId: string,
) {
  const apiOrigin =
    import.meta.env.VITE_OWNER_HUB_API_URL?.trim().replace(/\/$/, '') ?? ''
  const response = await fetch(`${apiOrigin}/api/square-payment-link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invoiceId }),
  })
  const payload = (await response.json()) as SquarePaymentLinkResponse

  if (!response.ok || !payload.url || typeof payload.amount !== 'number') {
    throw new Error(payload.error || 'Square did not return a payment link.')
  }

  return {
    url: payload.url,
    paymentLinkId: payload.paymentLinkId,
    orderId: payload.orderId,
    amount: payload.amount,
  }
}

function Invoices() {
  const { session } = useAuth()
  const businessSettings = useMemo(() => loadBusinessSettings(), [])
  const [customers] = useState<Customer[]>(() => loadCustomers())
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices())
  const [draft, setDraft] = useState<InvoiceDraft>(() =>
    createEmptyDraft(businessSettings),
  )
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(
    null,
  )
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(
    null,
  )
  const [paymentDate, setPaymentDate] = useState(getTodayDate())
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [printInvoiceId] = useState<string | null>(null)
  const [squareLinkInvoiceId, setSquareLinkInvoiceId] = useState<string | null>(null)
  const [squareMessage, setSquareMessage] = useState('')

  useEffect(() => {
    saveInvoices(invoices)
  }, [invoices])

  useEffect(() => {
    if (!isBuilderOpen && !paymentInvoiceId) return

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      setIsBuilderOpen(false)
      setPaymentInvoiceId(null)
      setFormError('')
      setPaymentError('')
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isBuilderOpen, paymentInvoiceId])

  const draftSubtotal = useMemo(
    () => calculateInvoiceSubtotal(draft),
    [draft],
  )
  const draftTotal = useMemo(
    () => calculateInvoiceTotal(draft),
    [draft],
  )
  const draftTax = draftSubtotal * (draft.taxRate / 100)
  const paymentInvoice = invoices.find(
    (invoice) => invoice.id === paymentInvoiceId,
  )
  const printInvoice = invoices.find(
    (invoice) => invoice.id === printInvoiceId,
  )

  function resetBuilder() {
    setDraft(createEmptyDraft(businessSettings))
    setEditingInvoiceId(null)
    setFormError('')
  }

  async function createSquarePaymentLink(invoice: Invoice) {
    if (!session?.access_token) {
      setSquareMessage('Sign in and sync the invoice before creating a Square payment link.')
      return
    }
    setSquareLinkInvoiceId(invoice.id)
    setSquareMessage('')
    try {
      const payload = await requestSquarePaymentLink(
        session.access_token,
        invoice.id,
      )
      const createdAt = new Date().toISOString()
      setInvoices((current) => current.map((item) => item.id === invoice.id ? {
        ...item,
        squarePaymentLink: { ...payload, createdAt },
        updatedAt: createdAt,
      } : item))
      setSquareMessage(`Square checkout created for ${formatCurrency(payload.amount)}.`)
      window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setSquareMessage(error instanceof Error ? error.message : 'Square payment link failed.')
    } finally {
      setSquareLinkInvoiceId(null)
    }
  }

  function openNewInvoice() {
    resetBuilder()
    setIsBuilderOpen(true)
  }

  function openEditInvoice(invoice: Invoice) {
    setEditingInvoiceId(invoice.id)
    setDraft({
      customerId: invoice.customerId,
      jobName: invoice.jobName,
      serviceAddress: invoice.serviceAddress,
      description: invoice.description,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems.map((lineItem) => ({ ...lineItem })),
      taxRate: invoice.taxRate,
      discount: invoice.discount,
      notes: invoice.notes,
      propertyType: invoice.propertyType ?? 'residential',
      jobCategory: invoice.jobCategory ?? 'General handyman',
      materialCost: invoice.materialCost ?? 0,
      taxReservePercent: invoice.taxReservePercent ?? businessSettings.defaultTaxReservePercent,
      status: invoice.status,
    })
    setFormError('')
    setIsBuilderOpen(true)
  }

  function closeBuilder() {
    setIsBuilderOpen(false)
    resetBuilder()
  }

  function updateDraft<Key extends keyof InvoiceDraft>(
    key: Key,
    value: InvoiceDraft[Key],
  ) {
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }))
  }

  function selectCustomer(customerId: string) {
    const customer = customers.find(
      (currentCustomer) => currentCustomer.id === customerId,
    )

    setDraft((currentDraft) => ({
      ...currentDraft,
      customerId,
      serviceAddress: customer
        ? formatCustomerAddress(customer)
        : currentDraft.serviceAddress,
    }))
  }

  function updateLineItem(
    lineItemId: string,
    field: keyof Omit<InvoiceLineItem, 'id'>,
    value: string,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: currentDraft.lineItems.map((lineItem) => {
        if (lineItem.id !== lineItemId) return lineItem

        return {
          ...lineItem,
          [field]:
            field === 'description' ? value : Math.max(0, Number(value)),
        }
      }),
    }))
  }

  function addLineItem() {
    setDraft((currentDraft) => ({
      ...currentDraft,
      lineItems: [...currentDraft.lineItems, createEmptyLineItem()],
    }))
  }

  function removeLineItem(lineItemId: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      lineItems:
        currentDraft.lineItems.length === 1
          ? currentDraft.lineItems
          : currentDraft.lineItems.filter(
              (lineItem) => lineItem.id !== lineItemId,
            ),
    }))
  }

  function validateDraft() {
    if (!draft.customerId) return 'Choose a customer.'
    if (!draft.jobName.trim()) return 'Enter a job or project name.'
    if (!draft.issueDate || !draft.dueDate) {
      return 'Choose both an issue date and a due date.'
    }
    if (draft.dueDate < draft.issueDate) {
      return 'The due date cannot be before the issue date.'
    }
    if (
      draft.lineItems.some(
        (lineItem) =>
          !lineItem.description.trim() ||
          lineItem.quantity <= 0 ||
          lineItem.unitPrice < 0,
      )
    ) {
      return 'Every line item needs a description, quantity, and valid price.'
    }
    if (draft.taxRate < 0 || draft.discount < 0) {
      return 'Tax and discount values cannot be negative.'
    }

    return ''
  }

  function saveInvoice() {
    const validationError = validateDraft()

    if (validationError) {
      setFormError(validationError)
      return
    }

    const timestamp = new Date().toISOString()
    const existingInvoice = invoices.find(
      (invoice) => invoice.id === editingInvoiceId,
    )
    const baseInvoice: Invoice = {
      id: existingInvoice?.id ?? createId(),
      invoiceNumber:
        existingInvoice?.invoiceNumber ??
        createInvoiceNumber(invoices, businessSettings.invoicePrefix),
      customerId: draft.customerId,
      estimateId: existingInvoice?.estimateId ?? null,
      jobName: draft.jobName.trim(),
      serviceAddress: draft.serviceAddress.trim(),
      description: draft.description.trim(),
      issueDate: draft.issueDate,
      dueDate: draft.dueDate,
      lineItems: draft.lineItems.map((lineItem) => ({
        ...lineItem,
        description: lineItem.description.trim(),
      })),
      taxRate: draft.taxRate,
      discount: draft.discount,
      notes: draft.notes.trim(),
      propertyType: draft.propertyType,
      jobCategory: draft.jobCategory.trim(),
      materialCost: draft.materialCost,
      taxReservePercent: draft.taxReservePercent,
      completionDate: existingInvoice?.completionDate,
      photoIds: existingInvoice?.photoIds ? [...existingInvoice.photoIds] : [],
      aiEstimate: existingInvoice?.aiEstimate,
      status: draft.status,
      payments: existingInvoice?.payments ?? [],
      createdAt: existingInvoice?.createdAt ?? timestamp,
      updatedAt: timestamp,
      paidAt: existingInvoice?.paidAt ?? null,
    }
    const adjustedStatus = getPaymentAdjustedStatus(
      baseInvoice,
      draft.status,
    )
    const savedInvoice: Invoice = {
      ...baseInvoice,
      status: adjustedStatus,
      paidAt:
        adjustedStatus === 'paid'
          ? baseInvoice.paidAt ?? timestamp
          : null,
      completionDate:
        adjustedStatus === 'paid'
          ? baseInvoice.completionDate ?? timestamp.slice(0, 10)
          : baseInvoice.completionDate,
    }

    setInvoices((currentInvoices) =>
      existingInvoice
        ? currentInvoices.map((invoice) =>
            invoice.id === savedInvoice.id ? savedInvoice : invoice,
          )
        : [savedInvoice, ...currentInvoices],
    )
    closeBuilder()
  }

  function deleteInvoice(invoice: Invoice) {
    const confirmed = window.confirm(
      `Delete ${invoice.invoiceNumber}? This cannot be undone.`,
    )

    if (!confirmed) return

    setInvoices((currentInvoices) =>
      currentInvoices.filter(
        (currentInvoice) => currentInvoice.id !== invoice.id,
      ),
    )
  }

  function changeInvoiceStatus(
    invoice: Invoice,
    requestedStatus: InvoiceStatus,
  ) {
    const timestamp = new Date().toISOString()
    const status = getPaymentAdjustedStatus(invoice, requestedStatus)

    setInvoices((currentInvoices) =>
      currentInvoices.map((currentInvoice) =>
        currentInvoice.id === invoice.id
          ? {
              ...currentInvoice,
              status,
              updatedAt: timestamp,
              paidAt:
                status === 'paid'
                  ? currentInvoice.paidAt ?? timestamp
                  : null,
            }
          : currentInvoice,
      ),
    )
  }

  function openPayment(invoice: Invoice) {
    setPaymentInvoiceId(invoice.id)
    setPaymentDate(getTodayDate())
    setPaymentAmount(calculateInvoiceBalance(invoice).toFixed(2))
    setPaymentMethod('cash')
    setPaymentReference('')
    setPaymentNotes('')
    setPaymentError('')
  }

  function closePayment() {
    setPaymentInvoiceId(null)
    setPaymentError('')
  }

  function savePayment() {
    if (!paymentInvoice) return

    const amount = Number(paymentAmount)
    const balance = calculateInvoiceBalance(paymentInvoice)

    if (!paymentDate) {
      setPaymentError('Choose a payment date.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Enter a payment amount greater than zero.')
      return
    }
    if (amount > balance + 0.005) {
      setPaymentError(
        `Payment cannot exceed the ${formatCurrency(balance)} balance.`,
      )
      return
    }

    const timestamp = new Date().toISOString()
    const payment: InvoicePayment = {
      id: createId(),
      date: paymentDate,
      amount,
      method: paymentMethod,
      referenceNumber: paymentReference.trim(),
      notes: paymentNotes.trim(),
      createdAt: timestamp,
    }

    setInvoices((currentInvoices) =>
      currentInvoices.map((invoice) => {
        if (invoice.id !== paymentInvoice.id) return invoice

        const updatedInvoice: Invoice = {
          ...invoice,
          payments: [...invoice.payments, payment],
          updatedAt: timestamp,
        }
        const status = getPaymentAdjustedStatus(updatedInvoice, invoice.status)

        return {
          ...updatedInvoice,
          status,
          paidAt: status === 'paid' ? timestamp : null,
          completionDate:
            status === 'paid'
              ? updatedInvoice.completionDate ?? paymentDate
              : updatedInvoice.completionDate,
        }
      }),
    )
    closePayment()
  }

  function deletePayment(invoiceId: string, paymentId: string) {
    const confirmed = window.confirm('Remove this payment record?')

    if (!confirmed) return

    setInvoices((currentInvoices) =>
      currentInvoices.map((invoice) => {
        if (invoice.id !== invoiceId) return invoice

        const updatedInvoice: Invoice = {
          ...invoice,
          payments: invoice.payments.filter(
            (payment) => payment.id !== paymentId,
          ),
          updatedAt: new Date().toISOString(),
        }
        const requestedStatus: InvoiceStatus =
          invoice.status === 'void' ? 'void' : 'sent'
        const status = getPaymentAdjustedStatus(
          updatedInvoice,
          requestedStatus,
        )

        return {
          ...updatedInvoice,
          status,
          paidAt: status === 'paid' ? invoice.paidAt : null,
        }
      }),
    )
    closePayment()
  }

  const printCustomer = printInvoice
    ? customers.find((customer) => customer.id === printInvoice.customerId)
    : undefined

  return (
    <>
      <section className="invoices-page">
        <div className="customers-page-header">
          <div>
            <p className="eyebrow">DOCUMENTS</p>
            <h1>Invoices</h1>
            <p className="customers-page-subtitle">
              {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}{' '}
              saved on this device.
            </p>
          </div>
          <button
            className="button-dark"
            onClick={openNewInvoice}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            New invoice
          </button>
        </div>

        {customers.length === 0 && (
          <aside className="invoice-guidance" role="status">
            Add a customer before saving a new invoice. Customer details are
            used for billing and service addresses.
            <button
              onClick={() => {
                window.location.hash = 'customers'
              }}
              type="button"
            >
              Go to customers
            </button>
          </aside>
        )}

        {squareMessage && <aside className="invoice-guidance" role="status">{squareMessage}</aside>}

        {invoices.length === 0 ? (
          <div className="customers-empty-state invoice-empty-state">
            <div className="customers-empty-icon">
              <ReceiptText aria-hidden="true" size={28} />
            </div>
            <h2>No invoices yet</h2>
            <p>
              Create an invoice manually or convert an approved estimate with
              one click.
            </p>
            <button
              className="button-dark"
              onClick={openNewInvoice}
              type="button"
            >
              Create first invoice
            </button>
          </div>
        ) : (
          <div className="invoice-grid">
            {invoices.map((invoice) => {
              const customer = customers.find(
                (currentCustomer) => currentCustomer.id === invoice.customerId,
              )
              const total = calculateInvoiceTotal(invoice)
              const paid = calculatePaymentsTotal(invoice.payments)
              const balance = calculateInvoiceBalance(invoice)

              return (
                <article className="invoice-card" key={invoice.id}>
                  <div className="invoice-card-heading">
                    <div>
                      <span className="invoice-number">
                        {invoice.invoiceNumber}
                      </span>
                      <h2>{invoice.jobName}</h2>
                      <p>{formatCustomerName(customer)}</p>
                    </div>
                    <select
                      aria-label={`Status for ${invoice.invoiceNumber}`}
                      className={`invoice-status invoice-status-select status-${invoice.status}`}
                      onChange={(event) =>
                        changeInvoiceStatus(
                          invoice,
                          event.target.value as InvoiceStatus,
                        )
                      }
                      value={invoice.status}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="invoice-card-dates">
                    <span>
                      <CalendarDays aria-hidden="true" size={16} />
                      Due {formatDate(invoice.dueDate)}
                    </span>
                    {invoice.estimateId && <span>Converted from estimate</span>}
                  </div>

                  <div className="invoice-balance-grid">
                    <div>
                      <span>Total</span>
                      <strong>{formatCurrency(total)}</strong>
                    </div>
                    <div>
                      <span>Paid</span>
                      <strong>{formatCurrency(paid)}</strong>
                    </div>
                    <div className="balance-due">
                      <span>Balance due</span>
                      <strong>{formatCurrency(balance)}</strong>
                    </div>
                  </div>

                  <div className="invoice-card-actions">
                    <button
                      onClick={() => openEditInvoice(invoice)}
                      type="button"
                    >
                      <FilePenLine aria-hidden="true" size={16} />
                      Edit
                    </button>
                    <DocumentPdfActions kind="invoice" document={invoice} customer={customer} />
                    {balance > 0 &&
                      ['sent', 'partial', 'overdue'].includes(
                        invoice.status,
                      ) && (
                      <button
                        disabled={squareLinkInvoiceId === invoice.id}
                        onClick={() => void createSquarePaymentLink(invoice)}
                        type="button"
                      >
                        <WalletCards aria-hidden="true" size={16} />
                        {squareLinkInvoiceId === invoice.id ? 'Connecting Square…' : invoice.squarePaymentLink ? 'Refresh Square link' : 'Pay with Square'}
                      </button>
                    )}
                    {invoice.squarePaymentLink && balance > 0 && !['draft', 'void'].includes(invoice.status) && (
                      <button onClick={() => window.open(invoice.squarePaymentLink?.url, '_blank', 'noopener,noreferrer')} type="button">
                        Open payment page
                      </button>
                    )}
                    {balance > 0 && invoice.status !== 'void' && (
                      <button
                        className="invoice-payment-button"
                        onClick={() => openPayment(invoice)}
                        type="button"
                      >
                        <Banknote aria-hidden="true" size={16} />
                        Record payment
                      </button>
                    )}
                    {invoice.payments.length > 0 && (
                      <button
                        onClick={() => openPayment(invoice)}
                        type="button"
                      >
                        Payment history ({invoice.payments.length})
                      </button>
                    )}
                    <button
                      aria-label={`Delete ${invoice.invoiceNumber}`}
                      className="invoice-delete-button"
                      onClick={() => deleteInvoice(invoice)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {isBuilderOpen && (
        <div className="modal-backdrop">
          <section
            aria-labelledby="invoice-builder-title"
            aria-modal="true"
            className="invoice-modal"
            role="dialog"
          >
            <header className="invoice-modal-header">
              <div>
                <p className="eyebrow">RABBIT&apos;S FOOT OWNER HUB</p>
                <h2 id="invoice-builder-title">
                  {editingInvoiceId ? 'Edit invoice' : 'New invoice'}
                </h2>
              </div>
              <button
                aria-label="Close invoice"
                className="modal-close-button"
                onClick={closeBuilder}
                type="button"
              >
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            <div className="invoice-form-grid">
              <label>
                <span>Customer *</span>
                <select
                  onChange={(event) => selectCustomer(event.target.value)}
                  value={draft.customerId}
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {formatCustomerName(customer)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  onChange={(event) =>
                    updateDraft(
                      'status',
                      event.target.value as InvoiceStatus,
                    )
                  }
                  value={draft.status}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="overdue">Overdue</option>
                  <option value="void">Void</option>
                  <option disabled value="partial">
                    Partial payment (automatic)
                  </option>
                  <option disabled value="paid">
                    Paid (automatic)
                  </option>
                </select>
              </label>
              <label className="invoice-form-full-width">
                <span>Job or project name *</span>
                <input
                  onChange={(event) =>
                    updateDraft('jobName', event.target.value)
                  }
                  placeholder="Bathroom repair"
                  value={draft.jobName}
                />
              </label>
              <label className="invoice-form-full-width">
                <span>Service address</span>
                <input
                  onChange={(event) =>
                    updateDraft('serviceAddress', event.target.value)
                  }
                  placeholder="Customer service address"
                  value={draft.serviceAddress}
                />
              </label>
              <label>
                <span>Issue date</span>
                <input
                  onChange={(event) =>
                    updateDraft('issueDate', event.target.value)
                  }
                  type="date"
                  value={draft.issueDate}
                />
              </label>
              <label>
                <span>Due date</span>
                <input
                  onChange={(event) =>
                    updateDraft('dueDate', event.target.value)
                  }
                  type="date"
                  value={draft.dueDate}
                />
              </label>
              <label className="invoice-form-full-width">
                <span>Scope of work</span>
                <textarea
                  onChange={(event) =>
                    updateDraft('description', event.target.value)
                  }
                  placeholder="Describe the work completed or being billed."
                  rows={3}
                  value={draft.description}
                />
              </label>
            </div>

            <section className="invoice-line-items-section">
              <div className="invoice-section-heading">
                <div>
                  <p className="eyebrow">LINE ITEMS</p>
                  <h3>Labor, materials, and services</h3>
                </div>
                <button onClick={addLineItem} type="button">
                  <Plus aria-hidden="true" size={16} />
                  Add line item
                </button>
              </div>

              <div className="invoice-line-items">
                {draft.lineItems.map((lineItem) => (
                  <div className="invoice-line-item" key={lineItem.id}>
                    <label className="line-item-description">
                      <span>Description</span>
                      <input
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.id,
                            'description',
                            event.target.value,
                          )
                        }
                        placeholder="Service or material"
                        value={lineItem.description}
                      />
                    </label>
                    <label>
                      <span>Quantity</span>
                      <input
                        min="0.01"
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.id,
                            'quantity',
                            event.target.value,
                          )
                        }
                        step="0.25"
                        type="number"
                        value={lineItem.quantity}
                      />
                    </label>
                    <label>
                      <span>Unit price</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          updateLineItem(
                            lineItem.id,
                            'unitPrice',
                            event.target.value,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={lineItem.unitPrice}
                      />
                    </label>
                    <strong>
                      {formatCurrency(
                        lineItem.quantity * lineItem.unitPrice,
                      )}
                    </strong>
                    <button
                      aria-label="Remove line item"
                      disabled={draft.lineItems.length === 1}
                      onClick={() => removeLineItem(lineItem.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <div className="invoice-form-grid invoice-totals-fields">
              <div className="invoice-form-full-width"><PricingInsightPanel category={draft.jobCategory} customerId={draft.customerId} description={`${draft.jobName} ${draft.description} ${draft.lineItems.map((item) => item.description).join(' ')}`} onUsePrice={(price) => setDraft((current) => ({ ...current, lineItems: current.lineItems.length ? current.lineItems.map((item, index) => index === 0 ? { ...item, unitPrice: price, quantity: 1 } : item) : [{ ...createEmptyLineItem(), description: current.jobName || 'Handyman service', unitPrice: price }] }))} propertyType={draft.propertyType} /></div>
              <label><span>Job category</span><input onChange={(event) => updateDraft('jobCategory', event.target.value)} value={draft.jobCategory} /></label>
              <label><span>Property type</span><select onChange={(event) => updateDraft('propertyType', event.target.value as 'residential' | 'commercial')} value={draft.propertyType}><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
              <label><span>Material cost $</span><input min="0" onChange={(event) => updateDraft('materialCost', Number(event.target.value))} step="0.01" type="number" value={draft.materialCost} /></label>
              <label>
                <span>Tax rate %</span>
                <input
                  min="0"
                  onChange={(event) =>
                    updateDraft('taxRate', Number(event.target.value))
                  }
                  step="0.01"
                  type="number"
                  value={draft.taxRate}
                />
              </label>
              <label>
                <span>Discount $</span>
                <input
                  min="0"
                  onChange={(event) =>
                    updateDraft('discount', Number(event.target.value))
                  }
                  step="0.01"
                  type="number"
                  value={draft.discount}
                />
              </label>
              <label className="invoice-form-full-width">
                <span>Notes and payment terms</span>
                <textarea
                  onChange={(event) =>
                    updateDraft('notes', event.target.value)
                  }
                  rows={3}
                  value={draft.notes}
                />
              </label>
              <label className="invoice-form-full-width tax-reserve-control"><span>Tax reserve: {draft.taxReservePercent}%</span><input aria-label="Invoice tax reserve percentage" max="35" min="25" onChange={(event) => updateDraft('taxReservePercent', Number(event.target.value))} step="1" type="range" value={draft.taxReservePercent} /><small>Reserve {formatCurrency(draftTotal * draft.taxReservePercent / 100)} · Safe to spend {formatCurrency(draftTotal * (1 - draft.taxReservePercent / 100))}</small></label>
            </div>

            <div className="invoice-builder-footer">
              <div className="invoice-total-summary">
                <span>Subtotal {formatCurrency(draftSubtotal)}</span>
                <span>Tax {formatCurrency(draftTax)}</span>
                <strong>Total {formatCurrency(draftTotal)}</strong>
              </div>
              {formError && <p className="customer-form-error">{formError}</p>}
              <div className="invoice-modal-actions">
                <button
                  className="button-light"
                  onClick={closeBuilder}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button-dark"
                  onClick={saveInvoice}
                  type="button"
                >
                  {editingInvoiceId ? 'Save changes' : 'Create invoice'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {paymentInvoice && (
        <div className="modal-backdrop">
          <section
            aria-labelledby="payment-dialog-title"
            aria-modal="true"
            className="payment-modal"
            role="dialog"
          >
            <header className="invoice-modal-header">
              <div>
                <p className="eyebrow">PAYMENTS</p>
                <h2 id="payment-dialog-title">
                  {paymentInvoice.invoiceNumber}
                </h2>
                <p>
                  Balance due{' '}
                  <strong>
                    {formatCurrency(calculateInvoiceBalance(paymentInvoice))}
                  </strong>
                </p>
              </div>
              <button
                aria-label="Close payment"
                className="modal-close-button"
                onClick={closePayment}
                type="button"
              >
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            {calculateInvoiceBalance(paymentInvoice) > 0 &&
              paymentInvoice.status !== 'void' && (
                <div className="payment-form-grid">
                  <label>
                    <span>Payment date</span>
                    <input
                      onChange={(event) => setPaymentDate(event.target.value)}
                      type="date"
                      value={paymentDate}
                    />
                  </label>
                  <label>
                    <span>Amount</span>
                    <input
                      min="0.01"
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      step="0.01"
                      type="number"
                      value={paymentAmount}
                    />
                  </label>
                  <label>
                    <span>Method</span>
                    <select
                      onChange={(event) =>
                        setPaymentMethod(event.target.value as PaymentMethod)
                      }
                      value={paymentMethod}
                    >
                      {Object.entries(paymentMethodLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Reference number</span>
                    <input
                      onChange={(event) =>
                        setPaymentReference(event.target.value)
                      }
                      placeholder="Check number or transaction ID"
                      value={paymentReference}
                    />
                  </label>
                  <label className="invoice-form-full-width">
                    <span>Notes</span>
                    <textarea
                      onChange={(event) => setPaymentNotes(event.target.value)}
                      rows={2}
                      value={paymentNotes}
                    />
                  </label>
                  {paymentError && (
                    <p className="customer-form-error invoice-form-full-width">
                      {paymentError}
                    </p>
                  )}
                  <button
                    className="button-dark invoice-form-full-width"
                    onClick={savePayment}
                    type="button"
                  >
                    <CircleDollarSign aria-hidden="true" size={18} />
                    Save payment
                  </button>
                </div>
              )}

            <section className="payment-history">
              <h3>Payment history</h3>
              {paymentInvoice.payments.length === 0 ? (
                <p>No payments recorded yet.</p>
              ) : (
                paymentInvoice.payments.map((payment) => (
                  <div className="payment-history-row" key={payment.id}>
                    <div>
                      <strong>{formatCurrency(payment.amount)}</strong>
                      <span>
                        {formatDate(payment.date)} ·{' '}
                        {paymentMethodLabels[payment.method]}
                      </span>
                      {payment.referenceNumber && (
                        <span>Reference: {payment.referenceNumber}</span>
                      )}
                    </div>
                    <button
                      aria-label={`Remove ${formatCurrency(payment.amount)} payment`}
                      onClick={() =>
                        deletePayment(paymentInvoice.id, payment.id)
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                ))
              )}
            </section>
          </section>
        </div>
      )}

      {printInvoice && (
        <article className="invoice-print-sheet">
          <header className="invoice-print-header">
            <img
              alt={businessSettings.businessName}
              src="/rabbits-foot-logo.png"
            />
            <div className="invoice-print-business">
              <strong>{businessSettings.businessName}</strong>
              {businessSettings.phone && <span>{businessSettings.phone}</span>}
              {businessSettings.email && <span>{businessSettings.email}</span>}
              {businessSettings.website && <span>{businessSettings.website}</span>}
              {businessSettings.streetAddress && (
                <span>{businessSettings.streetAddress}</span>
              )}
              {(businessSettings.city || businessSettings.zipCode) && (
                <span>
                  {[
                    businessSettings.city,
                    businessSettings.state,
                    businessSettings.zipCode,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              )}
            </div>
            <div>
              <p>INVOICE</p>
              <h1>{printInvoice.invoiceNumber}</h1>
              <span>Issued {formatDate(printInvoice.issueDate)}</span>
              <span>Due {formatDate(printInvoice.dueDate)}</span>
            </div>
          </header>
          <section className="invoice-print-addresses">
            <div>
              <span>BILL TO</span>
              <strong>{formatCustomerName(printCustomer)}</strong>
              {printCustomer && <p>{formatCustomerAddress(printCustomer)}</p>}
              {printCustomer?.phone && <p>{printCustomer.phone}</p>}
              {printCustomer?.email && <p>{printCustomer.email}</p>}
            </div>
            <div>
              <span>SERVICE ADDRESS</span>
              <strong>{printInvoice.jobName}</strong>
              <p>{printInvoice.serviceAddress}</p>
            </div>
          </section>
          {printInvoice.description && (
            <section className="invoice-print-scope">
              <span>SCOPE OF WORK</span>
              <p>{printInvoice.description}</p>
            </section>
          )}
          <table className="invoice-print-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {printInvoice.lineItems.map((lineItem) => (
                <tr key={lineItem.id}>
                  <td>{lineItem.description}</td>
                  <td>{lineItem.quantity}</td>
                  <td>{formatCurrency(lineItem.unitPrice)}</td>
                  <td>
                    {formatCurrency(lineItem.quantity * lineItem.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <section className="invoice-print-totals">
            <div>
              <span>Subtotal</span>
              <strong>
                {formatCurrency(calculateInvoiceSubtotal(printInvoice))}
              </strong>
            </div>
            <div>
              <span>Tax</span>
              <strong>
                {formatCurrency(
                  calculateInvoiceSubtotal(printInvoice) *
                    (printInvoice.taxRate / 100),
                )}
              </strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>-{formatCurrency(printInvoice.discount)}</strong>
            </div>
            <div className="invoice-print-total">
              <span>Total</span>
              <strong>{formatCurrency(calculateInvoiceTotal(printInvoice))}</strong>
            </div>
            <div>
              <span>Payments</span>
              <strong>
                -{formatCurrency(calculatePaymentsTotal(printInvoice.payments))}
              </strong>
            </div>
            <div className="invoice-print-balance">
              <span>Balance due</span>
              <strong>
                {formatCurrency(calculateInvoiceBalance(printInvoice))}
              </strong>
            </div>
          </section>
          {printInvoice.notes && (
            <footer className="invoice-print-notes">
              <span>NOTES &amp; PAYMENT TERMS</span>
              <p>{printInvoice.notes}</p>
              <strong>Thank you for choosing Rabbit&apos;s Foot.</strong>
            </footer>
          )}
        </article>
      )}
    </>
  )
}

export default Invoices
