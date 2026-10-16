import type { Communication } from '../../communications/types/Communication'
import type { Customer } from '../../customers/types/Customer'
import type { Estimate } from '../../estimates/types/Estimate'
import { matchReceiptToJobs } from '../../expenses/utils/receiptMatching'
import type { ExpenseRecord } from '../../expenses/types/ExpenseRecord'
import type { Invoice } from '../../invoices/types/Invoice'
import type { Lead } from '../../leads/types/Lead'
import { calculateInvoiceBalance } from '../../invoices/utils/invoiceMath'
import type { Job } from '../../jobs/types/Job'
import { calculateJobCosting } from '../../jobs/utils/jobCosting'
import type { BusinessPhoto } from '../../photos/types/BusinessPhoto'
import type { AiAction } from '../types'
import { loadAutomationSettings } from '../data/operationsStore'

export { isAutopilotSafe } from './autonomyPolicy'

export type OperationsSnapshot = {
  customers: Customer[]
  estimates: Estimate[]
  invoices: Invoice[]
  jobs: Job[]
  expenses: ExpenseRecord[]
  photos: BusinessPhoto[]
  communications: Communication[]
  leads: Lead[]
  internalLaborCostPerHour: number
  targetGrossMarginPercent: number
}

function daysSince(value: string, now: Date) {
  return Math.max(0, (now.getTime() - new Date(value).getTime()) / 86_400_000)
}

