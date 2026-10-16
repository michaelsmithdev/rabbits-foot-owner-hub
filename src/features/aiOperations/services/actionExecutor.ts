import { saveCommunications, loadCommunications } from '../../communications/data/communicationStore'
import type { Communication } from '../../communications/types/Communication'
import { buildReviewRequestMessage } from '../../communications/customerContact'
import { loadCustomers } from '../../customers/data/customerStore'
import { loadEstimates } from '../../estimates/data/estimateStore'
import { loadExpenses, saveExpenses } from '../../expenses/data/expenseStore'
import { syncExpenseToJobs } from '../../expenses/services/expenseJobLink'
import type { ExpenseCategory } from '../../expenses/types/ExpenseRecord'
import { loadInvoices, saveInvoices } from '../../invoices/data/invoiceStore'
import { loadLeads, saveLeads } from '../../leads/data/leadStore'
import { createInvoiceDraftFromJob } from '../../jobs/services/jobInvoice'
import { loadJobs, saveJobs } from '../../jobs/data/jobStore'
import { calculateJobCosting } from '../../jobs/utils/jobCosting'
import { loadBusinessSettings } from '../../settings/data/businessSettingsStore'
import {
  appendAiAudit,
  loadAiActions,
  loadAutomationSettings,
  updateAiAction,
} from '../data/operationsStore'
import { AI_ACTION_POLICIES, isAutopilotSafe } from './autonomyPolicy'
import type { AiAction, AiAuditEntry } from '../types'

export { AI_ACTION_POLICIES } from './autonomyPolicy'

const expenseCategories: ExpenseCategory[] = [
  'materials', 'tools', 'fuel', 'vehicle', 'subcontractor', 'equipment_rental',
  'office', 'advertising', 'software', 'insurance', 'permits', 'miscellaneous',
]

function inputString(action: AiAction, key: string) {
  const value = action.input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`AI action is missing ${key}.`)
  return value.trim()
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function draftCommunication(action: AiAction, kind: Communication['kind'] = 'estimate_follow_up') {
  const customerId = inputString(action, 'customerId')
  if (!loadCustomers().some((customer) => customer.id === customerId)) throw new Error('The customer no longer exists.')
  const body = inputString(action, 'body').slice(0, 3_000)
  const subject = inputString(action, 'subject').slice(0, 180)
  const documentId = typeof action.input.documentId === 'string' ? action.input.documentId : undefined
  const existing = loadCommunications().find((communication) =>
    communication.customerId === customerId &&
    communication.documentId === documentId &&
    communication.kind === kind &&
    communication.body === body,
  )
  if (existing) return { communicationId: existing.id, created: false, summary: 'The same message draft already exists.' }

  const communication: Communication = {
    id: createId(), customerId, documentId, channel: 'sms', kind,
    status: 'drafted', subject, body, createdAt: new Date().toISOString(),
  }
  saveCommunications([communication, ...loadCommunications()])
  return { communicationId: communication.id, created: true, summary: 'Customer message draft created. It was not sent.' }
}

