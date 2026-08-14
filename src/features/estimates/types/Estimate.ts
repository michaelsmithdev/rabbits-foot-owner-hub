import type { AiEstimateEconomics, AiEstimateGeneration } from '../ai/types'

export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'declined'

export type EstimateLineItemKind = 'service' | 'material'

export interface EstimateLineItem {
  id: string
  /** Older saved estimates omit this field and are treated as service lines. */
  kind?: EstimateLineItemKind
  description: string
  quantity: number
  unit?: string
  unitPrice: number
}

export type EstimateApprovalMethod =
  | 'signed_in_person'
  | 'email'
  | 'text'
  | 'verbal'

export interface EstimateApprovalSnapshot {
  estimateNumber: string
  revisionNumber: number
  customerId: string
  jobName: string
  serviceAddress: string
  scopeOfWork: string
  exclusions: string[]
  lineItems: EstimateLineItem[]
  taxRate: number
  discount: number
  acceptedAmount: number
}

export interface EstimateApproval {
  customerName: string
  method: EstimateApprovalMethod
  note: string
  acceptedAt: string
  snapshot: EstimateApprovalSnapshot
}

export interface Estimate {
  id: string
  estimateNumber: string
  customerId: string
  jobName: string
  serviceAddress: string
  description: string
  scopeOfWork?: string
  exclusions?: string[]
  issueDate: string
  expirationDate: string
  lineItems: EstimateLineItem[]
  taxRate: number
  discount: number
  notes: string
  propertyType?: 'residential' | 'commercial'
  jobCategory?: string
  materialCost?: number
  taxReservePercent?: number
  /** Optional fee shown only when the customer chooses card checkout. */
  cardProcessingFeePercent?: number
  /** Legacy all-in pricing marker retained so older estimates are never charged twice. */
  paymentProcessingOverheadPercent?: number
  completionDate?: string
  photoIds?: string[]
  aiEstimate?: AiEstimateGeneration
  economics?: AiEstimateEconomics
  walkthroughId?: string
  jobId?: string
  revisionOfId?: string
  revisionNumber?: number
  approval?: EstimateApproval
  status: EstimateStatus
  createdAt: string
  updatedAt: string
}
