export type BusinessEventType =
  | 'customer_created'
  | 'lead_created'
  | 'lead_updated'
  | 'estimate_created'
  | 'estimate_sent'
  | 'estimate_viewed'
  | 'estimate_accepted'
  | 'estimate_declined'
  | 'estimate_expired'
  | 'job_created'
  | 'job_scheduled'
  | 'job_started'
  | 'job_completed'
  | 'receipt_scanned'
  | 'receipt_processed'
  | 'expense_created'
  | 'expense_updated'
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'invoice_paid'
  | 'payment_received'
  | 'before_photo_uploaded'
  | 'after_photo_uploaded'
  | 'review_requested'

export type BusinessEntityType =
  | 'customer'
  | 'lead'
  | 'estimate'
  | 'job'
  | 'expense'
  | 'invoice'
  | 'payment'
  | 'photo'
  | 'communication'

export interface BusinessEvent {
  id: string
  type: BusinessEventType
  timestamp: string
  entityType?: BusinessEntityType
  entityId?: string
  customerId?: string
  jobId?: string
  metadata?: Record<string, unknown>
}

export type AiOperatingMode = 'manual' | 'approval' | 'autopilot'

export type AiActionType =
  | 'create_customer_task'
  | 'create_estimate_draft'
  | 'create_invoice_draft'
  | 'create_expense'
  | 'link_expense_to_job'
  | 'categorize_expense'
  | 'send_customer_message'
  | 'draft_customer_message'
  | 'create_job_checklist'
  | 'update_job_cost'
  | 'request_review'
  | 'create_social_draft'
  | 'generate_material_list'
  | 'flag_pricing_problem'
  | 'create_owner_alert'

export type AiActionRisk = 'low' | 'medium' | 'high' | 'restricted'
export type AiActionStatus =
  | 'pending'
  | 'approved'
  | 'dismissed'
  | 'completed'
  | 'failed'

export type AiActionSection =
  | 'needs_attention'
  | 'ready_to_invoice'
  | 'expense_alert'
  | 'marketing_opportunity'
  | 'pricing_intelligence'

export interface AiAction {
  id: string
  type: AiActionType
  section: AiActionSection
  title: string
  summary: string
  reason: string
  proposedResult: string
  risk: AiActionRisk
  confidence: number
  status: AiActionStatus
  entityType?: BusinessEntityType
  entityId?: string
  customerId?: string
  jobId?: string
  input: Record<string, unknown>
  source: 'rules' | 'ai'
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  result?: Record<string, unknown>
  error?: string
}

export interface AiAuditEntry {
  id: string
  timestamp: string
  action: AiActionType
  reason: string
  relatedEntity?: {
    type: BusinessEntityType
    id: string
  }
  model: string
  confidence: number
  status: 'approved' | 'dismissed' | 'completed' | 'failed'
  ownerApproval: 'owner' | 'autopilot' | 'not_required' | 'dismissed'
  result: Record<string, unknown>
}

export interface AutomationSettings {
  id: 'automation-settings'
  mode: AiOperatingMode
  allowedAutopilotActions: AiActionType[]
  dailyBriefEnabled: boolean
  inAppNotifications: boolean
  minimumConfidence: number
  customerFollowUpsEnabled: boolean
  estimateFollowUpScheduleDays: number[]
  invoiceReminderScheduleDays: number[]
  reviewRequestDelayDays: number
  updatedAt: string
}

export const AUTOPILOT_ELIGIBLE_ACTIONS: AiActionType[] = [
  'draft_customer_message',
  'create_job_checklist',
  'create_social_draft',
  'generate_material_list',
  'flag_pricing_problem',
  'create_owner_alert',
]

export const defaultAutomationSettings: AutomationSettings = {
  id: 'automation-settings',
  mode: 'approval',
  allowedAutopilotActions: [],
  dailyBriefEnabled: true,
  inAppNotifications: true,
  minimumConfidence: 0.75,
  customerFollowUpsEnabled: true,
  estimateFollowUpScheduleDays: [2, 5, 10],
  invoiceReminderScheduleDays: [1, 7, 14],
  reviewRequestDelayDays: 2,
  updatedAt: new Date(0).toISOString(),
}