function executeTool(action: AiAction): Record<string, unknown> {
  switch (action.type) {
    case 'create_invoice_draft': {
      const jobId = inputString(action, 'jobId')
      const jobs = loadJobs()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error('The job no longer exists.')
      if (!['completed', 'invoiced'].includes(job.status)) throw new Error('Only a completed job can be invoiced from AI Operations.')
      const invoices = loadInvoices()
      const estimate = loadEstimates().find((item) => item.id === job.estimateId)
      const result = createInvoiceDraftFromJob(job, invoices, loadBusinessSettings(), estimate)
      if (result.created) saveInvoices([result.invoice, ...invoices])
      saveJobs(jobs.map((item) => item.id === job.id
        ? { ...item, invoiceId: result.invoice.id, status: 'invoiced', updatedAt: new Date().toISOString() }
        : item))
      return { invoiceId: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber, created: result.created, summary: result.created ? 'Draft invoice created for owner review.' : 'The existing job invoice was linked.' }
    }
    case 'link_expense_to_job': {
      const expenseId = inputString(action, 'expenseId')
      const jobId = inputString(action, 'jobId')
      if (!loadJobs().some((job) => job.id === jobId)) throw new Error('The suggested job no longer exists.')
      const expenses = loadExpenses()
      const expense = expenses.find((item) => item.id === expenseId)
      if (!expense) throw new Error('The expense no longer exists.')
      const previousJobId = expense.jobId
      const updated = { ...expense, jobId, updatedAt: new Date().toISOString() }
      saveExpenses(expenses.map((item) => item.id === expenseId ? updated : item))
      syncExpenseToJobs(updated, updated.id)
      return { expenseId, jobId, previousJobId, summary: 'Expense linked to the approved job; job costs now include it.' }
    }
    case 'categorize_expense': {
      const expenseId = inputString(action, 'expenseId')
      const category = inputString(action, 'category') as ExpenseCategory
      if (!expenseCategories.includes(category)) throw new Error('The suggested expense category is not allowed.')
      const expenses = loadExpenses()
      const expense = expenses.find((item) => item.id === expenseId)
      if (!expense) throw new Error('The expense no longer exists.')
      const updated = { ...expense, category, updatedAt: new Date().toISOString() }
      saveExpenses(expenses.map((item) => item.id === expenseId ? updated : item))
      syncExpenseToJobs(updated, updated.id)
      return { expenseId, category, previousCategory: expense.category, summary: 'Expense category updated.' }
    }
    case 'draft_customer_message': {
      const requestedKind = typeof action.input.kind === 'string' ? action.input.kind : ''
      const supportedKinds: Communication['kind'][] = ['estimate_follow_up', 'invoice_reminder', 'appointment_confirmation', 'appointment_reminder', 'on_my_way', 'review_request', 'custom']
      return draftCommunication(
        action,
        supportedKinds.includes(requestedKind as Communication['kind'])
          ? requestedKind as Communication['kind']
          : 'estimate_follow_up',
      )
    }
    case 'request_review': {
      const customerId = inputString(action, 'customerId')
      const customer = loadCustomers().find((item) => item.id === customerId)
      if (!customer) throw new Error('The customer no longer exists.')
      const reviewAction: AiAction = {
        ...action,
        input: {
          customerId,
          documentId: typeof action.input.documentId === 'string' ? action.input.documentId : '',
          subject: 'Google review request',
          body: buildReviewRequestMessage(customer),
        },
      }
      return draftCommunication(reviewAction, 'review_request')
    }
    case 'create_job_checklist':
    case 'generate_material_list': {
      const jobId = inputString(action, 'jobId')
      const jobs = loadJobs()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error('The job no longer exists.')
      if (job.materialChecklist.length > 0) return { jobId, created: false, summary: 'This job already has a material checklist.' }
      const checklist = job.materials.map((item, index) => ({
        id: `${job.id}-material-${index}`, item, purchased: false, loaded: false, delivered: false,
      }))
      saveJobs(jobs.map((item) => item.id === jobId
        ? { ...item, materialChecklist: checklist, updatedAt: new Date().toISOString() }
        : item))
      return { jobId, count: checklist.length, created: true, summary: 'Material checklist created from the accepted estimate.' }
    }
    case 'update_job_cost': {
      const jobId = inputString(action, 'jobId')
      const jobs = loadJobs()
      const job = jobs.find((item) => item.id === jobId)
      if (!job) throw new Error('The job no longer exists.')
      const costing = calculateJobCosting(job, loadBusinessSettings().internalLaborCostPerHour)
      const capturedAt = new Date().toISOString()
      saveJobs(jobs.map((item) => item.id === jobId ? {
        ...item,
        profitability: {
          quotedRevenue: costing.quotedRevenue, actualRevenue: costing.actualRevenue,
          estimatedMaterials: costing.estimatedMaterials, actualMaterials: costing.actualMaterials,
          estimatedLaborHours: costing.estimatedLaborHours, actualLaborHours: costing.actualLaborHours,
          estimatedLaborCost: costing.estimatedLaborCost, actualLaborCost: costing.laborCost,
          estimatedMaterialCost: costing.estimatedMaterials, actualMaterialCost: costing.actualMaterials,
          estimatedCost: costing.estimatedTotalCost, actualCost: costing.totalJobCost,
          estimatedProfit: costing.estimatedProfit, actualProfit: costing.grossProfit,
          estimatedMargin: costing.estimatedMargin, actualMargin: costing.grossMargin,
          laborCost: costing.laborCost, otherExpenses: costing.otherExpenses,
          totalJobCost: costing.totalJobCost, grossProfit: costing.grossProfit,
          grossMargin: costing.grossMargin, approvedChangeOrderTotal: costing.approvedChangeOrderTotal,
          capturedAt,
        },
        updatedAt: capturedAt,
      } : item))
      return { jobId, ...costing, summary: 'Job costing snapshot recalculated from shared records.' }
    }
    case 'create_social_draft': {
      const jobName = inputString(action, 'jobName')
      return {
        beforePhotoId: inputString(action, 'beforePhotoId'),
        afterPhotoId: inputString(action, 'afterPhotoId'),
        draft: `Before and after: ${jobName}. Small fixes. Big difference.`,
        navigationTarget: 'content-autopilot',
        summary: 'Private social brief prepared. Review it in Content Autopilot before publishing.',
      }
    }
    case 'flag_pricing_problem':
    case 'create_owner_alert':
      return { ...action.input, summary: 'Owner alert recorded in AI Activity. No business record was changed.' }
    case 'create_customer_task': {
      const leadId = inputString(action, 'leadId')
      const note = inputString(action, 'note').slice(0, 1_000)
      const leads = loadLeads()
      const lead = leads.find((item) => item.id === leadId)
      if (!lead) throw new Error('The lead no longer exists.')
      const alreadyAdded = lead.activity.some((item) => item.type === 'note' && item.message === note)
      if (!alreadyAdded) {
        const updatedAt = new Date().toISOString()
        saveLeads(leads.map((item) => item.id === leadId ? {
          ...item,
          status: item.status === 'unread' ? 'read' : item.status,
          activity: [...item.activity, { id: createId(), type: 'note', message: note, createdAt: updatedAt }],
          updatedAt,
        } : item))
      }
      return { leadId, created: !alreadyAdded, summary: alreadyAdded ? 'The same lead task already exists.' : 'Private lead follow-up task added. No customer message or price was sent.' }
    }
    case 'create_estimate_draft':
    case 'create_expense':
      throw new Error('This action needs more owner input and must be completed in its normal Owner Hub screen.')
    case 'send_customer_message':
      throw new Error('AI Operations never sends customer messages directly. Approve a draft, review it, then send it yourself.')
  }
}

