import type { Estimate } from '../../estimates/types/Estimate'
import type { Invoice } from '../../invoices/types/Invoice'

export type CustomerDocumentStats = {
  documents: number
  billed: number
}

export function buildCustomerDocumentStats(
  estimates: Estimate[],
  invoices: Invoice[],
) {
  const stats = new Map<string, CustomerDocumentStats>()

  const update = (
    customerId: string,
    documents: number,
    billed: number,
  ) => {
    const current = stats.get(customerId) ?? { documents: 0, billed: 0 }
    stats.set(customerId, {
      documents: current.documents + documents,
      billed: current.billed + billed,
    })
  }

  estimates.forEach((estimate) => update(estimate.customerId, 1, 0))
  invoices.forEach((invoice) => {
    const subtotal = invoice.lineItems.reduce(
      (sum, lineItem) => sum + lineItem.quantity * lineItem.unitPrice,
      0,
    )
    const total = Math.max(
      0,
      subtotal + subtotal * (invoice.taxRate / 100) - invoice.discount,
    )
    update(invoice.customerId, 1, total)
  })

  return stats
}
