import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ApplicationErrorBoundary from './components/ApplicationErrorBoundary/ApplicationErrorBoundary.tsx'
import { clearNativePwaCache } from './features/pwa/clearNativePwaCache.ts'
import StartupReady from './startup/StartupReady.tsx'
import { repairStoredData } from './startup/repairStoredData.ts'
import RootRouter from './RootRouter.tsx'
import {
  installGlobalStartupLogging,
  recordStartupEvent,
} from './startup/startupDiagnostics.ts'

installGlobalStartupLogging()
recordStartupEvent('main-module-loaded')
repairStoredData()
void clearNativePwaCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <StartupReady />
      <RootRouter />
    </ApplicationErrorBoundary>
  </StrictMode>,
)
