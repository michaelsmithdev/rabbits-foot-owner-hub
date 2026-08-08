import type { AiEstimateGeneration } from '../../estimates/ai/types'

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void'

export type PaymentMethod =
  | 'cash'
  | 'check'
  | 'card'
  | 'online'

export type InvoicePayment = {
  id: string
  date: string
  amount: number
  method: PaymentMethod
  referenceNumber: string
  notes: string
  createdAt: string
}

export type InvoiceLineItem = {
  id: string
  description: string
  quantity: number
  unit?: string
  unitPrice: number
}

export type Invoice = {
  id: string
  invoiceNumber: string

  customerId: string

  /**
   * The estimate this invoice came from.
   * Null means the invoice was created manually.
   */
  estimateId: string | null
  jobId?: string

  jobName: string
  serviceAddress: string
  description: string
  scopeOfWork?: string
  exclusions?: string[]

  issueDate: string
  dueDate: string

  lineItems: InvoiceLineItem[]

  taxRate: number
  discount: number

  notes: string
  propertyType?: 'residential' | 'commercial'
  jobCategory?: string
  materialCost?: number
  taxReservePercent?: number
  completionDate?: string
  photoIds?: string[]
  aiEstimate?: AiEstimateGeneration
  status: InvoiceStatus
  payments: InvoicePayment[]

  createdAt: string
  updatedAt: string
  paidAt: string | null
}
