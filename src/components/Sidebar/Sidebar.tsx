import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'

import { navigationItems, type PageName } from './navigation'
import { useSaas } from '../../features/saas/saasContext'

type NavigationProps = {
  activePage: PageName
  onPageChange: (page: PageName) => void
}

function Brand() {
  const { organization } = useSaas()
  return (
    <div className="sidebar-brand">
      <img
        alt={`${organization?.name ?? 'Business'} logo`}
        className="brand-logo"
        height="64"
        src="/rabbits-foot-logo.png"
        width="64"
      />
      <div>
        <h1>{(organization?.name ?? 'OWNER HUB').toUpperCase()}</h1>
        <p>OWNER HUB</p>
      </div>
    </div>
  )
}

function Sidebar({
  activePage,
  onPageChange,
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const primaryIds = new Set<PageName>([
    'home',
    'customers',
    'documents',
    'inbox',
  ])
  const primaryItems = navigationItems.filter((item) => primaryIds.has(item.id))
  const secondaryItems = navigationItems.filter((item) => !primaryIds.has(item.id))

  useEffect(() => {
    if (!mobileMenuOpen) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    document.body.classList.add('mobile-menu-is-open')
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.classList.remove('mobile-menu-is-open')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileMenuOpen])

  function selectPage(page: PageName) {
    setMobileMenuOpen(false)
    onPageChange(page)
  }

  return (
    <>
      <aside className="sidebar">
        <Brand />

        <nav
          aria-label="Main navigation"
          className="sidebar-navigation"
        >
          {navigationItems.map((item) => {
            const Icon = item.icon

            return (
              <button
                aria-current={
                  activePage === item.id ? 'page' : undefined
                }
                className={
                  activePage === item.id
                    ? 'nav-button active'
                    : 'nav-button'
                }
                key={item.id}
                data-tour={item.id === 'documents' ? 'estimates' : item.id}
                onClick={() => selectPage(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
                <span>{item.label}</span>

              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>Field-ready workspace</strong>
          <span>Offline access enabled</span>
        </div>
      </aside>

      <nav
        aria-label="Mobile navigation"
        className="mobile-navigation"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon

          return (
            <button
              aria-current={
                activePage === item.id ? 'page' : undefined
              }
              className={
                activePage === item.id
                  ? 'mobile-nav-button active'
                  : 'mobile-nav-button'
              }
              key={item.id}
              data-tour={item.id === 'documents' ? 'estimates' : item.id}
              onClick={() => selectPage(item.id)}
              type="button"
            >
              <span className="mobile-nav-icon">
                <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
              </span>
              <span>{item.shortLabel}</span>
            </button>
          )
        })}
        <button
          aria-expanded={mobileMenuOpen}
          aria-label="Open more navigation"
          className={
            !primaryIds.has(activePage)
              ? 'mobile-nav-button active'
              : 'mobile-nav-button'
          }
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          <span className="mobile-nav-icon">
            <Menu aria-hidden="true" size={21} strokeWidth={2.2} />
          </span>
          <span>More</span>
        </button>
      </nav>

      {mobileMenuOpen ? (
        <div className="mobile-more-backdrop" role="presentation" onClick={() => setMobileMenuOpen(false)}>
          <section
            aria-label="More navigation"
            aria-modal="true"
            className="mobile-more-drawer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mobile-more-header">
              <div>
                <p>OWNER HUB</p>
                <h2>More tools</h2>
              </div>
              <button aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} type="button">
                <X aria-hidden="true" size={22} />
              </button>
            </div>
            <div className="mobile-more-grid">
              {secondaryItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    aria-current={activePage === item.id ? 'page' : undefined}
                    className={activePage === item.id ? 'mobile-more-item active' : 'mobile-more-item'}
                    data-tour={item.id}
                    key={item.id}
                    onClick={() => selectPage(item.id)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

export default Sidebar
