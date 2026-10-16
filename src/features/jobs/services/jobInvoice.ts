import { createInvoiceNumber } from '../../invoices/data/invoiceStore'
import type { Invoice } from '../../invoices/types/Invoice'
import type { BusinessSettings } from '../../settings/types/BusinessSettings'
import type { Estimate } from '../../estimates/types/Estimate'
import type { Job } from '../types/Job'

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createInvoiceDraftFromJob(
  job: Job,
  invoices: Invoice[],
  settings: BusinessSettings,
  sourceEstimate?: Estimate,
  now = new Date(),
) {
  void sourceEstimate
  const existing = invoices.find((invoice) =>
    invoice.jobId === job.id || invoice.estimateId === job.estimateId,
  )
  if (existing) return { invoice: existing, created: false }

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
      ...job.changeOrders
        .filter((item) => item.status === 'approved')
        .map((item) => ({
          id: createId(),
          description: `Approved change order: ${item.additionalWork}`,
          quantity: 1,
          unit: 'change',
          unitPrice: item.priceChange,
        })),
      ...job.expenses
        .filter((item) => item.billable)
        .map((item) => ({
          id: createId(),
          description: item.description,
          quantity: 1,
          unit: item.category,
          unitPrice: item.amount,
        })),
    ],
    taxRate: job.taxRate,
    discount: job.discount,
    notes: settings.invoiceTerms,
    cardProcessingFeePercent: 0,
    cardProcessingFeeMode: 'optional',
    paymentPolicyVersion: 2,
    completionDate: job.completedAt?.slice(0, 10),
    photoIds: [...job.photoIds],
    status: 'draft',
    payments: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    paidAt: null,
  }

  return { invoice, created: true }
}
