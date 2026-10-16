import { queueCollectionSync } from '../../cloud/syncQueue'
import { recordBusinessEvent } from '../../aiOperations/data/operationsStore'
import type { Estimate } from '../../estimates/types/Estimate'
import type { Job, JobStatus } from '../types/Job'

const STORAGE_KEY = 'rabbits-foot-jobs'
const statuses: JobStatus[] = ['scheduled', 'in_progress', 'paused', 'completed', 'invoiced']

function emptyFieldChecklist(): Job['fieldChecklist'] {
  return {
    safetyReview: false,
    beforePhotos: false,
    scopeConfirmed: false,
    materialsLoaded: false,
    cleanupComplete: false,
    afterPhotos: false,
    customerWalkthrough: false,
  }
}

function isJob(value: unknown): value is Job {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<Job>
  return (
    typeof job.id === 'string' &&
    typeof job.jobNumber === 'string' &&
    typeof job.estimateId === 'string' &&
    typeof job.customerId === 'string' &&
    typeof job.jobName === 'string' &&
    typeof job.serviceAddress === 'string' &&
    typeof job.description === 'string' &&
    typeof job.scopeOfWork === 'string' &&
    Array.isArray(job.exclusions) &&
    Array.isArray(job.lineItems) &&
    typeof job.quotedPrice === 'number' &&
    typeof job.taxRate === 'number' &&
    typeof job.discount === 'number' &&
    typeof job.estimatedLaborHours === 'number' &&
    typeof job.estimatedCost === 'number' &&
    Array.isArray(job.photoIds) &&
    Array.isArray(job.voiceNotes) &&
    typeof job.internalNotes === 'string' &&
    Array.isArray(job.timeEntries) &&
    Array.isArray(job.expenses) &&
    typeof job.status === 'string' &&
    statuses.includes(job.status as JobStatus) &&
    (job.completedAt === null || typeof job.completedAt === 'string') &&
    typeof job.createdAt === 'string' &&
    typeof job.updatedAt === 'string'
  )
}

export function loadJobs(): Job[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed)
      ? parsed.filter(isJob).map((job) => {
          const rawChangeOrders = Array.isArray((job as { changeOrders?: unknown }).changeOrders)
            ? (job as unknown as { changeOrders: unknown[] }).changeOrders
            : []
          const changeOrders = rawChangeOrders.flatMap((value) => {
            if (!value || typeof value !== 'object') return []
            const item = value as Partial<Job['changeOrders'][number]>
            if (
              typeof item.id !== 'string' ||
              typeof item.discoveredCondition !== 'string' ||
              typeof item.additionalWork !== 'string' ||
              typeof item.additionalMaterial !== 'string' ||
              typeof item.additionalLaborHours !== 'number' ||
              typeof item.priceChange !== 'number' ||
              typeof item.scheduleImpact !== 'string' ||
              !['draft', 'approved', 'declined'].includes(item.status ?? '') ||
              typeof item.createdAt !== 'string'
            ) return []
            return [{
              ...item,
              estimatedMaterialCost: typeof item.estimatedMaterialCost === 'number' ? item.estimatedMaterialCost : 0,
            } as Job['changeOrders'][number]]
          })

          const profitability = job.profitability
            ? {
                ...job.profitability,
                quotedRevenue: typeof job.profitability.quotedRevenue === 'number' ? job.profitability.quotedRevenue : job.quotedPrice,
                actualRevenue: typeof job.profitability.actualRevenue === 'number' ? job.profitability.actualRevenue : job.quotedPrice,
                estimatedMaterials: typeof job.profitability.estimatedMaterials === 'number' ? job.profitability.estimatedMaterials : job.profitability.estimatedMaterialCost,
                actualMaterials: typeof job.profitability.actualMaterials === 'number' ? job.profitability.actualMaterials : job.profitability.actualMaterialCost,
                laborCost: typeof job.profitability.laborCost === 'number' ? job.profitability.laborCost : job.profitability.actualLaborCost,
                otherExpenses: typeof job.profitability.otherExpenses === 'number'
                  ? job.profitability.otherExpenses
                  : Math.max(0, job.profitability.actualCost - job.profitability.actualLaborCost - job.profitability.actualMaterialCost),
                totalJobCost: typeof job.profitability.totalJobCost === 'number' ? job.profitability.totalJobCost : job.profitability.actualCost,
                grossProfit: typeof job.profitability.grossProfit === 'number' ? job.profitability.grossProfit : job.profitability.actualProfit,
                grossMargin: typeof job.profitability.grossMargin === 'number' ? job.profitability.grossMargin : job.profitability.actualMargin,
              }
            : undefined

          return {
          ...job,
          estimatedLaborCost: typeof job.estimatedLaborCost === 'number' ? job.estimatedLaborCost : 0,
          estimatedMaterialCost: typeof job.estimatedMaterialCost === 'number' ? job.estimatedMaterialCost : 0,
          materials: Array.isArray(job.materials) ? job.materials : [],
          materialChecklist: Array.isArray(job.materialChecklist)
            ? job.materialChecklist
            : (Array.isArray(job.materials) ? job.materials : []).map((item, index) => ({
                id: `${job.id}-material-${index}`,
                item,
                purchased: false,
                loaded: false,
                delivered: false,
              })),
          changeOrders,
          assignedMemberIds: Array.isArray(job.assignedMemberIds)
            ? job.assignedMemberIds.filter((memberId): memberId is string => typeof memberId === 'string')
            : [],
          crewInstructions: typeof job.crewInstructions === 'string' ? job.crewInstructions : '',
          fieldChecklist: {
            ...emptyFieldChecklist(),
            ...(job.fieldChecklist && typeof job.fieldChecklist === 'object' ? job.fieldChecklist : {}),
          },
          expenses: job.expenses.map((expense) => {
            const legacyCategory = String(expense.category)

            return {
              ...expense,
              category: legacyCategory === 'gas'
                ? 'fuel'
                : legacyCategory === 'other'
                  ? 'vehicle'
                  : expense.category,
              vendor: typeof expense.vendor === 'string' ? expense.vendor : '',
              notes: typeof expense.notes === 'string' ? expense.notes : '',
            }
          }),
          profitability,
        }})
      : []
  } catch {
    return []
  }
}

