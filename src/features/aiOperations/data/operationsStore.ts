import { queueCollectionSync } from '../../cloud/syncQueue'
import {
  AUTOPILOT_ELIGIBLE_ACTIONS,
  defaultAutomationSettings,
  type AiAction,
  type AiAuditEntry,
  type AutomationSettings,
  type BusinessEvent,
} from '../types'

const EVENTS_KEY = 'rabbits-foot-business-events'
const ACTIONS_KEY = 'rabbits-foot-ai-actions'
const AUDIT_KEY = 'rabbits-foot-ai-audit'
const SETTINGS_KEY = 'rabbits-foot-automation-settings'
const MAX_EVENTS = 750
const MAX_AUDIT_ENTRIES = 750

function readArray<T>(key: string, predicate: (value: unknown) => value is T): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(predicate) : []
  } catch {
    return []
  }
}

function isBusinessEvent(value: unknown): value is BusinessEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<BusinessEvent>
  return typeof event.id === 'string' && typeof event.type === 'string' && typeof event.timestamp === 'string'
}

function isAiAction(value: unknown): value is AiAction {
  if (!value || typeof value !== 'object') return false
  const action = value as Partial<AiAction>
  return (
    typeof action.id === 'string' &&
    typeof action.type === 'string' &&
    typeof action.section === 'string' &&
    typeof action.title === 'string' &&
    typeof action.summary === 'string' &&
    typeof action.status === 'string' &&
    typeof action.confidence === 'number' &&
    typeof action.createdAt === 'string' &&
    typeof action.updatedAt === 'string'
  )
}

function isAuditEntry(value: unknown): value is AiAuditEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<AiAuditEntry>
  return typeof entry.id === 'string' && typeof entry.timestamp === 'string' && typeof entry.action === 'string' && typeof entry.status === 'string'
}

function eventId(event: Omit<BusinessEvent, 'id'>) {
  const entity = event.entityId ?? event.jobId ?? event.customerId ?? 'workspace'
  return `event:${event.type}:${entity}:${event.timestamp}`
}

export function loadBusinessEvents() {
  return readArray<BusinessEvent>(EVENTS_KEY, isBusinessEvent)
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp))
}

export function recordBusinessEvent(event: Omit<BusinessEvent, 'id'> & { id?: string }) {
  const normalized: BusinessEvent = { ...event, id: event.id ?? eventId(event) }
  const current = loadBusinessEvents()
  if (current.some((item) => item.id === normalized.id)) return normalized
  const next = [normalized, ...current].slice(0, MAX_EVENTS)
  localStorage.setItem(EVENTS_KEY, JSON.stringify(next))
  queueCollectionSync('business_event', next)
  return normalized
}

export function loadAiActions() {
  return readArray<AiAction>(ACTIONS_KEY, isAiAction)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

export function saveAiActions(actions: AiAction[]) {
  localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions))
  queueCollectionSync('ai_action', actions)
}

export function upsertAiRecommendations(recommendations: AiAction[]) {
  const existing = loadAiActions()
  const existingById = new Map(existing.map((action) => [action.id, action]))
  const recommendationIds = new Set(recommendations.map((action) => action.id))
  const next = recommendations.map((recommendation) => {
    const saved = existingById.get(recommendation.id)
    if (!saved) return recommendation
    if (saved.status !== 'pending') return saved
    return { ...recommendation, createdAt: saved.createdAt }
  })

  existing.forEach((action) => {
    if (!recommendationIds.has(action.id) && action.status !== 'pending') next.push(action)
  })
  saveAiActions(next)
  return next
}

export function updateAiAction(actionId: string, patch: Partial<AiAction>) {
  const next = loadAiActions().map((action) =>
    action.id === actionId
      ? { ...action, ...patch, updatedAt: new Date().toISOString() }
      : action,
  )
  saveAiActions(next)
  return next.find((action) => action.id === actionId) ?? null
}

