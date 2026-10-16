import { APP_VERSION } from '../../../config/release'
import { queueCollectionSync } from '../../cloud/syncQueue'
import type {
  SupportReport,
  SupportReportCategory,
} from '../types'

export const SUPPORT_REPORTS_STORAGE_KEY = 'rabbits-foot-support-reports'

function createId() {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadStoredReports(): SupportReport[] {
  try {
    const stored = localStorage.getItem(SUPPORT_REPORTS_STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed as SupportReport[] : []
  } catch {
    return []
  }
}

export function loadSupportReports() {
  return loadStoredReports().sort((first, second) => (
    second.createdAt.localeCompare(first.createdAt)
  ))
}

export function createSupportReport(input: {
  category: SupportReportCategory
  summary: string
  details: string
  includeDiagnostics: boolean
  diagnostics: Record<string, unknown> | null
}) {
  const now = new Date().toISOString()
  const report: SupportReport = {
    id: createId(),
    category: input.category,
    summary: input.summary.trim().slice(0, 160),
    details: input.details.trim().slice(0, 5_000),
    includeDiagnostics: input.includeDiagnostics,
    diagnostics: input.includeDiagnostics ? input.diagnostics : null,
    appVersion: APP_VERSION,
    platform: /android/i.test(navigator.userAgent) ? 'android' : 'web',
    createdAt: now,
    updatedAt: now,
  }
  const reports = [report, ...loadStoredReports()].slice(0, 50)
  localStorage.setItem(SUPPORT_REPORTS_STORAGE_KEY, JSON.stringify(reports))
  queueCollectionSync('support_report', reports)
  return report
}