function action(input: Omit<AiAction, 'id' | 'status' | 'source' | 'createdAt' | 'updatedAt'>, now: Date, dedupeKey?: string): AiAction {
  const entity = input.entityId ?? input.jobId ?? input.customerId ?? 'workspace'
  return {
    ...input,
    id: `ai:${input.type}:${dedupeKey ?? entity}`,
    status: 'pending',
    source: 'rules',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function buildAiRecommendations(snapshot: OperationsSnapshot, now = new Date()) {
  const actions: AiAction[] = []
  const automation = loadAutomationSettings()
  const customerById = new Map(snapshot.customers.map((customer) => [customer.id, customer]))
  const invoiceByJobId = new Map(snapshot.invoices.filter((invoice) => invoice.jobId).map((invoice) => [invoice.jobId, invoice]))

  snapshot.leads.filter((lead) => lead.status === 'unread' || lead.status === 'flagged').forEach((lead) => {
    const missing = [
      !lead.phone && 'phone number',
      !lead.email && 'email address',
      !lead.address && 'job address',
      !lead.description && 'work details',
    ].filter(Boolean) as string[]
    const service = lead.service.trim() || 'new service request'
    const questions = missing.length > 0
      ? `Confirm ${missing.join(', ')} before promising a price.`
      : 'Confirm dimensions, access, desired timing, and whether an inspection is needed before final pricing.'
    actions.push(action({
      type: 'create_customer_task',
      section: 'needs_attention',
      title: `${lead.name || 'New lead'} · ${service}`,
      summary: missing.length > 0
        ? `This lead is missing ${missing.join(', ')}.`
        : 'This lead has enough contact information for an owner follow-up.',
      reason: `Lead triage protects accuracy. ${questions}`,
      proposedResult: 'Add a private lead follow-up note and inspection checklist. No price or customer message will be sent.',
      risk: 'low', confidence: missing.length > 0 ? 0.99 : 0.86,
      entityType: 'lead', entityId: lead.id,
      input: {
        leadId: lead.id,
        note: `${questions} Likely service: ${service}. Review photos and scope before estimating.`,
      },
    }, now))
  })

  snapshot.estimates.filter((estimate) => estimate.status === 'sent').forEach((estimate) => {
    if (!automation.customerFollowUpsEnabled) return
    const age = daysSince(estimate.updatedAt, now)
    const priorFollowUps = snapshot.communications.filter((communication) =>
      communication.documentId === estimate.id && communication.kind === 'estimate_follow_up',
    )
    const stage = priorFollowUps.length
    const dueAfterDays = automation.estimateFollowUpScheduleDays[stage]
    if (dueAfterDays === undefined || age < dueAfterDays) return
    const customer = customerById.get(estimate.customerId)
    actions.push(action({
      type: 'draft_customer_message',
      section: 'needs_attention',
      title: `${customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Customer'} · ${estimate.jobName}`,
      summary: `Estimate ${estimate.estimateNumber} has been waiting ${Math.floor(age)} days. Follow-up ${stage + 1} of ${automation.estimateFollowUpScheduleDays.length} is due.`,
      reason: `The owner-approved cadence calls for follow-up ${stage + 1} after ${dueAfterDays} day${dueAfterDays === 1 ? '' : 's'}.`,
      proposedResult: 'Create a message draft for owner review. It will not be sent automatically.',
      risk: 'low',
      confidence: 0.94,
      entityType: 'estimate', entityId: estimate.id, customerId: estimate.customerId,
      input: {
        customerId: estimate.customerId,
        documentId: estimate.id,
        kind: 'estimate_follow_up',
        sequenceStage: stage + 1,
        subject: `Follow-up for ${estimate.estimateNumber}`,
        body: stage === 0
          ? `Hi ${customer?.firstName || 'there'}, I wanted to check whether you had any questions about ${estimate.estimateNumber} for ${estimate.jobName}. I’m happy to clarify the scope or timing.`
          : stage === 1
            ? `Hi ${customer?.firstName || 'there'}, just checking in once more about ${estimate.estimateNumber}. If the timing or scope has changed, let me know and I can update the plan.`
            : `Hi ${customer?.firstName || 'there'}, I’m closing the loop on ${estimate.estimateNumber}. I’m here if you would like to move forward or revisit the project later.`,
      },
    }, now, `estimate-followup:${estimate.id}:${stage + 1}`))
  })

  snapshot.invoices.filter((invoice) =>
    !['paid', 'void'].includes(invoice.status) && invoice.dueDate < now.toISOString().slice(0, 10),
  ).forEach((invoice) => {
    if (!automation.customerFollowUpsEnabled) return
    const customer = customerById.get(invoice.customerId)
    const balance = calculateInvoiceBalance(invoice)
    const daysOverdue = Math.floor(daysSince(`${invoice.dueDate}T12:00:00`, now))
    const priorReminders = snapshot.communications.filter((communication) =>
      communication.documentId === invoice.id && communication.kind === 'invoice_reminder',
    )
    const stage = priorReminders.length
    const dueAfterDays = automation.invoiceReminderScheduleDays[stage]
    if (dueAfterDays === undefined || daysOverdue < dueAfterDays) return
    actions.push(action({
      type: 'draft_customer_message',
      section: 'needs_attention',
      title: `${invoice.invoiceNumber} is overdue`,
      summary: `${customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'Customer'} has an unpaid balance of $${balance.toFixed(2)}. Reminder ${stage + 1} is due.`,
      reason: `The invoice is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue and the saved reminder cadence calls for stage ${stage + 1}.`,
      proposedResult: 'Create a courteous invoice-reminder draft. No message will be sent until the owner sends it.',
      risk: 'low', confidence: 0.99,
      entityType: 'invoice', entityId: invoice.id, customerId: invoice.customerId,
      input: {
        customerId: invoice.customerId,
        documentId: invoice.id,
        kind: 'invoice_reminder',
        sequenceStage: stage + 1,
        subject: `Reminder for ${invoice.invoiceNumber}`,
        body: `Hi ${customer?.firstName || 'there'}, this is a friendly reminder that ${invoice.invoiceNumber} has a remaining balance of $${balance.toFixed(2)}. Please let me know if you need another copy or have any questions.`,
      },
    }, now, `invoice-reminder:${invoice.id}:${stage + 1}`))
  })

  snapshot.invoices.filter((invoice) => invoice.status === 'paid' && invoice.paidAt).forEach((invoice) => {
    if (!automation.customerFollowUpsEnabled || !invoice.paidAt) return
    const customer = customerById.get(invoice.customerId)
    const alreadyRequested = snapshot.communications.some((communication) =>
      communication.documentId === invoice.id && communication.kind === 'review_request',
    )
    if (alreadyRequested || daysSince(invoice.paidAt, now) < automation.reviewRequestDelayDays) return
    actions.push(action({
      type: 'request_review', section: 'marketing_opportunity',
      title: `Ask ${customer?.firstName || 'the customer'} for a review`,
      summary: `${invoice.invoiceNumber} is paid and the saved review-request delay has passed.`,
      reason: 'A timely request after completed, paid work builds durable local proof without interrupting the job.',
      proposedResult: 'Create a review-request message draft for owner approval. It will not be sent automatically.',
      risk: 'low', confidence: 0.98,
      entityType: 'invoice', entityId: invoice.id, customerId: invoice.customerId,
      input: {
        customerId: invoice.customerId,
        documentId: invoice.id,
        subject: `How did we do on ${invoice.jobName}?`,
        body: `Hi ${customer?.firstName || 'there'}, thank you for trusting us with ${invoice.jobName}. If you’re happy with the work, would you mind sharing a quick review? It helps local customers find a handyman they can trust.`,
      },
    }, now, `review:${invoice.id}`))
  })

  snapshot.jobs.filter((job) => job.status === 'completed' && !job.invoiceId && !invoiceByJobId.has(job.id)).forEach((job) => {
    const costing = calculateJobCosting(job, snapshot.internalLaborCostPerHour)
    actions.push(action({
      type: 'create_invoice_draft',
      section: 'ready_to_invoice',
      title: `${job.jobNumber} · ${job.jobName}`,
      summary: `Revenue $${costing.actualRevenue.toFixed(2)} · costs $${costing.totalJobCost.toFixed(2)} · estimated gross profit $${costing.grossProfit.toFixed(2)}.`,
      reason: 'The job is marked complete and has no linked invoice.',
      proposedResult: 'Create a draft invoice from approved scope, change orders, and billable expenses.',
      risk: 'medium', confidence: 0.99,
      entityType: 'job', entityId: job.id, customerId: job.customerId, jobId: job.id,
      input: { jobId: job.id },
    }, now))
  })

  snapshot.expenses.filter((expense) => !expense.jobId).forEach((expense) => {
    const match = matchReceiptToJobs(expense, snapshot.jobs, now)
    if (!match) return
    const job = snapshot.jobs.find((item) => item.id === match.jobId)
    if (!job) return
    actions.push(action({
      type: 'link_expense_to_job',
      section: 'expense_alert',
      title: `${expense.merchant || expense.description || 'Receipt'} · $${expense.total.toFixed(2)}`,
      summary: `Likely job: ${job.jobNumber} · ${job.jobName}`,
      reason: match.reason,
      proposedResult: 'Link the expense and receipt to this job so actual costs and profit update.',
      risk: 'medium', confidence: match.confidence,
      entityType: 'expense', entityId: expense.id, customerId: job.customerId, jobId: job.id,
      input: { expenseId: expense.id, jobId: job.id },
    }, now))
  })

  const photoGroups = new Map<string, BusinessPhoto[]>()
  snapshot.photos.forEach((photo) => {
    const key = photo.jobName.trim().toLowerCase()
    if (!key || photo.category === 'receipt') return
    photoGroups.set(key, [...(photoGroups.get(key) ?? []), photo])
  })
  photoGroups.forEach((photos, key) => {
    const before = photos.find((photo) => photo.category === 'before')
    const after = photos.find((photo) => photo.category === 'after')
    if (!before || !after) return
    actions.push(action({
      type: 'create_social_draft',
      section: 'marketing_opportunity',
      title: after.jobName || before.jobName,
      summary: 'A complete before-and-after photo pair is ready for content.',
      reason: 'Showing a real transformation is stronger proof than a generic promotional post.',
      proposedResult: 'Prepare a private social brief using these photos. Publishing remains a separate controlled action.',
      risk: 'low', confidence: 0.98,
      entityType: 'photo', entityId: key,
      input: { beforePhotoId: before.id, afterPhotoId: after.id, jobName: after.jobName || before.jobName },
    }, now))
  })

  snapshot.jobs.filter((job) => ['completed', 'invoiced'].includes(job.status)).forEach((job) => {
    const costing = calculateJobCosting(job, snapshot.internalLaborCostPerHour)
    const materialVariance = costing.actualMaterials - costing.estimatedMaterials
    if (costing.grossMargin >= snapshot.targetGrossMarginPercent && materialVariance <= 25) return
    const reasons = []
    if (costing.grossMargin < snapshot.targetGrossMarginPercent) reasons.push(`margin ${costing.grossMargin.toFixed(1)}% is below the ${snapshot.targetGrossMarginPercent}% target`)
    if (materialVariance > 25) reasons.push(`materials exceeded estimate by $${materialVariance.toFixed(2)}`)
    actions.push(action({
      type: 'flag_pricing_problem',
      section: 'pricing_intelligence',
      title: `${job.jobNumber} pricing review`,
      summary: reasons.join(' · '),
      reason: 'Completed-job actuals indicate the original assumptions may need owner review.',
      proposedResult: 'Add this job to pricing review; no estimate template or customer price will change automatically.',
      risk: 'low', confidence: 0.96,
      entityType: 'job', entityId: job.id, customerId: job.customerId, jobId: job.id,
      input: { jobId: job.id, materialVariance, grossMargin: costing.grossMargin },
    }, now))
  })

  const completedByService = new Map<string, Job[]>()
  snapshot.jobs.filter((job) => ['completed', 'invoiced'].includes(job.status)).forEach((job) => {
    const estimate = snapshot.estimates.find((item) => item.id === job.estimateId)
    const service = estimate?.jobCategory?.trim() || job.jobName.trim() || 'General handyman'
    completedByService.set(service, [...(completedByService.get(service) ?? []), job])
  })
  completedByService.forEach((jobs, service) => {
    if (jobs.length < 3) return
    const summaries = jobs.map((job) => calculateJobCosting(job, snapshot.internalLaborCostPerHour))
    const averageHours = summaries.reduce((sum, item) => sum + item.actualLaborHours, 0) / summaries.length
    const averageMaterials = summaries.reduce((sum, item) => sum + item.actualMaterials, 0) / summaries.length
    const estimatedHours = summaries.reduce((sum, item) => sum + item.estimatedLaborHours, 0) / summaries.length
    const estimatedMaterials = summaries.reduce((sum, item) => sum + item.estimatedMaterials, 0) / summaries.length
    const materialGap = averageMaterials - estimatedMaterials
    const hourGap = averageHours - estimatedHours
    if (materialGap <= 20 && hourGap <= 0.5) return
    actions.push(action({
      type: 'flag_pricing_problem', section: 'pricing_intelligence',
      title: `${service} historical baseline review`,
      summary: `${jobs.length} completed jobs averaged ${averageHours.toFixed(1)} labor hours and $${averageMaterials.toFixed(2)} in materials.`,
      reason: `The saved estimates averaged ${estimatedHours.toFixed(1)} hours and $${estimatedMaterials.toFixed(2)} in materials. Historical actuals are higher enough to merit review.`,
      proposedResult: 'Record a pricing recommendation for the owner. No template or customer price changes automatically.',
      risk: 'low', confidence: Math.min(0.99, 0.78 + jobs.length * 0.025),
      input: { service, sampleSize: jobs.length, averageHours, averageMaterials, estimatedHours, estimatedMaterials },
    }, now))
  })

  snapshot.jobs.filter((job) => job.status === 'scheduled' && job.materials.length > 0 && job.materialChecklist.length === 0).forEach((job) => {
    actions.push(action({
      type: 'create_job_checklist', section: 'needs_attention',
      title: `${job.jobNumber} needs a material checklist`,
      summary: `${job.materials.length} estimate material${job.materials.length === 1 ? '' : 's'} can be turned into a field checklist.`,
      reason: 'The estimate contains materials, but this job has no purchasing/loading checklist.',
      proposedResult: 'Create an unchecked job checklist from the existing estimate materials.',
      risk: 'low', confidence: 0.99,
      entityType: 'job', entityId: job.id, customerId: job.customerId, jobId: job.id,
      input: { jobId: job.id },
    }, now))
  })

  return actions.sort((first, second) => {
    const sectionOrder = ['needs_attention', 'ready_to_invoice', 'expense_alert', 'marketing_opportunity', 'pricing_intelligence']
    return sectionOrder.indexOf(first.section) - sectionOrder.indexOf(second.section) || second.confidence - first.confidence
  })
}

export function buildDailyBrief(snapshot: OperationsSnapshot, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const scheduledJobs = snapshot.jobs.filter((job) => job.status === 'scheduled').length
  const outstanding = snapshot.invoices
    .filter((invoice) => !['paid', 'void'].includes(invoice.status))
    .reduce((sum, invoice) => sum + calculateInvoiceBalance(invoice), 0)
  const estimatesNeedingFollowUp = snapshot.estimates.filter((estimate) =>
    estimate.status === 'sent' && daysSince(estimate.updatedAt, now) >= 2,
  ).length
  const receiptsNeedingAssignment = snapshot.expenses.filter((expense) => !expense.jobId).length
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)
  const yesterdayProfit = snapshot.jobs
    .filter((job) => (job.completedAt ?? '').slice(0, 10) === yesterdayKey)
    .reduce((sum, job) => sum + calculateJobCosting(job, snapshot.internalLaborCostPerHour).grossProfit, 0)

  const priorities: Array<{ label: string; score: number }> = [
    { label: `Follow up on ${estimatesNeedingFollowUp} waiting estimate${estimatesNeedingFollowUp === 1 ? '' : 's'}.`, score: estimatesNeedingFollowUp * 4 },
    { label: `Assign ${receiptsNeedingAssignment} receipt${receiptsNeedingAssignment === 1 ? '' : 's'} to jobs.`, score: receiptsNeedingAssignment * 3 },
    { label: `Review $${outstanding.toFixed(2)} in outstanding invoices.`, score: outstanding > 0 ? 2 : 0 },
  ].sort((first, second) => second.score - first.score)

  return {
    date: today,
    greeting: now.getHours() < 12 ? 'Good morning.' : now.getHours() < 17 ? 'Good afternoon.' : 'Good evening.',
    scheduledJobs,
    outstanding,
    estimatesNeedingFollowUp,
    receiptsNeedingAssignment,
    yesterdayProfit,
    priority: priorities[0]?.score ? priorities[0].label : 'Your operation is caught up. Review today’s schedule.',
  }
}

export type DailyBrief = ReturnType<typeof buildDailyBrief>
