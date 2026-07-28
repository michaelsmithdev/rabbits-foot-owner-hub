export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'declined'

export interface EstimateLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export interface Estimate {
  id: string
  estimateNumber: string
  customerId: string
  jobName: string
  serviceAddress: string
  description: string
  issueDate: string
  expirationDate: string
  lineItems: EstimateLineItem[]
  taxRate: number
  discount: number
  notes: string
  status: EstimateStatus
  createdAt: string
  updatedAt: string
}