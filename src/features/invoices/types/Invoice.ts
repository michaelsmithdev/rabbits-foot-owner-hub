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

  jobName: string
  serviceAddress: string
  description: string

  issueDate: string
  dueDate: string

  lineItems: InvoiceLineItem[]

  taxRate: number
  discount: number

  notes: string
  status: InvoiceStatus
  payments: InvoicePayment[]

  createdAt: string
  updatedAt: string
  paidAt: string | null
}
