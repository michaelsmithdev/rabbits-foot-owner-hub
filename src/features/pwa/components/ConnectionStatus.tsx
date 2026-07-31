import { Wifi, WifiOff } from 'lucide-react'

import { useOnlineStatus } from '../hooks/useOnlineStatus'

function ConnectionStatus() {
  const isOnline = useOnlineStatus()

  return (
    <span
      className={
        isOnline
          ? 'connection-status is-online'
          : 'connection-status is-offline'
      }
      title={
        isOnline
          ? 'Connected to the internet'
          : 'Offline: saved data remains available on this device'
      }
    >
      {isOnline ? (
        <Wifi aria-hidden="true" size={16} />
      ) : (
        <WifiOff aria-hidden="true" size={16} />
      )}
      <span>{isOnline ? 'Online' : 'Offline'}</span>
    </span>
  )
}

export default ConnectionStatus
