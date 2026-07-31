import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '../auth/authContext'
import { cloudClient } from './cloudClient'
import {
  CloudSyncContext,
  type CloudSyncStatus,
} from './cloudSyncContext'
import {
  getOrganizationId,
  synchronizeBusinessRecords,
} from './cloudSync'
import { SYNC_REQUESTED_EVENT } from './syncQueue'

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { session, mode } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [status, setStatus] = useState<CloudSyncStatus>(
    mode === 'local' ? 'local' : 'offline',
  )
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const syncInProgress = useRef(false)

  const syncNow = useCallback(async () => {
    if (mode === 'local' || !cloudClient || !session) {
      setStatus('local')
      return
    }

    if (!navigator.onLine) {
      setStatus('offline')
      return
    }

    if (syncInProgress.current) {
      return
    }

    syncInProgress.current = true
    setStatus('syncing')
    setErrorMessage('')

    try {
      const currentOrganizationId =
        organizationId ?? (await getOrganizationId(cloudClient))

      setOrganizationId(currentOrganizationId)
      await synchronizeBusinessRecords(
        cloudClient,
        currentOrganizationId,
      )
      setLastSyncedAt(new Date().toISOString())
      setStatus('synced')
    } catch (error) {
      console.error('Cloud synchronization failed.', error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Cloud synchronization failed.',
      )
      setStatus('error')
    } finally {
      syncInProgress.current = false
    }
  }, [mode, organizationId, session])

  useEffect(() => {
    if (mode === 'local') return

    if (!session || !cloudClient) return

    const initialSyncId = window.setTimeout(() => void syncNow(), 0)

    const intervalId = window.setInterval(() => void syncNow(), 60_000)
    const handleOnline = () => void syncNow()
    const handleOffline = () => setStatus('offline')
    let debounceId: number | undefined
    const handleSyncRequested = () => {
      window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => void syncNow(), 700)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(SYNC_REQUESTED_EVENT, handleSyncRequested)

    return () => {
      window.clearTimeout(initialSyncId)
      window.clearInterval(intervalId)
      window.clearTimeout(debounceId)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(SYNC_REQUESTED_EVENT, handleSyncRequested)
    }
  }, [mode, session, syncNow])

  useEffect(() => {
    const client = cloudClient

    if (!client || !session || !organizationId) return

    const channel = client
      .channel(`owner-hub-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_records',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => void syncNow(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => void syncNow(),
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [organizationId, session, syncNow])

  const contextValue = useMemo(
    () => ({
      organizationId,
      status,
      lastSyncedAt,
      errorMessage,
      syncNow,
    }),
    [errorMessage, lastSyncedAt, organizationId, status, syncNow],
  )

  return (
    <CloudSyncContext.Provider value={contextValue}>
      {children}
    </CloudSyncContext.Provider>
  )
}
