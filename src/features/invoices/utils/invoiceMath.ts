import type {
  Invoice,
  InvoiceLineItem,
  InvoicePayment,
  InvoiceStatus,
} from '../types/Invoice'

type InvoiceAmounts = Pick<Invoice, 'discount' | 'taxRate'> & {
  lineItems: InvoiceLineItem[]
}

export function calculateInvoiceSubtotal(invoice: InvoiceAmounts) {
  return invoice.lineItems.reduce(
    (sum, lineItem) =>
      sum + lineItem.quantity * lineItem.unitPrice,
    0,
  )
}

export function calculateInvoiceTotal(invoice: InvoiceAmounts) {
  const subtotal = calculateInvoiceSubtotal(invoice)
  const tax = subtotal * (invoice.taxRate / 100)

  return Math.max(0, subtotal + tax - invoice.discount)
}

export function calculatePaymentsTotal(payments: InvoicePayment[]) {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

export function calculateInvoiceBalance(invoice: Invoice) {
  return Math.max(
    0,
    calculateInvoiceTotal(invoice) -
      calculatePaymentsTotal(invoice.payments),
  )
}

export function getPaymentAdjustedStatus(
  invoice: Invoice,
  requestedStatus: InvoiceStatus = invoice.status,
): InvoiceStatus {
  if (requestedStatus === 'void') {
    return 'void'
  }

  const total = calculateInvoiceTotal(invoice)
  const paid = calculatePaymentsTotal(invoice.payments)

  if (total > 0 && paid >= total) {
    return 'paid'
  }

  if (paid > 0) {
    return 'partial'
  }

  if (requestedStatus === 'paid' || requestedStatus === 'partial') {
    return 'sent'
  }

  return requestedStatus
}
