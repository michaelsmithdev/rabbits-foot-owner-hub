import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
  PaymentMethod,
} from '../types/Invoice'
import { queueCollectionSync } from '../../cloud/syncQueue'
import { recordBusinessEvent } from '../../aiOperations/data/operationsStore'

const INVOICES_STORAGE_KEY = 'rabbits-foot-invoices'

const invoiceStatuses: InvoiceStatus[] = [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'void',
]

const paymentMethods: PaymentMethod[] = [
  'cash',
  'check',
  'card',
  'online',
]

function isLineItem(value: unknown): value is InvoiceLineItem {
  if (!value || typeof value !== 'object') return false

  const lineItem = value as Partial<InvoiceLineItem>

  return (
    typeof lineItem.id === 'string' &&
    (lineItem.kind === undefined ||
      lineItem.kind === 'service' ||
      lineItem.kind === 'material') &&
    typeof lineItem.description === 'string' &&
    typeof lineItem.quantity === 'number' &&
    Number.isFinite(lineItem.quantity) &&
    (lineItem.unit === undefined || typeof lineItem.unit === 'string') &&
    typeof lineItem.unitPrice === 'number' &&
    Number.isFinite(lineItem.unitPrice)
  )
}

function isPayment(value: unknown): value is InvoicePayment {
  if (!value || typeof value !== 'object') return false

  const payment = value as Partial<InvoicePayment>

  return (
    typeof payment.id === 'string' &&
    typeof payment.date === 'string' &&
    typeof payment.amount === 'number' &&
    Number.isFinite(payment.amount) &&
    typeof payment.method === 'string' &&
    paymentMethods.includes(payment.method as PaymentMethod) &&
    typeof payment.referenceNumber === 'string' &&
    typeof payment.notes === 'string' &&
    typeof payment.createdAt === 'string'
  )
}

export function applyCurrentInvoicePaymentPolicy(invoice: Invoice): Invoice {
  const usesCurrentPaymentPolicy = invoice.paymentPolicyVersion === 2
  const legacyIssueDate = new Date(`${invoice.issueDate}T00:00:00Z`)
  const legacyDueDate = new Date(`${invoice.dueDate}T00:00:00Z`)
  const wasLegacyFourteenDayTerm =
    Number.isFinite(legacyIssueDate.getTime()) &&
    Number.isFinite(legacyDueDate.getTime()) &&
    legacyDueDate.getTime() - legacyIssueDate.getTime() ===
      14 * 24 * 60 * 60 * 1000

  return {
    ...invoice,
    dueDate:
      !usesCurrentPaymentPolicy && wasLegacyFourteenDayTerm
        ? invoice.issueDate
        : invoice.dueDate,
    notes:
      !usesCurrentPaymentPolicy &&
      invoice.notes.trim() === 'Payment is due within 14 days.'
        ? 'Payment is due upon completion.'
        : invoice.notes,
    cardProcessingFeePercent:
      invoice.cardProcessingFeeMode === 'optional'
        ? Math.min(15, Math.max(0, invoice.cardProcessingFeePercent ?? 0))
        : 0,
    cardProcessingFeeMode: 'optional',
    paymentPolicyVersion: 2,
  }
}

function normalizeInvoice(value: unknown): Invoice | null {
  if (!value || typeof value !== 'object') return null

  const invoice = value as Partial<Invoice>

  if (
    typeof invoice.id !== 'string' ||
    typeof invoice.invoiceNumber !== 'string' ||
    typeof invoice.customerId !== 'string' ||
    !(
      invoice.estimateId === null ||
      typeof invoice.estimateId === 'string'
    ) ||
    typeof invoice.jobName !== 'string' ||
    typeof invoice.serviceAddress !== 'string' ||
    typeof invoice.description !== 'string' ||
    typeof invoice.issueDate !== 'string' ||
    typeof invoice.dueDate !== 'string' ||
    !Array.isArray(invoice.lineItems) ||
    !invoice.lineItems.every(isLineItem) ||
    typeof invoice.taxRate !== 'number' ||
    typeof invoice.discount !== 'number' ||
    typeof invoice.notes !== 'string' ||
    typeof invoice.status !== 'string' ||
    !invoiceStatuses.includes(invoice.status as InvoiceStatus) ||
    typeof invoice.createdAt !== 'string' ||
    typeof invoice.updatedAt !== 'string' ||
    !(
      invoice.paidAt === null ||
      typeof invoice.paidAt === 'string'
    )
  ) {
    return null
  }

  const payments = Array.isArray(invoice.payments)
    ? invoice.payments.filter(isPayment)
    : []

  return applyCurrentInvoicePaymentPolicy({
    ...invoice,
    status: invoice.status as InvoiceStatus,
    payments,
  } as Invoice)
}

export function loadInvoices(): Invoice[] {
  try {
    const storedInvoices = localStorage.getItem(INVOICES_STORAGE_KEY)

    if (!storedInvoices) return []

    const parsedInvoices: unknown = JSON.parse(storedInvoices)

    if (!Array.isArray(parsedInvoices)) return []

    return parsedInvoices
      .map(normalizeInvoice)
      .filter((invoice): invoice is Invoice => invoice !== null)
  } catch (error) {
    console.error('Unable to load invoices:', error)
    return []
  }
}

export function saveInvoices(invoices: Invoice[]): void {
  try {
    const previous = new Map(loadInvoices().map((invoice) => [invoice.id, invoice]))
    localStorage.setItem(
      INVOICES_STORAGE_KEY,
      JSON.stringify(invoices),
    )
    queueCollectionSync('invoice', invoices)
    invoices.forEach((invoice) => {
      const prior = previous.get(invoice.id)
      const eventType = !prior
        ? 'invoice_created'
        : prior.status !== invoice.status
          ? invoice.status === 'sent'
            ? 'invoice_sent'
            : invoice.status === 'overdue'
              ? 'invoice_overdue'
              : invoice.status === 'paid'
                ? 'invoice_paid'
                : null
          : null
      if (eventType) {
        recordBusinessEvent({
          type: eventType, timestamp: invoice.paidAt ?? invoice.updatedAt,
          entityType: 'invoice', entityId: invoice.id, customerId: invoice.customerId,
          jobId: invoice.jobId,
        })
      }
      const priorPayments = new Set(prior?.payments.map((payment) => payment.id) ?? [])
      invoice.payments.filter((payment) => !priorPayments.has(payment.id)).forEach((payment) => {
        recordBusinessEvent({
          type: 'payment_received', timestamp: payment.createdAt,
          entityType: 'payment', entityId: payment.id, customerId: invoice.customerId,
          jobId: invoice.jobId, metadata: { invoiceId: invoice.id, amount: payment.amount, method: payment.method },
        })
      })
    })
  } catch (error) {
    console.error('Unable to save invoices:', error)
  }
}

export function createInvoiceNumber(
  invoices: Invoice[],
  prefix = 'INV',
): string {
  const currentYear = new Date().getFullYear()
  const invoiceNumbers = invoices
    .map((invoice) => {
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = invoice.invoiceNumber.match(
        new RegExp(`^${escapedPrefix}-(\\d{4})-(\\d+)$`),
      )

      if (!match || Number(match[1]) !== currentYear) return null

      return Number(match[2])
    })
    .filter((number): number is number => number !== null)

  const nextSequence =
    invoiceNumbers.length > 0 ? Math.max(...invoiceNumbers) + 1 : 1

  return `${prefix}-${currentYear}-${String(nextSequence).padStart(4, '0')}`
}
