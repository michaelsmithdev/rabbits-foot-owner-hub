import { recordStartupEvent } from '../startup/startupDiagnostics'

const ACTIVE_SCOPE_KEY = 'owner-hub-cache-scope'
const BUSINESS_STORAGE_KEYS = [
  'rabbits-foot-customers', 'rabbits-foot-estimates', 'rabbits-foot-invoices',
  'rabbits-foot-business-settings', 'rabbits-foot-cloud-sync-queue',
  'rabbits-foot-cloud-sync-metadata', 'rabbits-foot-leads',
  'rabbits-foot-lead-sync-queue', 'rabbits-foot-lead-sync-metadata',
  'rabbits-foot-photos', 'rabbits-foot-photo-delete-queue',
  'rabbits-foot-document-archive', 'rabbits-foot-walkthroughs',
  'rabbits-foot-pricebook', 'rabbits-foot-jobs', 'rabbits-foot-appointments',
  'rabbits-foot-communications',
] as const

function scopedKey(organizationId: string, key: string) {
  return `owner-hub-workspace:${organizationId}:${key}`
}

function preserveCurrentScope(organizationId: string) {
  for (const key of BUSINESS_STORAGE_KEYS) {
    const value = localStorage.getItem(key)
    if (value === null) localStorage.removeItem(scopedKey(organizationId, key))
    else localStorage.setItem(scopedKey(organizationId, key), value)
  }
}

export function activateOrganizationStorage(organizationId: string) {
  try {
    const currentScope = localStorage.getItem(ACTIVE_SCOPE_KEY)
    if (currentScope === organizationId) return

    if (currentScope) {
      preserveCurrentScope(currentScope)
    } else {
      // First upgrade: assign the existing offline cache to the authenticated
      // organization so the current owner's records are preserved.
      const targetHasSnapshot = BUSINESS_STORAGE_KEYS.some((key) => localStorage.getItem(scopedKey(organizationId, key)) !== null)
      if (!targetHasSnapshot) preserveCurrentScope(organizationId)
    }

    for (const key of BUSINESS_STORAGE_KEYS) {
      const value = localStorage.getItem(scopedKey(organizationId, key))
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
    localStorage.setItem(ACTIVE_SCOPE_KEY, organizationId)
    localStorage.setItem('owner-hub-active-organization', organizationId)
    recordStartupEvent('workspace-storage-activated', organizationId)
  } catch (error) {
    recordStartupEvent('workspace-storage-activation-failed', error)
    throw new Error('This device could not safely open the selected business workspace.', { cause: error })
  }
}