function audit(action: AiAction, status: AiAuditEntry['status'], ownerApproval: AiAuditEntry['ownerApproval'], result: Record<string, unknown>) {
  appendAiAudit({
    id: `audit:${action.id}:${new Date().toISOString()}`,
    timestamp: new Date().toISOString(), action: action.type, reason: action.reason,
    relatedEntity: action.entityType && action.entityId ? { type: action.entityType, id: action.entityId } : undefined,
    model: action.source === 'ai' ? 'secure-ai-analysis' : 'owner-hub-rules-v1',
    confidence: action.confidence, status, ownerApproval, result,
  })
}

export function executeAiAction(actionId: string, approval: 'owner' | 'autopilot') {
  const action = loadAiActions().find((item) => item.id === actionId)
  if (!action) throw new Error('This AI action no longer exists.')
  if (action.status !== 'pending' && action.status !== 'approved') return action
  const settings = loadAutomationSettings()
  const policy = AI_ACTION_POLICIES[action.type]
  if (approval === 'autopilot') {
    if (settings.mode !== 'autopilot' || !settings.allowedAutopilotActions.includes(action.type) || !isAutopilotSafe(action.type)) {
      throw new Error('This action is not permitted for autopilot.')
    }
    if (action.confidence < settings.minimumConfidence) throw new Error('This action is below the owner’s autopilot confidence threshold.')
  }
  if (policy.risk === 'restricted') throw new Error('This action is restricted.')

  updateAiAction(action.id, { status: 'approved' })
  try {
    const result = executeTool(action)
    const completed = updateAiAction(action.id, {
      status: 'completed', resolvedAt: new Date().toISOString(), result, error: undefined,
    })
    audit(action, 'completed', approval, result)
    return completed
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The action could not be completed.'
    const failed = updateAiAction(action.id, { status: 'failed', resolvedAt: new Date().toISOString(), error: message })
    audit(action, 'failed', approval, { error: message })
    throw Object.assign(new Error(message), { action: failed })
  }
}

export function dismissAiAction(actionId: string) {
  const action = loadAiActions().find((item) => item.id === actionId)
  if (!action) throw new Error('This AI action no longer exists.')
  const dismissed = updateAiAction(actionId, { status: 'dismissed', resolvedAt: new Date().toISOString() })
  audit(action, 'dismissed', 'dismissed', { summary: 'Recommendation dismissed by owner.' })
  return dismissed
}

export function runPermittedAutopilot() {
  const settings = loadAutomationSettings()
  if (settings.mode !== 'autopilot') return []
  const results: Array<{ id: string; status: 'completed' | 'failed'; error?: string }> = []
  loadAiActions().filter((action) =>
    action.status === 'pending' &&
    action.risk === 'low' &&
    action.confidence >= settings.minimumConfidence &&
    settings.allowedAutopilotActions.includes(action.type) &&
    isAutopilotSafe(action.type),
  ).forEach((action) => {
    try {
      executeAiAction(action.id, 'autopilot')
      results.push({ id: action.id, status: 'completed' })
    } catch (error) {
      results.push({ id: action.id, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })
  return results
}
