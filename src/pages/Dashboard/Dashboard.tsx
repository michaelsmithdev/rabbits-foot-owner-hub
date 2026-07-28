const dashboardStats = [
  {
    label: 'Outstanding',
    value: '$0.00',
    description: 'Unpaid invoices',
    symbol: '→',
  },
  {
    label: 'Paid total',
    value: '$0.00',
    description: 'All recorded payments',
    symbol: '✓',
  },
  {
    label: 'Open estimates',
    value: '1',
    description: 'Waiting on customers',
    symbol: '↗',
  },
  {
    label: 'Needs reply',
    value: '1',
    description: 'New customer messages',
    symbol: '✉',
  },
]

function Dashboard() {
  return (
    <>
      <section className="dashboard-header">
        <div>
          <p className="eyebrow">OWNER OVERVIEW</p>
          <h1>Good afternoon.</h1>
          <p className="dashboard-subtitle">
            Here&apos;s what needs your attention today.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button className="button-light" type="button">
            Log email
          </button>

          <button className="button-dark" type="button">
            Add customer
          </button>
        </div>
      </section>

      <section className="dashboard-stats">
        {dashboardStats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-card-top">
              <span>{stat.label}</span>
              <span className="stat-symbol">{stat.symbol}</span>
            </div>

            <strong>{stat.value}</strong>
            <p>{stat.description}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-content-grid">
        <article className="dashboard-panel recent-work-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT WORK</p>
              <h2>Estimates &amp; invoices</h2>
            </div>

            <button className="text-link" type="button">
              View all →
            </button>
          </div>

          <div className="document-row">
            <div className="document-symbol">＝</div>

            <div className="document-information">
              <strong>Drywall repair &amp; TV mounting</strong>
              <span>Sample customer · EST-1001</span>
            </div>

            <span className="draft-badge">DRAFT</span>
            <strong className="document-price">$350.00</strong>
            <span className="document-arrow">›</span>
          </div>
        </article>

        <article className="dashboard-panel attention-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FOLLOW UP</p>
              <h2>Needs attention</h2>
            </div>

            <span className="attention-count">1</span>
          </div>

          <div className="attention-row">
            <span className="attention-dot" />

            <div>
              <strong>Sample customer request</strong>
              <p>Sample customer · 7/20/2026</p>
            </div>

            <span>›</span>
          </div>

          <button className="log-email-button" type="button">
            + Log an incoming email
          </button>
        </article>
      </section>
    </>
  )
}

export default Dashboard