export function loadAiAudit() {
  return readArray<AiAuditEntry>(AUDIT_KEY, isAuditEntry)
    .sort((first, second) => second.timestamp.localeCompare(first.timestamp))
}

export function appendAiAudit(entry: AiAuditEntry) {
  const next = [entry, ...loadAiAudit().filter((item) => item.id !== entry.id)]
    .slice(0, MAX_AUDIT_ENTRIES)
  localStorage.setItem(AUDIT_KEY, JSON.stringify(next))
  queueCollectionSync('ai_audit', next)
}

export function loadAutomationSettings(): AutomationSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '[]')
    const value = Array.isArray(parsed) ? parsed[0] : parsed
    if (!value || typeof value !== 'object') return { ...defaultAutomationSettings }
    const settings = value as Partial<AutomationSettings>
    const mode = ['manual', 'approval', 'autopilot'].includes(settings.mode ?? '')
      ? settings.mode as AutomationSettings['mode']
      : defaultAutomationSettings.mode
    const allowedAutopilotActions = Array.isArray(settings.allowedAutopilotActions)
      ? settings.allowedAutopilotActions.filter((action) => AUTOPILOT_ELIGIBLE_ACTIONS.includes(action))
      : []
    const normalizeSchedule = (value: unknown, fallback: number[]) =>
      Array.isArray(value)
        ? [...new Set(value.filter((day): day is number => typeof day === 'number' && Number.isFinite(day)).map((day) => Math.max(0, Math.min(90, Math.round(day)))))]
            .sort((first, second) => first - second)
            .slice(0, 5)
        : fallback
    return {
      ...defaultAutomationSettings,
      ...settings,
      id: 'automation-settings',
      mode,
      allowedAutopilotActions,
      minimumConfidence: typeof settings.minimumConfidence === 'number'
        ? Math.min(1, Math.max(0.5, settings.minimumConfidence))
        : defaultAutomationSettings.minimumConfidence,
      customerFollowUpsEnabled: typeof settings.customerFollowUpsEnabled === 'boolean'
        ? settings.customerFollowUpsEnabled
        : defaultAutomationSettings.customerFollowUpsEnabled,
      estimateFollowUpScheduleDays: normalizeSchedule(
        settings.estimateFollowUpScheduleDays,
        defaultAutomationSettings.estimateFollowUpScheduleDays,
      ),
      invoiceReminderScheduleDays: normalizeSchedule(
        settings.invoiceReminderScheduleDays,
        defaultAutomationSettings.invoiceReminderScheduleDays,
      ),
      reviewRequestDelayDays: typeof settings.reviewRequestDelayDays === 'number'
        ? Math.max(0, Math.min(30, Math.round(settings.reviewRequestDelayDays)))
        : defaultAutomationSettings.reviewRequestDelayDays,
    }
  } catch {
    return { ...defaultAutomationSettings }
  }
}

export function saveAutomationSettings(settings: AutomationSettings) {
  const normalized: AutomationSettings = {
    ...settings,
    id: 'automation-settings',
    allowedAutopilotActions: settings.allowedAutopilotActions.filter((action) =>
      AUTOPILOT_ELIGIBLE_ACTIONS.includes(action),
    ),
    minimumConfidence: Math.min(1, Math.max(0.5, settings.minimumConfidence)),
    estimateFollowUpScheduleDays: [...new Set(settings.estimateFollowUpScheduleDays.map((day) => Math.max(0, Math.min(90, Math.round(day)))))]
      .sort((first, second) => first - second)
      .slice(0, 5),
    invoiceReminderScheduleDays: [...new Set(settings.invoiceReminderScheduleDays.map((day) => Math.max(0, Math.min(90, Math.round(day)))))]
      .sort((first, second) => first - second)
      .slice(0, 5),
    reviewRequestDelayDays: Math.max(0, Math.min(30, Math.round(settings.reviewRequestDelayDays))),
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify([normalized]))
  queueCollectionSync('automation_settings', [normalized])
  return normalized
}
