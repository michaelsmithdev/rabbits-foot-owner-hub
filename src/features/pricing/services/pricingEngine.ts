import { loadEstimates } from '../../estimates/data/estimateStore'
import { loadInvoices } from '../../invoices/data/invoiceStore'

export type PricingRecord = {
  id: string
  documentType: 'Estimate' | 'Invoice'
  number: string
  customerId: string
  jobName: string
  category: string
  propertyType: 'residential' | 'commercial'
  total: number
  labor: number
  materials: number
  grossProfit: number
  date: string
  status: string
  keywords: string[]
}

export type PricingSuggestion = {
  suggestedPrice: number
  low: number
  high: number
  confidence: number
  sampleSize: number
  explanation: string
  matches: PricingRecord[]
}

function tokens(value: string) {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2))]
}

function invoiceTotal(lineItems: Array<{ quantity: number; unitPrice: number }>, discount: number, taxRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return Math.max(0, subtotal - discount) * (1 + taxRate / 100)
}

export function loadPricingRecords(): PricingRecord[] {
  const estimates: PricingRecord[] = loadEstimates().map((item) => {
    const total = invoiceTotal(item.lineItems, item.discount, item.taxRate)
    const materials = item.materialCost ?? 0
    return { id: item.id, documentType: 'Estimate', number: item.estimateNumber, customerId: item.customerId, jobName: item.jobName, category: item.jobCategory || 'General handyman', propertyType: item.propertyType || 'residential', total, materials, labor: Math.max(0, total - materials), grossProfit: Math.max(0, total - materials), date: item.completionDate || item.issueDate, status: item.status, keywords: tokens(`${item.jobName} ${item.description} ${item.lineItems.map((line) => line.description).join(' ')}`) }
  })
  const invoices: PricingRecord[] = loadInvoices().map((item) => {
    const total = invoiceTotal(item.lineItems, item.discount, item.taxRate)
    const materials = item.materialCost ?? 0
    return { id: item.id, documentType: 'Invoice', number: item.invoiceNumber, customerId: item.customerId, jobName: item.jobName, category: item.jobCategory || 'General handyman', propertyType: item.propertyType || 'residential', total, materials, labor: Math.max(0, total - materials), grossProfit: Math.max(0, total - materials), date: item.completionDate || item.issueDate, status: item.status, keywords: tokens(`${item.jobName} ${item.description} ${item.lineItems.map((line) => line.description).join(' ')}`) }
  })
  return [...invoices, ...estimates].sort((a, b) => b.date.localeCompare(a.date))
}

export function suggestPrice(description: string, category = '', propertyType: 'residential' | 'commercial' = 'residential', customerId = ''): PricingSuggestion | null {
  const searchTokens = tokens(`${description} ${category}`)
  const scored = loadPricingRecords().map((record) => {
    const overlap = searchTokens.filter((word) => record.keywords.includes(word)).length
    const keywordScore = searchTokens.length ? overlap / searchTokens.length : 0
    const categoryScore = category && record.category.toLowerCase() === category.toLowerCase() ? 0.35 : 0
    const propertyScore = record.propertyType === propertyType ? 0.1 : 0
    const customerScore = customerId && record.customerId === customerId ? 0.15 : 0
    const ageDays = Math.max(0, (Date.now() - new Date(`${record.date}T12:00:00`).getTime()) / 86_400_000)
    const recencyScore = Math.max(0, 0.15 - ageDays / 3650)
    return { record, score: keywordScore + categoryScore + propertyScore + customerScore + recencyScore }
  }).filter((item) => item.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 12)
  if (!scored.length) return null
  const weightTotal = scored.reduce((sum, item) => sum + item.score, 0)
  const suggestedPrice = scored.reduce((sum, item) => sum + item.record.total * item.score, 0) / weightTotal
  const prices = scored.map((item) => item.record.total)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const spread = suggestedPrice > 0 ? (high - low) / suggestedPrice : 1
  const confidence = Math.round(Math.min(96, 42 + scored.length * 6 + scored[0].score * 22 - Math.min(22, spread * 10)))
  return { suggestedPrice, low, high, confidence: Math.max(20, confidence), sampleSize: scored.length, explanation: `Based on ${scored.length} similar past job${scored.length === 1 ? '' : 's'}, weighted toward matching services, property type, customer history, and recent work.`, matches: scored.map((item) => item.record) }
}
