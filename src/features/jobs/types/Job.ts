import type { EstimateLineItem } from '../../estimates/types/Estimate'
import type { VoiceNote } from '../../voice/types/VoiceNote'

export type JobStatus = 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'invoiced'
export type JobExpenseCategory = 'materials' | 'delivery' | 'disposal' | 'equipment' | 'subcontractor' | 'other'

export type JobMaterialItem = {
  id: string
  item: string
  purchased: boolean
  loaded: boolean
  delivered: boolean
}

export type JobChangeOrderStatus = 'draft' | 'approved' | 'declined'

export type JobChangeOrder = {
  id: string
  discoveredCondition: string
  additionalWork: string
  additionalMaterial: string
  estimatedMaterialCost: number
  additionalLaborHours: number
  priceChange: number
  scheduleImpact: string
  status: JobChangeOrderStatus
  approvedBy?: string
  approvedAt?: string
  createdAt: string
}

export type JobTimeEntry = {
  id: string
  startedAt: string
  endedAt: string | null
}

export type JobExpense = {
  id: string
  category: JobExpenseCategory
  description: string
  vendor: string
  notes: string
  amount: number
  billable: boolean
  receiptPhotoIds: string[]
  createdAt: string
}

export type JobProfitability = {
  estimatedLaborHours: number
  actualLaborHours: number
  estimatedLaborCost: number
  actualLaborCost: number
  estimatedMaterialCost: number
  actualMaterialCost: number
  estimatedCost: number
  actualCost: number
  estimatedProfit: number
  actualProfit: number
  estimatedMargin: number
  actualMargin: number
  approvedChangeOrderTotal: number
  capturedAt: string
}

export type Job = {
  id: string
  jobNumber: string
  estimateId: string
  invoiceId?: string
  customerId: string
  jobName: string
  serviceAddress: string
  description: string
  scopeOfWork: string
  exclusions: string[]
  lineItems: EstimateLineItem[]
  quotedPrice: number
  taxRate: number
  discount: number
  estimatedLaborHours: number
  estimatedLaborCost: number
  estimatedMaterialCost: number
  estimatedCost: number
  materials: string[]
  materialChecklist: JobMaterialItem[]
  changeOrders: JobChangeOrder[]
  photoIds: string[]
  voiceNotes: VoiceNote[]
  internalNotes: string
  timeEntries: JobTimeEntry[]
  expenses: JobExpense[]
  profitability?: JobProfitability
  status: JobStatus
  completedAt: string | null
  createdAt: string
  updatedAt: string
}
