import type {
  ReliabilityArea,
  ReliabilityEvent,
  ReliabilitySeverity,
} from '../types'

export const RELIABILITY_EVENTS_STORAGE_KEY = 'rabbits-foot-reliability-events'
export const RELIABILITY_UPDATED_EVENT = 'ownerhub:reliability-updated'

const MAXIMUM_EVENTS = 200
const MAXIMUM_TEXT_LENGTH = 2_000
const DEDUPLICATION_WINDOW_MS = 10 * 60 * 1_000

function createId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function sanitizeReliabilityText(value: unknown): string {
  let text = value instanceof Error
    ? `${value.name}: ${value.message}`
    : typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value)
          } catch {
            return 'Unserializable diagnostic detail'
          }
        })()

  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
    .replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/([?&](?:access_token|refresh_token|token|api_key|key|code)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\b((?:access_token|refresh_token|token|api_key|secret|password)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')

  return text.slice(0, MAXIMUM_TEXT_LENGTH)
}

function sanitizeContext(
  context: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> {
  if (!context) return {}

  return Object.fromEntries(
    Object.entries(context)
      .slice(0, 20)
      .map(([key, value]) => {
        if (value === null || typeof value === 'number' || typeof value === 'boolean') {
          return [key, value]
        }

        return [key, sanitizeReliabilityText(value)]
      }),
  )
}

function isReliabilityEvent(value: unknown): value is ReliabilityEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<ReliabilityEvent>

  return (
    typeof event.id === 'string' &&
    typeof event.area === 'string' &&
    typeof event.severity === 'string' &&
    typeof event.message === 'string' &&
    typeof event.detail === 'string' &&
    event.context !== null &&
    typeof event.context === 'object' &&
    typeof event.occurrences === 'number' &&
    typeof event.firstSeenAt === 'string' &&
    typeof event.lastSeenAt === 'string' &&
    (event.resolvedAt === null || typeof event.resolvedAt === 'string')
  )
}

function notifyReliabilityUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RELIABILITY_UPDATED_EVENT))
  }
}

function storeEvents(events: ReliabilityEvent[]) {
  try {
    localStorage.setItem(
      RELIABILITY_EVENTS_STORAGE_KEY,
      JSON.stringify(events.slice(0, MAXIMUM_EVENTS)),
    )
    notifyReliabilityUpdated()
  } catch {
    // Reliability logging must never interrupt business work.
  }
}

export function loadReliabilityEvents(): ReliabilityEvent[] {
  try {
    const stored = localStorage.getItem(RELIABILITY_EVENTS_STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []

    return Array.isArray(parsed)
      ? parsed
          .filter(isReliabilityEvent)
          .sort((first, second) => second.lastSeenAt.localeCompare(first.lastSeenAt))
          .slice(0, MAXIMUM_EVENTS)
      : []
  } catch {
    return []
  }
}

export function recordReliabilityEvent(input: {
  area: ReliabilityArea
  severity: ReliabilitySeverity
  message: string
  detail?: unknown
  context?: Record<string, unknown>
}) {
  try {
    const now = new Date().toISOString()
    const message = sanitizeReliabilityText(input.message).trim() || 'Unexpected application issue'
    const detail = input.detail === undefined ? '' : sanitizeReliabilityText(input.detail)
    const context = sanitizeContext(input.context)
    const events = loadReliabilityEvents()
    const recentMatchIndex = events.findIndex((event) => (
      event.area === input.area &&
      event.severity === input.severity &&
      event.message === message &&
      event.detail === detail &&
      event.resolvedAt === null &&
      Date.now() - new Date(event.lastSeenAt).getTime() <= DEDUPLICATION_WINDOW_MS
    ))

    if (recentMatchIndex >= 0) {
      const current = events[recentMatchIndex]
      events.splice(recentMatchIndex, 1)
      events.unshift({
        ...current,
        context: { ...current.context, ...context },
        occurrences: current.occurrences + 1,
        lastSeenAt: now,
      })
    } else {
      events.unshift({
        id: createId(),
        area: input.area,
        severity: input.severity,
        message,
        detail,
        context,
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
      })
    }

    storeEvents(events)
  } catch {
    // Reliability logging must never interrupt business work.
  }
}

export function resolveReliabilityEvent(eventId: string) {
  const now = new Date().toISOString()
  storeEvents(loadReliabilityEvents().map((event) => (
    event.id === eventId ? { ...event, resolvedAt: now } : event
  )))
}

export function clearResolvedReliabilityEvents() {
  storeEvents(loadReliabilityEvents().filter((event) => event.resolvedAt === null))
}
