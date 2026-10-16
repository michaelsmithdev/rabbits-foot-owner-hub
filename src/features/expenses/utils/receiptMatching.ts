import type { Job } from '../../jobs/types/Job'
import type { ReceiptLineItem } from '../types/ExpenseRecord'

export type ReceiptJobMatch = {
  jobId: string
  confidence: number
  reason: string
}

function tokens(value: string) {
  return new Set(
    value.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((token) =>
      !['the', 'and', 'for', 'with', 'from', 'each', 'item'].includes(token),
    ) ?? [],
  )
}

function dayDistance(first: string, second: string) {
  const left = new Date(`${first.slice(0, 10)}T12:00:00`).getTime()
  const right = new Date(`${second.slice(0, 10)}T12:00:00`).getTime()
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 365
  return Math.abs(left - right) / 86_400_000
}

export function matchReceiptToJobs(
  receipt: {
    purchaseDate: string
    merchant: string
    description: string
    lineItems: ReceiptLineItem[]
  },
  jobs: Job[],
  now = new Date(),
): ReceiptJobMatch | null {
  const receiptTokens = tokens([
    receipt.merchant,
    receipt.description,
    ...receipt.lineItems.map((item) => item.description),
  ].join(' '))

  const ranked = jobs.map((job) => {
    let score = 0
    const reasons: string[] = []
    const active = ['scheduled', 'in_progress', 'paused'].includes(job.status)
    if (active) {
      score += 0.32
      reasons.push('job is currently active')
    }

    const referenceDate = job.completedAt ?? job.updatedAt ?? now.toISOString()
    const distance = dayDistance(receipt.purchaseDate, referenceDate)
    if (distance <= 2) {
      score += 0.3
      reasons.push('receipt date is within two days of job activity')
    } else if (distance <= 7) {
      score += 0.18
      reasons.push('receipt date is near recent job activity')
    } else if (distance <= 21) {
      score += 0.07
    }

    const jobTokens = tokens([
      job.jobName,
      job.description,
      job.scopeOfWork,
      job.serviceAddress,
      ...job.materials,
    ].join(' '))
    const overlap = [...receiptTokens].filter((token) => jobTokens.has(token))
    if (overlap.length > 0) {
      score += Math.min(0.36, overlap.length * 0.12)
      reasons.push(`materials or description match: ${overlap.slice(0, 3).join(', ')}`)
    }

    return {
      jobId: job.id,
      confidence: Math.min(0.99, Math.round(score * 100) / 100),
      reason: reasons.join('; '),
    }
  }).sort((first, second) => second.confidence - first.confidence)

  const best = ranked[0]
  return best && best.confidence >= 0.35 ? best : null
}