export function saveJobs(jobs: Job[]) {
  const previous = loadJobs()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  queueCollectionSync('job', jobs)
  const previousById = new Map(previous.map((job) => [job.id, job]))
  jobs.forEach((job) => {
    const oldJob = previousById.get(job.id)
    if (!oldJob) {
      recordBusinessEvent({
        type: 'job_created', timestamp: job.createdAt, entityType: 'job', entityId: job.id,
        customerId: job.customerId, jobId: job.id, metadata: { jobNumber: job.jobNumber },
      })
      recordBusinessEvent({
        type: 'job_scheduled', timestamp: job.createdAt, entityType: 'job', entityId: job.id,
        customerId: job.customerId, jobId: job.id,
      })
      return
    }
    if (oldJob.status === job.status) return
    const eventType = job.status === 'in_progress'
      ? 'job_started'
      : job.status === 'completed'
        ? 'job_completed'
        : job.status === 'scheduled'
          ? 'job_scheduled'
          : null
    if (eventType) recordBusinessEvent({
      type: eventType,
      timestamp: job.updatedAt,
      entityType: 'job', entityId: job.id, customerId: job.customerId, jobId: job.id,
    })
  })
}

export function createJobNumber(jobs: Job[]) {
  const year = new Date().getFullYear()
  const sequences = jobs.map((job) => job.jobNumber.match(/^JOB-(\d{4})-(\d+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match) && Number(match?.[1]) === year)
    .map((match) => Number(match[2]))
  return `JOB-${year}-${String(sequences.length ? Math.max(...sequences) + 1 : 1).padStart(4, '0')}`
}

export function estimateTotal(estimate: Estimate) {
  const subtotal = estimate.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discounted = Math.max(0, subtotal - estimate.discount)
  return discounted + discounted * estimate.taxRate / 100
}

export function createJobFromEstimate(estimate: Estimate, jobs = loadJobs()): Job {
  const existing = jobs.find((job) => job.estimateId === estimate.id)
  if (existing) return existing
  const now = new Date().toISOString()
  const materials = estimate.aiEstimate?.draft.analysis?.materials ?? []
  const accepted = estimate.approval?.snapshot
  const job: Job = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
    jobNumber: createJobNumber(jobs),
    estimateId: estimate.id,
    customerId: accepted?.customerId ?? estimate.customerId,
    jobName: accepted?.jobName ?? estimate.jobName,
    serviceAddress: accepted?.serviceAddress ?? estimate.serviceAddress,
    description: estimate.description,
    scopeOfWork: accepted?.scopeOfWork ?? estimate.scopeOfWork ?? estimate.description,
    exclusions: accepted ? [...accepted.exclusions] : estimate.exclusions ?? [],
    lineItems: (accepted?.lineItems ?? estimate.lineItems).map((item) => ({ ...item })),
    quotedPrice: accepted?.acceptedAmount ?? estimateTotal(estimate),
    taxRate: accepted?.taxRate ?? estimate.taxRate,
    discount: accepted?.discount ?? estimate.discount,
    estimatedLaborHours: estimate.economics?.laborHours ?? estimate.aiEstimate?.draft.laborHours ?? 0,
    estimatedLaborCost: estimate.economics?.laborCost ?? estimate.aiEstimate?.draft.laborCost ?? 0,
    estimatedMaterialCost: estimate.economics?.materialCost ?? estimate.materialCost ?? 0,
    estimatedCost: estimate.economics?.totalEstimatedCost ?? 0,
    materials,
    materialChecklist: materials.map((item, index) => ({
      id: `${estimate.id}-material-${index}`,
      item,
      purchased: false,
      loaded: false,
      delivered: false,
    })),
    changeOrders: [],
    photoIds: [...(estimate.photoIds ?? [])],
    voiceNotes: [],
    internalNotes: '',
    assignedMemberIds: [],
    crewInstructions: '',
    fieldChecklist: emptyFieldChecklist(),
    timeEntries: [],
    expenses: [],
    status: 'scheduled',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  saveJobs([job, ...jobs])
  return job
}

export function actualJobHours(job: Job, now = Date.now()) {
  const milliseconds = job.timeEntries.reduce((sum, entry) => {
    const start = new Date(entry.startedAt).getTime()
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now
    return sum + Math.max(0, end - start)
  }, 0)
  return milliseconds / 3_600_000
}
