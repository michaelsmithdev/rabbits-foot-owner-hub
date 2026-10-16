import { APP_VERSION } from '../../../config/release'
import { loadSyncQueue } from '../../cloud/syncQueue'
import { getPhotoUploadSummary } from '../../photos/data/photoStore'
import { loadReliabilityEvents } from '../data/reliabilityStore'

export function createDiagnosticSnapshot(input: {
  cloudStatus: string
  cloudError: string
  lastAttemptAt: string | null
  lastSyncedAt: string | null
  organizationConnected: boolean
}) {
  const queue = loadSyncQueue()
  const queueByRecordType = queue.reduce<Record<string, number>>((summary, change) => {
    summary[change.recordType] = (summary[change.recordType] ?? 0) + 1
    return summary
  }, {})
  const unresolvedEvents = loadReliabilityEvents()
    .filter((event) => event.resolvedAt === null)
    .slice(0, 25)
    .map((event) => ({
      area: event.area,
      severity: event.severity,
      message: event.message,
      detail: event.detail,
      occurrences: event.occurrences,
      firstSeenAt: event.firstSeenAt,
      lastSeenAt: event.lastSeenAt,
      context: event.context,
    }))

  return {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    platform: /android/i.test(navigator.userAgent) ? 'android' : 'web',
    online: navigator.onLine,
    visibility: document.visibilityState,
    cloud: {
      status: input.cloudStatus,
      error: input.cloudError,
      lastAttemptAt: input.lastAttemptAt,
      lastSyncedAt: input.lastSyncedAt,
      organizationConnected: input.organizationConnected,
      queuedRecordCount: queue.length,
      queueByRecordType,
    },
    photos: getPhotoUploadSummary(),
    unresolvedEvents,
  }
}

