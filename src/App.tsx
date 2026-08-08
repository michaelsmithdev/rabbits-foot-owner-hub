import { useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'

import Sidebar from './components/Sidebar/Sidebar'
import {
  navigationItems,
  type PageName,
} from './components/Sidebar/navigation'
import Customers from './features/customers/pages/Customers'
import Estimates from './features/estimates/pages/Estimates'
import CloudSyncStatus from './features/cloud/CloudSyncStatus'
import { DATA_REFRESHED_EVENT } from './features/cloud/syncQueue'
import ConnectionStatus from './features/pwa/components/ConnectionStatus'
import Dashboard from './pages/Dashboard/Dashboard'
import Inbox from './pages/Inbox/Inbox'
import Photos from './pages/Photos/Photos'
import Settings from './pages/Settings/Settings'
import DocumentsArchive from './features/documents/pages/DocumentsArchive'
import PriceHistory from './features/pricing/pages/PriceHistory'
import Walkthroughs from './features/walkthroughs/pages/Walkthroughs'
import Jobs from './features/jobs/pages/Jobs'
import { loadBusinessSettings } from './features/settings/data/businessSettingsStore'

type EstimateLaunch = {
  requestId: number
  customerId: string | null
  openBuilder: boolean
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
  const [activePage, setActivePage] = useState<PageName>(getPageFromHash)
  const [estimateLaunch, setEstimateLaunch] = useState<EstimateLaunch>({
    requestId: 0,
    customerId: null,
    openBuilder: false,
  })
  const [dataRevision, setDataRevision] = useState(0)

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

    document.title = currentPage
      ? `${currentPage.label} | Rabbit's Foot Owner Hub`
      : "Rabbit's Foot Owner Hub"
  }, [activePage])

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
    setEstimateLaunch((currentLaunch) => ({
      requestId: currentLaunch.requestId + 1,
      customerId: customerId ?? null,
      openBuilder: true,
    }))
    navigateTo('documents')
  }

  function handlePageChange(page: PageName) {
    if (page === 'documents') {
      setEstimateLaunch((currentLaunch) => ({
        requestId: currentLaunch.requestId + 1,
        customerId: null,
        openBuilder: false,
      }))
    }

    navigateTo(page)
  }

  function renderCurrentPage() {
    switch (activePage) {
      case 'customers':
        return <Customers onStartEstimate={openEstimateBuilder} />

      case 'walkthrough':
        return <Walkthroughs />

      case 'jobs':
        return <Jobs />

      case 'documents':
        return (
          <Estimates
            initialCustomerId={estimateLaunch.customerId}
            key={estimateLaunch.requestId}
            openBuilderOnMount={estimateLaunch.openBuilder}
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
        return <Settings />

      case 'home':
      default:
        return (
          <Dashboard
            onOpenCustomers={() => handlePageChange('customers')}
            onOpenDocuments={() => handlePageChange('documents')}
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
          {renderCurrentPage()}
        </section>
      </main>
    </div>
  )
}

export default App
