import type { Invoice } from '../types/Invoice'
import { calculateInvoiceBalance } from './invoiceMath.ts'

const LINKABLE_STATUSES = new Set<Invoice['status']>([
  'sent',
  'partial',
  'overdue',
])

export function invoiceNeedsSquarePaymentLink(invoice: Invoice) {
  if (!LINKABLE_STATUSES.has(invoice.status)) return false

  const balance = calculateInvoiceBalance(invoice)

  if (balance <= 0) return false

  return (
    !invoice.squarePaymentLink ||
    Math.abs(invoice.squarePaymentLink.amount - balance) > 0.005
  )
}
