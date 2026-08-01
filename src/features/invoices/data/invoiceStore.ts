import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
  PaymentMethod,
} from '../types/Invoice'
import { queueCollectionSync } from '../../cloud/syncQueue'

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
    typeof lineItem.description === 'string' &&
    typeof lineItem.quantity === 'number' &&
    Number.isFinite(lineItem.quantity) &&
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

  return {
    ...invoice,
    status: invoice.status as InvoiceStatus,
    payments,
  } as Invoice
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
    localStorage.setItem(
      INVOICES_STORAGE_KEY,
      JSON.stringify(invoices),
    )
    queueCollectionSync('invoice', invoices)
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
