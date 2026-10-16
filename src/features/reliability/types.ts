export type ReliabilityArea =
  | 'auth'
  | 'network'
  | 'render'
  | 'startup'
  | 'storage'
  | 'sync'
  | 'upload'
  | 'support'

export type ReliabilitySeverity = 'info' | 'warning' | 'error'

export type ReliabilityEvent = {
  id: string
  area: ReliabilityArea
  severity: ReliabilitySeverity
  message: string
  detail: string
  context: Record<string, string | number | boolean | null>
  occurrences: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
}

export type SupportReportCategory =
  | 'authentication'
  | 'cloud_sync'
  | 'receipt_or_photo'
  | 'app_crash'
  | 'other'

export type SupportReport = {
  id: string
  category: SupportReportCategory
  summary: string
  details: string
  includeDiagnostics: boolean
  diagnostics: Record<string, unknown> | null
  appVersion: string
  platform: string
  createdAt: string
  updatedAt: string
}

