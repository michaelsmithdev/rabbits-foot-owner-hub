export type PageName =
  | 'home'
  | 'customers'
  | 'documents'
  | 'inbox'
  | 'settings'

type SidebarProps = {
  activePage: PageName
  onPageChange: (page: PageName) => void
}

const navigationItems: Array<{
  id: PageName
  label: string
}> = [
  {
    id: 'home',
    label: 'Home',
  },
  {
    id: 'customers',
    label: 'Customers',
  },
  {
    id: 'documents',
    label: 'Estimates & invoices',
  },
  {
    id: 'inbox',
    label: 'Inbox',
  },
  {
    id: 'settings',
    label: 'Settings',
  },
]

function Sidebar({
  activePage,
  onPageChange,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">RF</div>

        <div>
          <h1>RABBIT&apos;S FOOT</h1>
          <h1>HANDYMAN</h1>
          <h1>SERVICES</h1>
          <p>OWNER HUB</p>
        </div>
      </div>

      <nav
        aria-label="Main navigation"
        className="sidebar-navigation"
      >
        {navigationItems.map((item) => (
          <button
            className={
              activePage === item.id
                ? 'nav-button active'
                : 'nav-button'
            }
            key={item.id}
            onClick={() => onPageChange(item.id)}
            type="button"
          >
            {item.label}

            {item.id === 'inbox' && (
              <span className="notification-badge">
                1
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <strong>Private &amp; local</strong>
        <span>No subscription needed</span>
      </div>
    </aside>
  )
}

export default Sidebar