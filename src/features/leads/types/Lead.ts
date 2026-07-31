export type LeadStatus = 'unread' | 'read' | 'flagged' | 'archived'

export type LeadActivity = {
  id: string
  type: 'submitted' | 'status' | 'converted' | 'estimate' | 'note'
  message: string
  createdAt: string
}
export type Lead = {
  id: string
  organizationId: string
  source: string
  status: LeadStatus
  name: string
  phone: string
  email: string
  service: string
  address: string
  description: string
  photoPaths: string[]
  activity: LeadActivity[]
  convertedCustomerId: string | null
  estimateId: string | null
  submittedAt: string
  updatedAt: string
}
