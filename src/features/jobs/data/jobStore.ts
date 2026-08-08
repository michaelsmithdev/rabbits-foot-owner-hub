import { queueCollectionSync } from '../../cloud/syncQueue'
import type { Estimate } from '../../estimates/types/Estimate'
import type { Job, JobStatus } from '../types/Job'

const STORAGE_KEY = 'rabbits-foot-jobs'
const statuses: JobStatus[] = ['scheduled', 'in_progress', 'paused', 'completed', 'invoiced']

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
      ? parsed.filter(isJob).map((job) => ({
          ...job,
          estimatedLaborCost: typeof job.estimatedLaborCost === 'number' ? job.estimatedLaborCost : 0,
          estimatedMaterialCost: typeof job.estimatedMaterialCost === 'number' ? job.estimatedMaterialCost : 0,
          materials: Array.isArray(job.materials) ? job.materials : [],
          expenses: job.expenses.map((expense) => ({
            ...expense,
            vendor: typeof expense.vendor === 'string' ? expense.vendor : '',
            notes: typeof expense.notes === 'string' ? expense.notes : '',
          })),
        }))
      : []
  } catch {
    return []
  }
}

export function saveJobs(jobs: Job[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  queueCollectionSync('job', jobs)
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
  const job: Job = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
    jobNumber: createJobNumber(jobs),
    estimateId: estimate.id,
    customerId: estimate.customerId,
    jobName: estimate.jobName,
    serviceAddress: estimate.serviceAddress,
    description: estimate.description,
    scopeOfWork: estimate.scopeOfWork ?? estimate.description,
    exclusions: estimate.exclusions ?? [],
    lineItems: estimate.lineItems.map((item) => ({ ...item })),
    quotedPrice: estimateTotal(estimate),
    taxRate: estimate.taxRate,
    discount: estimate.discount,
    estimatedLaborHours: estimate.economics?.laborHours ?? estimate.aiEstimate?.draft.laborHours ?? 0,
    estimatedLaborCost: estimate.economics?.laborCost ?? estimate.aiEstimate?.draft.laborCost ?? 0,
    estimatedMaterialCost: estimate.economics?.materialCost ?? estimate.materialCost ?? 0,
    estimatedCost: estimate.economics?.totalEstimatedCost ?? 0,
    materials: estimate.aiEstimate?.draft.analysis?.materials ?? [],
    photoIds: [...(estimate.photoIds ?? [])],
    voiceNotes: [],
    internalNotes: '',
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
