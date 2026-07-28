import { useState } from 'react'
import Sidebar, {
  type PageName,
} from './components/Sidebar/Sidebar'
import Customers from './features/customers/pages/Customers'
import Dashboard from './pages/Dashboard/Dashboard'
import Estimates from './features/estimates/pages/Estimates'
import Inbox from './pages/Inbox/Inbox'
import Settings from './pages/Settings/Settings'

function App() {
  const [activePage, setActivePage] =
    useState<PageName>('home')

  const [
    selectedEstimateCustomerId,
    setSelectedEstimateCustomerId,
  ] = useState<string | null>(null)

  function openEstimateBuilder(customerId?: string) {
    setSelectedEstimateCustomerId(customerId ?? null)
    setActivePage('documents')
  }

  function handlePageChange(page: PageName) {
    if (page !== 'documents') {
      setSelectedEstimateCustomerId(null)
    }

    setActivePage(page)
  }

  function renderCurrentPage() {
    switch (activePage) {
      case 'customers':
        return (
          <Customers
            onStartEstimate={(customerId) =>
              openEstimateBuilder(customerId)
            }
          />
        )

           case 'documents':
        return (
          <Estimates
            initialCustomerId={
              selectedEstimateCustomerId
            }
          />
        )

      case 'inbox':
        return <Inbox />

      case 'settings':
        return <Settings />

      case 'home':
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onPageChange={handlePageChange}
      />

      <main className="workspace">
        <header className="topbar">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>

            <input
              aria-label="Search"
              placeholder="Search customers, estimates, invoices..."
              type="search"
            />
          </label>

          <button
            className="new-estimate-button"
            onClick={() => openEstimateBuilder()}
            type="button"
          >
            + New estimate
          </button>
        </header>

        <section className="page-content">
          {renderCurrentPage()}
        </section>
      </main>
    </div>
  )
}

export default App