import { recordStartupEvent } from './startupDiagnostics'

const JSON_STORAGE_KEYS = [
  'rabbits-foot-customers',
  'rabbitfoot-customers',
  'rabbit-foot-customers',
  'rabbits-foot-estimates',
  'rabbits-foot-invoices',
  'rabbits-foot-business-settings',
  'rabbits-foot-cloud-sync-queue',
  'rabbits-foot-cloud-sync-metadata',
  'rabbits-foot-leads',
  'rabbits-foot-lead-sync-queue',
  'rabbits-foot-lead-sync-metadata',
  'rabbits-foot-photos',
  'rabbits-foot-photo-delete-queue',
  'rabbits-foot-document-archive',
  'rabbits-foot-walkthroughs',
  'rabbits-foot-pricebook',
  'rabbits-foot-jobs',
]

function preserveAndRemoveInvalidValue(key: string, value: string) {
  const backupKey = `ownerhub:recovery:${key}:${Date.now()}`
  localStorage.setItem(backupKey, value)
  localStorage.removeItem(key)
  recordStartupEvent('invalid-storage-recovered', key)
}

export function repairStoredData() {
  try {
    JSON_STORAGE_KEYS.forEach((key) => {
      const value = localStorage.getItem(key)
      if (value === null) return

      try {
        JSON.parse(value)
      } catch {
        preserveAndRemoveInvalidValue(key, value)
      }
    })

    // Supabase sessions are JSON. A truncated value left by an interrupted
    // update must not trap authentication initialization.
    const authenticationKeys = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.key(index),
    ).filter(
      (key): key is string =>
        Boolean(key?.startsWith('sb-') && key.endsWith('-auth-token')),
    )

    authenticationKeys.forEach((key) => {
      const value = localStorage.getItem(key)
      if (value === null) return

      try {
        JSON.parse(value)
      } catch {
        preserveAndRemoveInvalidValue(key, value)
      }
    })
  } catch (error) {
    recordStartupEvent('storage-recovery-unavailable', error)
  }
}
