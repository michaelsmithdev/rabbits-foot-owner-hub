import { createHash } from 'node:crypto'

export function contentIdempotencyKey(platformPostId: string): string {
  return createHash('sha256').update(`${platformPostId}:publish-v1`).digest('hex')
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(3_600, 30 * 2 ** Math.max(0, attempt - 1))
}

export function normalizeScheduledAt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== 'string') return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp > now + 30_000 ? new Date(timestamp).toISOString() : null
}

export function aggregateContentStatus(statuses: string[]): 'draft' | 'scheduled' | 'publishing' | 'partially_published' | 'published' | 'failed' | 'canceled' | 'needs_review' {
  if (!statuses.length || statuses.every((status) => status === 'draft')) return 'draft'
  if (statuses.every((status) => status === 'published')) return 'published'
  if (statuses.includes('published') && statuses.every((status) => status === 'published' || status === 'canceled')) return 'partially_published'
  if (statuses.includes('published') && statuses.some((status) => status === 'failed' || status === 'needs_review')) return 'partially_published'
  if (statuses.includes('needs_review')) return 'needs_review'
  if (statuses.every((status) => status === 'failed')) return 'failed'
  if (statuses.every((status) => status === 'canceled')) return 'canceled'
  if (statuses.some((status) => status === 'scheduled')) return 'scheduled'
  return 'publishing'
}
