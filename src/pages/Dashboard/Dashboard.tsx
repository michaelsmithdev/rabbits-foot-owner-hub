import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  ReceiptText,
  UsersRound,
} from 'lucide-react'

import { loadCustomers } from '../../features/customers/data/customerStore'
import { loadEstimates } from '../../features/estimates/data/estimateStore'
import type { Estimate } from '../../features/estimates/types/Estimate'
import { loadInvoices } from '../../features/invoices/data/invoiceStore'
import type { Invoice } from '../../features/invoices/types/Invoice'
import { loadBusinessSettings } from '../../features/settings/data/businessSettingsStore'

type DashboardProps = {
  onOpenCustomers: () => void
  onOpenDocuments: () => void
}

type FinancialDocument = Estimate | Invoice

function getDocumentTotal(document: FinancialDocument) {
  const subtotal = document.lineItems.reduce(
    (sum, lineItem) => sum + lineItem.quantity * lineItem.unitPrice,
    0,
  )
  const tax = subtotal * (document.taxRate / 100)

  return Math.max(0, subtotal + tax - document.discount)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return 'Good morning.'
  if (hour < 17) return 'Good afternoon.'
  return 'Good evening.'
}

function Dashboard({
  onOpenCustomers,
  onOpenDocuments,
}: DashboardProps) {
  const customers = loadCustomers()
  const estimates = loadEstimates()
  const invoices = loadInvoices()
  const settings = loadBusinessSettings()
  const customerNames = new Map(
    customers.map((customer) => [
      customer.id,
      `${customer.firstName} ${customer.lastName}`.trim(),
    ]),
  )

  const outstandingTotal = invoices
    .filter(
      (invoice) =>
        invoice.status !== 'paid' && invoice.status !== 'void',
    )
    .reduce((sum, invoice) => sum + getDocumentTotal(invoice), 0)

  const paidTotal = invoices
    .filter((invoice) => invoice.status === 'paid')
    .reduce((sum, invoice) => sum + getDocumentTotal(invoice), 0)

  const monthKey = new Date().toISOString().slice(0, 7)
  const monthlyRevenue = invoices.filter((invoice) => invoice.status === 'paid' && (invoice.paidAt ?? invoice.updatedAt).slice(0, 7) === monthKey).reduce((sum, invoice) => sum + getDocumentTotal(invoice), 0)
  const approvedEstimateValue = estimates.filter((estimate) => estimate.status === 'approved').reduce((sum, estimate) => sum + getDocumentTotal(estimate), 0)
  const taxReserve = monthlyRevenue * (settings.defaultTaxReservePercent / 100)

  const openEstimates = estimates.filter(
    (estimate) =>
      estimate.status === 'draft' || estimate.status === 'sent',
  )
  const sentEstimates = estimates.filter(
    (estimate) => estimate.status === 'sent',
  )

  const recentDocuments = [
    ...estimates.map((estimate) => ({
      id: estimate.id,
      kind: 'Estimate' as const,
      number: estimate.estimateNumber,
      customerId: estimate.customerId,
      title: estimate.jobName || 'Untitled estimate',
      status: estimate.status,
      total: getDocumentTotal(estimate),
      updatedAt: estimate.updatedAt,
    })),
    ...invoices.map((invoice) => ({
      id: invoice.id,
      kind: 'Invoice' as const,
      number: invoice.invoiceNumber,
      customerId: invoice.customerId,
      title: invoice.jobName || 'Untitled invoice',
      status: invoice.status,
      total: getDocumentTotal(invoice),
      updatedAt: invoice.updatedAt,
    })),
  ]
    .sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime(),
    )
    .slice(0, 4)

  const dashboardStats = [
    {
      label: 'Outstanding',
      value: formatCurrency(outstandingTotal),
      description: 'Open invoice balance',
      icon: CircleDollarSign,
    },
    {
      label: 'Paid total',
      value: formatCurrency(paidTotal),
      description: 'Paid invoices recorded',
      icon: ReceiptText,
    },
    {
      label: 'Open estimates',
      value: String(openEstimates.length),
      description: 'Draft or sent',
      icon: FileText,
    },
    {
      label: 'Customers',
      value: String(customers.length),
      description: 'Saved customer profiles',
      icon: UsersRound,
    },
    {
      label: 'This month',
      value: formatCurrency(monthlyRevenue),
      description: 'Paid revenue',
      icon: CheckCircle2,
    },
    {
      label: 'Approved work',
      value: formatCurrency(approvedEstimateValue),
      description: 'Approved estimate value',
      icon: FileText,
    },
    {
      label: 'Tax reserve',
      value: formatCurrency(taxReserve),
      description: `${settings.defaultTaxReservePercent}% of monthly revenue`,
      icon: CircleDollarSign,
    },
  ]

  return (
    <>
      <section className="dashboard-header">
        <div>
          <p className="eyebrow">OWNER OVERVIEW</p>
          <h1>{getGreeting()}</h1>
          <p className="dashboard-subtitle">
            Here&apos;s the latest activity in your business.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            className="button-light"
            onClick={onOpenDocuments}
            type="button"
          >
            View estimates
          </button>
          <button
            className="button-dark"
            onClick={onOpenCustomers}
            type="button"
          >
            Customers
          </button>
        </div>
      </section>

      <section aria-label="Business summary" className="dashboard-stats">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon

          return (
            <article className="stat-card" key={stat.label}>
              <div className="stat-card-top">
                <span>{stat.label}</span>
                <span className="stat-symbol">
                  <Icon aria-hidden="true" size={17} />
                </span>
              </div>
              <strong>{stat.value}</strong>
              <p>{stat.description}</p>
            </article>
          )
        })}
      </section>

      <section className="dashboard-content-grid">
        <article className="dashboard-panel recent-work-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT WORK</p>
              <h2>Estimates &amp; invoices</h2>
            </div>
            <button
              className="text-link"
              onClick={onOpenDocuments}
              type="button"
            >
              View all <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>

          {recentDocuments.length > 0 ? (
            <div className="document-list">
              {recentDocuments.map((document) => (
                <button
                  className="document-row"
                  key={`${document.kind}-${document.id}`}
                  onClick={onOpenDocuments}
                  type="button"
                >
                  <span className="document-symbol">
                    {document.kind === 'Estimate' ? (
                      <FileText aria-hidden="true" size={17} />
                    ) : (
                      <ReceiptText aria-hidden="true" size={17} />
                    )}
                  </span>
                  <span className="document-information">
                    <strong>{document.title}</strong>
                    <span>
                      {customerNames.get(document.customerId) ??
                        'Customer not found'}{' '}
                      · {document.number}
                    </span>
                  </span>
                  <span className="draft-badge">{document.status}</span>
                  <strong className="document-price">
                    {formatCurrency(document.total)}
                  </strong>
                  <ArrowRight
                    aria-hidden="true"
                    className="document-arrow"
                    size={17}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty-state">
              <FileText aria-hidden="true" size={24} />
              <div>
                <strong>No documents yet</strong>
                <p>Your first estimate will appear here automatically.</p>
              </div>
            </div>
          )}
        </article>

        <article className="dashboard-panel attention-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FOLLOW UP</p>
              <h2>Needs attention</h2>
            </div>
            <span className="attention-count">{sentEstimates.length}</span>
          </div>

          {sentEstimates.length > 0 ? (
            sentEstimates.slice(0, 3).map((estimate) => (
              <button
                className="attention-row"
                key={estimate.id}
                onClick={onOpenDocuments}
                type="button"
              >
                <span className="attention-dot" />
                <span>
                  <strong>{estimate.jobName || 'Untitled estimate'}</strong>
                  <span>
                    {customerNames.get(estimate.customerId) ??
                      'Customer not found'}{' '}
                    · {estimate.estimateNumber}
                  </span>
                </span>
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ))
          ) : (
            <div className="dashboard-empty-state compact">
              <CheckCircle2 aria-hidden="true" size={24} />
              <div>
                <strong>You&apos;re caught up</strong>
                <p>Sent estimates that need follow-up will appear here.</p>
              </div>
            </div>
          )}
        </article>
      </section>
    </>
  )
}

export default Dashboard
