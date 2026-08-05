import {
  CheckCircle2,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Capacitor } from '@capacitor/core'

import { useOnlineStatus } from '../hooks/useOnlineStatus'

function WebPwaLifecycle() {
  const isOnline = useOnlineStatus()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  if (!isOnline) {
    return (
      <aside
        aria-live="polite"
        className="pwa-notice is-offline"
        role="status"
      >
        <WifiOff aria-hidden="true" size={20} />
        <div>
          <strong>Working offline</strong>
          <p>Your saved customers, estimates, and invoices remain available.</p>
        </div>
      </aside>
    )
  }

  if (needRefresh) {
    return (
      <aside
        aria-live="polite"
        className="pwa-notice"
        role="status"
      >
        <RefreshCw aria-hidden="true" size={20} />
        <div>
          <strong>Update ready</strong>
          <p>Save your work, then load the latest Owner Hub version.</p>
          <div className="pwa-notice-actions">
            <button
              className="pwa-notice-primary"
              onClick={() => void updateServiceWorker(true)}
              type="button"
            >
              Update now
            </button>
            <button
              className="pwa-notice-secondary"
              onClick={() => setNeedRefresh(false)}
              type="button"
            >
              Later
            </button>
          </div>
        </div>
      </aside>
    )
  }

  if (offlineReady) {
    return (
      <aside
        aria-live="polite"
        className="pwa-notice"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" size={20} />
        <div>
          <strong>Ready for the field</strong>
          <p>The Owner Hub can now open without an internet connection.</p>
        </div>
        <button
          aria-label="Dismiss offline-ready message"
          className="pwa-notice-close"
          onClick={() => setOfflineReady(false)}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </aside>
    )
  }

  return null
}

function PwaLifecycle() {
  // Capacitor packages the web bundle inside the APK. A browser service worker
  // can keep serving an older packaged bundle after a Play Store update, which
  // leaves the native WebView on a blank page. Android updates are handled by
  // Google Play, so the PWA updater must only run in a normal web browser.
  if (Capacitor.isNativePlatform()) return null

  return <WebPwaLifecycle />
}

export default PwaLifecycle
