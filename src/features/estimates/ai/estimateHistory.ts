import { loadCustomers } from '../../customers/data/customerStore'
import { loadInvoices } from '../../invoices/data/invoiceStore'
import { loadEstimates } from '../data/estimateStore'
import type { EstimateHistoryItem } from './types'

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function documentTotal(
  lineItems: Array<{ quantity: number; unitPrice: number }>,
  taxRate: number,
  discount: number,
): number {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )

  return roundCurrency(Math.max(0, subtotal + subtotal * (taxRate / 100) - discount))
}

function tokens(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2),
    ),
  ]
}

function relevanceScore(description: string, item: EstimateHistoryItem): number {
  const requestedTokens = tokens(description)
  const itemTokens = tokens(
    `${item.jobTitle} ${item.jobDescription} ${item.jobCategory} ${item.lineItems
      .map((lineItem) => lineItem.description)
      .join(' ')}`,
  )
  const overlap = requestedTokens.filter((word) => itemTokens.includes(word)).length
  const similarity = requestedTokens.length > 0 ? overlap / requestedTokens.length : 0
  const age = Date.now() - new Date(`${item.completionDate}T12:00:00`).getTime()
  const ageDays = Number.isFinite(age) ? Math.max(0, age / 86_400_000) : 3650
  const recency = Math.max(0, 0.25 - ageDays / 7300)

  return similarity + recency
}

export function buildEstimateHistory(
  description: string,
  customerId: string,
): EstimateHistoryItem[] {
  const customers = new Map(loadCustomers().map((customer) => [customer.id, customer]))
  const invoices = loadInvoices()
  const invoicedEstimateIds = new Set(
    invoices
      .map((invoice) => invoice.estimateId)
      .filter((estimateId): estimateId is string => Boolean(estimateId)),
  )

  const completedInvoices = invoices
    .filter((invoice) => invoice.status === 'paid' || Boolean(invoice.completionDate))
    .map<EstimateHistoryItem>((invoice) => {
      const finalTotal = documentTotal(
        invoice.lineItems,
        invoice.taxRate,
        invoice.discount,
      )
      const materialCost = roundCurrency(invoice.materialCost ?? 0)
      const aiDraft = invoice.aiEstimate?.draft

      return {
        source: 'invoice',
        documentNumber: invoice.invoiceNumber,
        jobTitle: invoice.jobName,
        jobDescription: invoice.description,
        finalTotal,
        laborHours:
          aiDraft?.laborHours ??
          invoice.lineItems
            .filter((item) => (item.unit ?? 'hour').toLowerCase().includes('hour'))
            .reduce((sum, item) => sum + item.quantity, 0),
        laborCost: roundCurrency(aiDraft?.laborCost ?? Math.max(0, finalTotal - materialCost)),
        materialCost,
        completionDate:
          invoice.completionDate ?? invoice.paidAt?.slice(0, 10) ?? invoice.issueDate,
        customerCity: customers.get(invoice.customerId)?.city ?? '',
        propertyType: invoice.propertyType ?? 'residential',
        jobCategory: invoice.jobCategory ?? 'General handyman',
        lineItems: invoice.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? 'each',
          unitPrice: item.unitPrice,
          total: roundCurrency(item.quantity * item.unitPrice),
        })),
      }
    })

  const completedEstimates = loadEstimates()
    .filter(
      (estimate) =>
        !invoicedEstimateIds.has(estimate.id) &&
        (estimate.status === 'approved' || Boolean(estimate.completionDate)),
    )
    .map<EstimateHistoryItem>((estimate) => {
      const finalTotal = documentTotal(
        estimate.lineItems,
        estimate.taxRate,
        estimate.discount,
      )
      const materialCost = roundCurrency(estimate.materialCost ?? 0)
      const aiDraft = estimate.aiEstimate?.draft

      return {
        source: 'estimate',
        documentNumber: estimate.estimateNumber,
        jobTitle: estimate.jobName,
        jobDescription: estimate.description,
        finalTotal,
        laborHours:
          aiDraft?.laborHours ??
          estimate.lineItems
            .filter((item) => (item.unit ?? 'hour').toLowerCase().includes('hour'))
            .reduce((sum, item) => sum + item.quantity, 0),
        laborCost: roundCurrency(aiDraft?.laborCost ?? Math.max(0, finalTotal - materialCost)),
        materialCost,
        completionDate: estimate.completionDate ?? estimate.issueDate,
        customerCity: customers.get(estimate.customerId)?.city ?? '',
        propertyType: estimate.propertyType ?? 'residential',
        jobCategory: estimate.jobCategory ?? 'General handyman',
        lineItems: estimate.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? 'each',
          unitPrice: item.unitPrice,
          total: roundCurrency(item.quantity * item.unitPrice),
        })),
      }
    })

  return [...completedInvoices, ...completedEstimates]
    .map((item) => ({
      item,
      score:
        relevanceScore(description, item) +
        (customerId &&
        (invoices.some(
          (invoice) =>
            invoice.invoiceNumber === item.documentNumber &&
            invoice.customerId === customerId,
        ) ||
          loadEstimates().some(
            (estimate) =>
              estimate.estimateNumber === item.documentNumber &&
              estimate.customerId === customerId,
          ))
          ? 0.2
          : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map(({ item }) => item)
}
