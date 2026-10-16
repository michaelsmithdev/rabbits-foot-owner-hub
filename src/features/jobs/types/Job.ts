import type { EstimateLineItem } from '../../estimates/types/Estimate'
import type { VoiceNote } from '../../voice/types/VoiceNote'

export type JobStatus = 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'invoiced'
export type JobExpenseCategory =
  | 'materials'
  | 'tools'
  | 'fuel'
  | 'vehicle'
  | 'delivery'
  | 'disposal'
  | 'equipment'
  | 'subcontractor'
  | 'office'
  | 'advertising'
  | 'software'
  | 'insurance'
  | 'permits'
  | 'miscellaneous'

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

export type JobFieldChecklist = {
  safetyReview: boolean
  beforePhotos: boolean
  scopeConfirmed: boolean
  materialsLoaded: boolean
  cleanupComplete: boolean
  afterPhotos: boolean
  customerWalkthrough: boolean
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
  quotedRevenue: number
  actualRevenue: number
  estimatedMaterials: number
  actualMaterials: number
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
  laborCost: number
  otherExpenses: number
  totalJobCost: number
  grossProfit: number
  grossMargin: number
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
  assignedMemberIds: string[]
  crewInstructions: string
  fieldChecklist: JobFieldChecklist
  timeEntries: JobTimeEntry[]
  expenses: JobExpense[]
  profitability?: JobProfitability
  status: JobStatus
  completedAt: string | null
  createdAt: string
  updatedAt: string
}
