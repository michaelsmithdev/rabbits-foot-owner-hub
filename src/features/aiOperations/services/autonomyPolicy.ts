import type { AiActionRisk, AiActionType } from '../types'

export const AI_ACTION_POLICIES: Record<AiActionType, {
  risk: AiActionRisk
  requiresOwnerApproval: boolean
  reversible: boolean
}> = {
  create_customer_task: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  create_estimate_draft: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  create_invoice_draft: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  create_expense: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  link_expense_to_job: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  categorize_expense: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  send_customer_message: { risk: 'high', requiresOwnerApproval: true, reversible: false },
  draft_customer_message: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  create_job_checklist: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  update_job_cost: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  request_review: { risk: 'medium', requiresOwnerApproval: true, reversible: true },
  create_social_draft: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  generate_material_list: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  flag_pricing_problem: { risk: 'low', requiresOwnerApproval: false, reversible: true },
  create_owner_alert: { risk: 'low', requiresOwnerApproval: false, reversible: true },
}

export function isAutopilotSafe(type: AiActionType) {
  return [
    'draft_customer_message', 'create_job_checklist', 'create_social_draft',
    'generate_material_list', 'flag_pricing_problem', 'create_owner_alert',
  ].includes(type)
}
