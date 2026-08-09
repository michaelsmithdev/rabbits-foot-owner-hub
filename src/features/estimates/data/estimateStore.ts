import type { Estimate } from '../types/Estimate'
import { queueCollectionSync } from '../../cloud/syncQueue'

const STORAGE_KEY = 'rabbits-foot-estimates'

function isEstimate(
  value: unknown,
): value is Estimate {
  if (!value || typeof value !== 'object') {
    return false
  }

  const estimate = value as Partial<Estimate>

  return (
    typeof estimate.id === 'string' &&
    typeof estimate.estimateNumber ===
      'string' &&
    typeof estimate.customerId === 'string' &&
    typeof estimate.jobName === 'string' &&
    typeof estimate.serviceAddress ===
      'string' &&
    typeof estimate.description === 'string' &&
    typeof estimate.issueDate === 'string' &&
    typeof estimate.expirationDate ===
      'string' &&
    Array.isArray(estimate.lineItems) &&
    typeof estimate.taxRate === 'number' &&
    typeof estimate.discount === 'number' &&
    typeof estimate.notes === 'string' &&
    typeof estimate.status === 'string' &&
    typeof estimate.createdAt === 'string' &&
    typeof estimate.updatedAt === 'string'
  )
}

function hasValidApproval(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const approval = value as NonNullable<Estimate['approval']>
  const snapshot = approval.snapshot
  return (
    typeof approval.customerName === 'string' &&
    ['signed_in_person', 'email', 'text', 'verbal'].includes(approval.method) &&
    typeof approval.note === 'string' &&
    typeof approval.acceptedAt === 'string' &&
    Boolean(snapshot) &&
    typeof snapshot.estimateNumber === 'string' &&
    typeof snapshot.customerId === 'string' &&
    typeof snapshot.acceptedAmount === 'number' &&
    Number.isFinite(snapshot.acceptedAmount) &&
    Array.isArray(snapshot.lineItems) &&
    Array.isArray(snapshot.exclusions)
  )
}

function normalizeEstimate(value: unknown): Estimate | null {
  if (!isEstimate(value)) return null
  if (value.approval === undefined || hasValidApproval(value.approval)) return value
  const { approval: _invalidApproval, ...safeEstimate } = value
  void _invalidApproval
  return safeEstimate
}

export function loadEstimates(): Estimate[] {
  try {
    const storedEstimates =
      localStorage.getItem(STORAGE_KEY)

    if (!storedEstimates) {
      return []
    }

    const parsedValue: unknown =
      JSON.parse(storedEstimates)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue
      .map(normalizeEstimate)
      .filter((estimate): estimate is Estimate => estimate !== null)
  } catch (error) {
    console.error(
      'Estimate data could not be loaded.',
      error,
    )

    return []
  }
}

export function saveEstimates(
  estimates: Estimate[],
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(estimates),
    )
    queueCollectionSync('estimate', estimates)
  } catch (error) {
    console.error(
      'Estimate data could not be saved.',
      error,
    )
  }
}

export function createEstimateNumber(
  estimates: Estimate[],
  prefix = 'EST',
): string {
  const nextNumber = estimates.length + 1

  return `${prefix}-${String(nextNumber).padStart(
    4,
    '0',
  )}`
}

export function createRevisionNumber(
  estimate: Estimate,
  estimates: Estimate[],
): { estimateNumber: string; revisionNumber: number } {
  const rootId = estimate.revisionOfId ?? estimate.id
  const highestRevision = estimates
    .filter((item) => item.id === rootId || item.revisionOfId === rootId)
    .reduce((highest, item) => Math.max(highest, item.revisionNumber ?? 0), 0)
  const revisionNumber = highestRevision + 1
  const baseNumber = estimate.estimateNumber.replace(/-R\d+$/, '')

  return {
    estimateNumber: `${baseNumber}-R${revisionNumber}`,
    revisionNumber,
  }
}
