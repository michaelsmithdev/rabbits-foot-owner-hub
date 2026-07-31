import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ApplicationErrorBoundary from './components/ApplicationErrorBoundary/ApplicationErrorBoundary.tsx'
import { AuthGate } from './features/auth/AuthGate.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { CloudSyncProvider } from './features/cloud/CloudSyncProvider.tsx'
import PwaLifecycle from './features/pwa/components/PwaLifecycle.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <CloudSyncProvider>
            <App />
            <PwaLifecycle />
          </CloudSyncProvider>
        </AuthGate>
      </AuthProvider>
    </ApplicationErrorBoundary>
  </StrictMode>,
)
