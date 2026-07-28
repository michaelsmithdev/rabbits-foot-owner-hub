export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'void'

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

  createdAt: string
  updatedAt: string
  paidAt: string | null
}