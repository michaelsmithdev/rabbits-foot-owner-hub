import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ApplicationErrorBoundary from './components/ApplicationErrorBoundary/ApplicationErrorBoundary.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { CloudSyncProvider } from './features/cloud/CloudSyncProvider.tsx'
import PwaLifecycle from './features/pwa/components/PwaLifecycle.tsx'
import { clearNativePwaCache } from './features/pwa/clearNativePwaCache.ts'
import StartupReady from './startup/StartupReady.tsx'
import PublicCustomerPortal from './features/portal/PublicCustomerPortal.tsx'
import { repairStoredData } from './startup/repairStoredData.ts'
import {
  installGlobalStartupLogging,
  recordStartupEvent,
} from './startup/startupDiagnostics.ts'

installGlobalStartupLogging()
recordStartupEvent('main-module-loaded')
repairStoredData()
void clearNativePwaCache()

const portalToken = window.location.hash.startsWith('#portal/')
  ? decodeURIComponent(window.location.hash.slice('#portal/'.length))
  : ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <StartupReady />
      {portalToken ? <PublicCustomerPortal token={portalToken} /> : (
        <AuthProvider>
          <AuthGate>
            <CloudSyncProvider>
              <App />
              <PwaLifecycle />
            </CloudSyncProvider>
          </AuthGate>
        </AuthProvider>
      )}
    </ApplicationErrorBoundary>
  </StrictMode>,
)
