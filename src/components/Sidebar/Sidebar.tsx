import { navigationItems, type PageName } from './navigation'

type NavigationProps = {
  activePage: PageName
  onPageChange: (page: PageName) => void
}

function Brand() {
  return (
    <div className="sidebar-brand">
      <img
        alt=""
        aria-hidden="true"
        className="brand-logo"
        height="64"
        src="/rabbits-foot-logo.png"
        width="64"
      />
      <div>
        <h1>RABBIT&apos;S FOOT</h1>
        <p>OWNER HUB</p>
      </div>
    </div>
  )
}

function Sidebar({
  activePage,
  onPageChange,
}: NavigationProps) {
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
                onClick={() => onPageChange(item.id)}
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
        {navigationItems.map((item) => {
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
              onClick={() => onPageChange(item.id)}
              type="button"
            >
              <span className="mobile-nav-icon">
                <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
              </span>
              <span>{item.shortLabel}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}

export default Sidebar
