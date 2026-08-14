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

export type InvoiceLineItemKind = 'service' | 'material'

export type InvoicePayment = {
  id: string
  date: string
  amount: number
  method: PaymentMethod
  referenceNumber: string
  notes: string
  /** Amount Square charged above the invoice payment for card processing. */
  cardFeeAmount?: number
  /** Total amount collected by Square, including any card fee. */
  grossAmount?: number
  createdAt: string
}

export type InvoiceLineItem = {
  id: string
  /** Older saved invoices omit this field and are treated as service lines. */
  kind?: InvoiceLineItemKind
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
  /** Optional fee shown only when the customer chooses card checkout. */
  cardProcessingFeePercent?: number
  completionDate?: string
  photoIds?: string[]
  aiEstimate?: AiEstimateGeneration
  status: InvoiceStatus
  payments: InvoicePayment[]
  squarePaymentLink?: {
    url: string
    paymentLinkId?: string
    orderId?: string
    amount: number
    invoiceAmount?: number
    cardFeeAmount?: number
    cardFeePercent?: number
    source?: 'customer_portal' | 'owner'
    createdAt: string
  }

  createdAt: string
  updatedAt: string
  paidAt: string | null
}
