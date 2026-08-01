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

    return parsedValue.filter(isEstimate)
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
