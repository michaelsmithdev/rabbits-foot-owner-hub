import { createContext, useContext } from 'react'

export type CloudSyncStatus =
  | 'local'
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'error'

export type CloudSyncContextValue = {
  organizationId: string | null
  status: CloudSyncStatus
  lastSyncedAt: string | null
  errorMessage: string
  syncNow: () => Promise<void>
}
export const CloudSyncContext =
  createContext<CloudSyncContextValue | null>(null)

export function useCloudSync() {
  const context = useContext(CloudSyncContext)

  if (!context) {
    throw new Error('useCloudSync must be used inside CloudSyncProvider.')
  }

  return context
}
