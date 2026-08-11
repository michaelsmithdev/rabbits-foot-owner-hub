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
import { loadAppointments } from '../../features/schedule/data/appointmentStore'
import {
  loadCommunications,
  saveCommunications,
} from '../../features/communications/data/communicationStore'
import { buildActionCenterItems } from '../../features/communications/actionCenter'

type DashboardProps = {
  onOpenCustomer: (customerId: string) => void
  onOpenCustomers: () => void
  onOpenDocument: (
    documentKind: 'estimate' | 'invoice',
    documentId: string,
  ) => void
  onOpenDocuments: () => void
  onOpenSchedule: () => void
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
  onOpenCustomer,
  onOpenCustomers,
  onOpenDocument,
  onOpenDocuments,
  onOpenSchedule,
}: DashboardProps) {
  const customers = loadCustomers()
  const estimates = loadEstimates()
  const invoices = loadInvoices()
  const settings = loadBusinessSettings()
  const appointments = loadAppointments()
  const communications = loadCommunications()
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
  const now = new Date()
  const todayKey = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  const todayAppointments = appointments.filter(
    (appointment) => {
      const start = new Date(appointment.startAt)
      const localStartKey = new Date(start.getTime() - start.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
      return localStartKey === todayKey && appointment.status !== 'canceled'
    },
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

  const actionItems = buildActionCenterItems({
    customers,
    estimates,
    invoices,
    appointments,
    communications,
  })

  function openAction(item: (typeof actionItems)[number]) {
    if (item.communicationId) {
      saveCommunications(
        communications.map((communication) =>
          communication.id === item.communicationId
            ? { ...communication, status: 'handled' }
            : communication,
        ),
      )
    }

    if (item.kind === 'overdue_invoice' && item.documentId) {
      onOpenDocument('invoice', item.documentId)
      return
    }

    if (item.kind === 'estimate_follow_up' && item.documentId) {
      onOpenDocument('estimate', item.documentId)
      return
    }

    if (item.kind === 'appointment_reminder') {
      onOpenSchedule()
      return
    }

    onOpenCustomer(item.customerId)
  }

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
      <section className="dashboard-header" data-tour="dashboard">
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
        <article className="dashboard-panel attention-panel">
          <div className="panel-heading"><div><p className="eyebrow">TODAY</p><h2>Field schedule</h2></div><span className="attention-count">{todayAppointments.length}</span></div>
          {todayAppointments.length ? todayAppointments.slice(0, 4).map((appointment) => (
            <button className="attention-row" key={appointment.id} onClick={onOpenSchedule} type="button">
              <span className="attention-dot" /><span><strong>{new Date(appointment.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {appointment.title}</strong><span>{appointment.serviceAddress}</span></span><ArrowRight aria-hidden="true" size={16} />
            </button>
          )) : <div className="dashboard-empty-state compact"><CheckCircle2 aria-hidden="true" size={24}/><div><strong>No appointments today</strong><p>Open the schedule to book work.</p></div></div>}
        </article>
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
                  onClick={() =>
                    onOpenDocument(
                      document.kind === 'Estimate' ? 'estimate' : 'invoice',
                      document.id,
                    )
                  }
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
              <p className="eyebrow">ACTION CENTER</p>
              <h2>Your next best actions</h2>
            </div>
            <span className="attention-count">{actionItems.length}</span>
          </div>

          {actionItems.length > 0 ? (
            actionItems.slice(0, 5).map((item) => (
              <button
                className="attention-row"
                key={item.id}
                onClick={() => openAction(item)}
                type="button"
              >
                <span className="attention-dot" />
                <span>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
                <span className="action-center-label">{item.actionLabel}</span>
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ))
          ) : (
            <div className="dashboard-empty-state compact">
              <CheckCircle2 aria-hidden="true" size={24} />
              <div>
                <strong>You&apos;re caught up</strong>
                <p>Customer requests and time-sensitive follow-ups will appear here.</p>
              </div>
            </div>
          )}
        </article>
      </section>
    </>
  )
}

export default Dashboard
