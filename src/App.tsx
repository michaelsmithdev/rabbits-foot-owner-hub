import { lazy, Suspense, useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'

import Sidebar from './components/Sidebar/Sidebar'
import {
  navigationItems,
  type PageName,
} from './components/Sidebar/navigation'
import CloudSyncStatus from './features/cloud/CloudSyncStatus'
import { DATA_REFRESHED_EVENT } from './features/cloud/syncQueue'
import ConnectionStatus from './features/pwa/components/ConnectionStatus'
import { loadBusinessSettings } from './features/settings/data/businessSettingsStore'
import { useSaas } from './features/saas/saasContext'
import { useAuth } from './features/auth/authContext'
import ProductTour from './features/onboarding/ProductTour'

const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const Customers = lazy(() => import('./features/customers/pages/Customers'))
const Estimates = lazy(() => import('./features/estimates/pages/Estimates'))
const Inbox = lazy(() => import('./pages/Inbox/Inbox'))
const Photos = lazy(() => import('./pages/Photos/Photos'))
const Settings = lazy(() => import('./pages/Settings/Settings'))
const DocumentsArchive = lazy(() => import('./features/documents/pages/DocumentsArchive'))
const PriceHistory = lazy(() => import('./features/pricing/pages/PriceHistory'))
const Walkthroughs = lazy(() => import('./features/walkthroughs/pages/Walkthroughs'))
const Jobs = lazy(() => import('./features/jobs/pages/Jobs'))
const Schedule = lazy(() => import('./features/schedule/pages/Schedule'))
const BusinessWorkspace = lazy(() => import('./features/saas/pages/BusinessWorkspace'))

type DocumentLaunch = {
  requestId: number
  customerId: string | null
  openBuilder: boolean
  documentKind: 'estimate' | 'invoice' | null
  documentId: string | null
}

const validPages = new Set<PageName>(
  navigationItems.map((item) => item.id),
)

function getPageFromHash(): PageName {
  const requestedPage = window.location.hash.replace('#', '')

  return validPages.has(requestedPage as PageName)
    ? (requestedPage as PageName)
    : 'home'
}

function App() {
  const { organization } = useSaas()
  const { mode, session } = useAuth()
  const [activePage, setActivePage] = useState<PageName>(getPageFromHash)
  const [documentLaunch, setDocumentLaunch] = useState<DocumentLaunch>({
    requestId: 0,
    customerId: null,
    openBuilder: false,
    documentKind: null,
    documentId: null,
  })
  const [customerLaunch, setCustomerLaunch] = useState({
    requestId: 0,
    customerId: null as string | null,
  })
  const [dataRevision, setDataRevision] = useState(0)
  const [tourState, setTourState] = useState<'welcome' | 'running' | null>(null)

  const onboardingStorageKey = session?.user.id
    ? `rabbits-foot-onboarding-${session.user.id}`
    : mode === 'local'
      ? 'rabbits-foot-onboarding-local'
      : ''

  useEffect(() => {
    if (!onboardingStorageKey || localStorage.getItem(onboardingStorageKey)) return
    const timeout = window.setTimeout(() => setTourState('welcome'), 0)
    return () => window.clearTimeout(timeout)
  }, [onboardingStorageKey])

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    const handleDataRefresh = () => {
      setDataRevision((currentRevision) => currentRevision + 1)
    }

    window.addEventListener(DATA_REFRESHED_EVENT, handleDataRefresh)

    return () =>
      window.removeEventListener(DATA_REFRESHED_EVENT, handleDataRefresh)
  }, [])

  useEffect(() => {
    const currentPage = navigationItems.find(
      (item) => item.id === activePage,
    )

    const workspaceName = organization?.name ?? 'Owner Hub'
    document.title = currentPage ? `${currentPage.label} | ${workspaceName}` : workspaceName
  }, [activePage, organization?.name])

  useEffect(() => {
    document.documentElement.dataset.theme = loadBusinessSettings().darkMode ? 'dark' : 'light'
  }, [activePage, dataRevision])

  function navigateTo(page: PageName) {
    setActivePage(page)

    const nextHash = page === 'home' ? '' : `#${page}`

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    }
  }

  function openEstimateBuilder(customerId?: string) {
    setDocumentLaunch((currentLaunch) => ({
      requestId: currentLaunch.requestId + 1,
      customerId: customerId ?? null,
      openBuilder: true,
      documentKind: null,
      documentId: null,
    }))
    navigateTo('documents')
  }

  function openDocument(
    documentKind: 'estimate' | 'invoice',
    documentId: string,
  ) {
    setDocumentLaunch((currentLaunch) => ({
      requestId: currentLaunch.requestId + 1,
      customerId: null,
      openBuilder: false,
      documentKind,
      documentId,
    }))
    navigateTo('documents')
  }

  function openCustomer(customerId: string) {
    setCustomerLaunch((currentLaunch) => ({
      requestId: currentLaunch.requestId + 1,
      customerId,
    }))
    navigateTo('customers')
  }

  function handlePageChange(page: PageName) {
    if (page === 'documents') {
      setDocumentLaunch((currentLaunch) => ({
        requestId: currentLaunch.requestId + 1,
        customerId: null,
        openBuilder: false,
        documentKind: null,
        documentId: null,
      }))
    }

    if (page === 'customers') {
      setCustomerLaunch((currentLaunch) => ({
        requestId: currentLaunch.requestId + 1,
        customerId: null,
      }))
    }

    navigateTo(page)
  }

  function renderCurrentPage() {
    switch (activePage) {
      case 'customers':
        return (
          <Customers
            initialCustomerId={customerLaunch.customerId}
            key={customerLaunch.requestId}
            onStartEstimate={openEstimateBuilder}
          />
        )

      case 'walkthrough':
        return <Walkthroughs />

      case 'schedule':
        return <Schedule />

      case 'jobs':
        return <Jobs />

      case 'documents':
        return (
          <Estimates
            initialCustomerId={documentLaunch.customerId}
            initialDocumentId={documentLaunch.documentId}
            initialDocumentKind={documentLaunch.documentKind}
            key={documentLaunch.requestId}
            openBuilderOnMount={documentLaunch.openBuilder}
          />
        )

      case 'inbox':
        return <Inbox onOpenDocuments={() => handlePageChange('documents')} />

      case 'archive':
        return <DocumentsArchive />

      case 'pricing':
        return <PriceHistory />

      case 'photos':
        return <Photos />

      case 'settings':
        return <Settings onStartTour={() => setTourState('running')} />

      case 'business':
        return <BusinessWorkspace />

      case 'home':
      default:
        return (
          <Dashboard
            onOpenCustomer={openCustomer}
            onOpenCustomers={() => handlePageChange('customers')}
            onOpenDocument={openDocument}
            onOpenDocuments={() => handlePageChange('documents')}
            onOpenSchedule={() => handlePageChange('schedule')}
          />
        )
    }
  }

  const currentPageLabel =
    navigationItems.find((item) => item.id === activePage)?.label ??
    'Dashboard'

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onPageChange={handlePageChange}
      />

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span>OWNER HUB</span>
            <strong>{currentPageLabel}</strong>
          </div>

          <div className="topbar-actions">
            <ConnectionStatus />
            <CloudSyncStatus />
            <button
              className="new-estimate-button walkthrough-launch-button"
              data-tour="ai-estimate"
              onClick={() => handlePageChange('walkthrough')}
              type="button"
            >
              <ClipboardList aria-hidden="true" size={19} strokeWidth={2.5} />
              <span>Start walkthrough</span>
            </button>
            <button
              aria-label="New estimate"
              className="new-estimate-button"
              onClick={() => openEstimateBuilder()}
              type="button"
            >
              <Plus aria-hidden="true" size={19} strokeWidth={2.5} />
              <span>New estimate</span>
            </button>
          </div>
        </header>

        <section
          className="page-content"
          key={
            activePage === 'documents' ||
            activePage === 'inbox' ||
            activePage === 'photos'
              ? activePage
              : `${activePage}-${dataRevision}`
          }
        >
          <Suspense
            fallback={
              <div className="route-loading" role="status">
                <span />
                Opening {currentPageLabel}…
              </div>
            }
          >
            {renderCurrentPage()}
          </Suspense>
        </section>
      </main>

      {tourState ? (
        <ProductTour
          initialWelcome={tourState === 'welcome'}
          onClose={(completed) => {
            if (onboardingStorageKey) {
              localStorage.setItem(
                onboardingStorageKey,
                JSON.stringify({ completed, dismissedAt: new Date().toISOString() }),
              )
            }
            setTourState(null)
          }}
          onNavigate={navigateTo}
        />
      ) : null}
    </div>
  )
}

export default App
