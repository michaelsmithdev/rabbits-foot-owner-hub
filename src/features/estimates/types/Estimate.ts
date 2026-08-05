import type { AiEstimateGeneration } from '../ai/types'

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
  status: EstimateStatus
  createdAt: string
  updatedAt: string
}
