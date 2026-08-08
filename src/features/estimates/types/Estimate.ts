import type { AiEstimateEconomics, AiEstimateGeneration } from '../ai/types'

export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'declined'

export interface EstimateLineItem {
  id: string
  description: string
  quantity: number
  unit?: string
  unitPrice: number
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
  completionDate?: string
  photoIds?: string[]
  aiEstimate?: AiEstimateGeneration
  economics?: AiEstimateEconomics
  walkthroughId?: string
  jobId?: string
  status: EstimateStatus
  createdAt: string
  updatedAt: string
}
