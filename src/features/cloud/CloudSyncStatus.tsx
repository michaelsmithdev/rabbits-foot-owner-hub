import {
  AlertTriangle,
  Cloud,
  CloudOff,
  HardDrive,
  RefreshCw,
} from 'lucide-react'

import { useAuth } from '../auth/authContext'
import { useCloudSync } from './cloudSyncContext'

const statusContent = {
  local: { label: 'Local mode', Icon: HardDrive },
  offline: { label: 'Offline · changes saved', Icon: CloudOff },
  syncing: { label: 'Syncing', Icon: RefreshCw },
  synced: { label: 'Cloud synced', Icon: Cloud },
  error: { label: 'Sync needs attention', Icon: AlertTriangle },
} as const

export default function CloudSyncStatus() {
  const { session } = useAuth()
  const {
    errorMessage,
    lastSyncedAt,
    pendingRecordCount,
    status,
    syncNow,
  } = useCloudSync()
  const { Icon, label } = statusContent[status]
  const title =
    status === 'error'
      ? errorMessage
      : pendingRecordCount > 0
        ? `${pendingRecordCount} saved change${pendingRecordCount === 1 ? '' : 's'} waiting for cloud protection`
        : lastSyncedAt
        ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}`
        : session
          ? 'Cloud workspace connected'
          : 'Development data stays on this device'

  return (
    <button
      className={`cloud-sync-status cloud-sync-${status}`}
      onClick={() => void syncNow()}
      title={title}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={status === 'syncing' ? 'cloud-sync-spinner' : undefined}
        size={17}
      />
      <span>{pendingRecordCount > 0 && status !== 'syncing' ? `${pendingRecordCount} queued` : label}</span>
    </button>
  )
}
