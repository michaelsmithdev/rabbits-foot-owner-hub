import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  ClipboardPlus,
  ExternalLink,
  Flag,
  Image as ImageIcon,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { loadCustomers, saveCustomers } from '../../features/customers/data/customerStore'
import type { Customer } from '../../features/customers/types/Customer'
import {
  createEstimateNumber,
  loadEstimates,
  saveEstimates,
} from '../../features/estimates/data/estimateStore'
import type { Estimate } from '../../features/estimates/types/Estimate'
import { deleteLead, loadLeads, saveLeads } from '../../features/leads/data/leadStore'
import type {
  Lead,
  LeadActivity,
  LeadStatus,
} from '../../features/leads/types/Lead'
import { cloudClient } from '../../features/cloud/cloudClient'
import { DATA_REFRESHED_EVENT } from '../../features/cloud/syncQueue'
import { loadBusinessSettings } from '../../features/settings/data/businessSettingsStore'
import { useSaas } from '../../features/saas/saasContext'
import './Inbox.css'

type InboxFilter = 'inbox' | 'unread' | 'flagged' | 'archived' | 'all'

type InboxProps = {
  onOpenDocuments: () => void
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function splitCustomerName(name: string) {
  const nameParts = name.trim().split(/\s+/)

  return {
    firstName: nameParts[0] || 'Website',
    lastName: nameParts.slice(1).join(' ') || 'Lead',
  }
}

function createActivity(type: LeadActivity['type'], message: string): LeadActivity {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message,
    createdAt: new Date().toISOString(),
  }
}

function getLeadStatusLabel(status: LeadStatus) {
  return {
    unread: 'New lead',
    read: 'Reviewed',
    flagged: 'Flagged',
    archived: 'Archived',
  }[status]
}

function LeadPhotos({ lead }: { lead: Lead }) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  useEffect(() => {
    let isMounted = true
    const client = cloudClient

    if (!client || lead.photoPaths.length === 0) return

    void Promise.all(
      lead.photoPaths.map(async (path) => {
        const { data, error } = await client.storage
          .from('lead-attachments')
          .createSignedUrl(path, 60 * 60)

        if (error) {
          console.error('Lead photo could not be opened.', error)
          return null
        }

        return data.signedUrl
      }),
    ).then((urls) => {
      if (isMounted) {
        setPhotoUrls(urls.filter((url): url is string => Boolean(url)))
      }
    })

    return () => {
      isMounted = false
    }
  }, [lead.id, lead.photoPaths])

  if (lead.photoPaths.length === 0) return null

  return (
    <section className="lead-detail-section">
      <h3>
        <ImageIcon aria-hidden="true" size={18} />
        Project photos ({lead.photoPaths.length})
      </h3>
      {photoUrls.length === 0 ? (
        <p className="lead-photo-loading">Loading secure photos…</p>
      ) : (
        <div className="lead-photo-grid">
          {photoUrls.map((photoUrl, index) => (
            <a href={photoUrl} key={photoUrl} rel="noreferrer" target="_blank">
              <img alt={`Project attachment ${index + 1}`} src={photoUrl} />
              <span><ExternalLink aria-hidden="true" size={14} /> Open</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function Inbox({ onOpenDocuments }: InboxProps) {
  const { role } = useSaas()
  const canDeleteRecords = role === 'owner' || role === 'admin'
  const [leads, setLeads] = useState<Lead[]>(() => loadLeads())
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    saveLeads(leads)
  }, [leads])

  useEffect(() => {
    const refreshLeads = () => {
      setLeads(loadLeads())
    }

    window.addEventListener(DATA_REFRESHED_EVENT, refreshLeads)

    return () => {
      window.removeEventListener(DATA_REFRESHED_EVENT, refreshLeads)
    }
  }, [])

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null
  const unreadCount = leads.filter((lead) => lead.status === 'unread').length
  const flaggedCount = leads.filter((lead) => lead.status === 'flagged').length

  const visibleLeads = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return leads.filter((lead) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'inbox' && lead.status !== 'archived') ||
        lead.status === filter

      if (!matchesFilter) return false
      if (!normalizedQuery) return true

      return [
        lead.name,
        lead.phone,
        lead.email,
        lead.service,
        lead.address,
        lead.description,
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [filter, leads, searchQuery])

  function updateLead(
    leadId: string,
    changes: Partial<Lead>,
    activity?: LeadActivity,
  ) {
    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              ...changes,
              activity: activity ? [activity, ...lead.activity] : lead.activity,
              updatedAt: new Date().toISOString(),
            }
          : lead,
      ),
    )
  }

  function openLead(lead: Lead) {
    setSelectedLeadId(lead.id)
    setNotice('')

    if (lead.status === 'unread') {
      updateLead(
        lead.id,
        { status: 'read' },
        createActivity('status', 'Lead reviewed in the Owner Hub.'),
      )
    }
  }

  function toggleFlag(lead: Lead) {
    const nextStatus: LeadStatus = lead.status === 'flagged' ? 'read' : 'flagged'
    updateLead(
      lead.id,
      { status: nextStatus },
      createActivity(
        'status',
        nextStatus === 'flagged' ? 'Lead flagged for follow-up.' : 'Follow-up flag removed.',
      ),
    )
  }

  function toggleArchive(lead: Lead) {
    const nextStatus: LeadStatus = lead.status === 'archived' ? 'read' : 'archived'
    updateLead(
      lead.id,
      { status: nextStatus },
      createActivity(
        'status',
        nextStatus === 'archived' ? 'Lead archived.' : 'Lead restored to the Inbox.',
      ),
    )

    if (nextStatus === 'archived' && filter !== 'archived' && filter !== 'all') {
      setSelectedLeadId(null)
    }
  }

  function removeLead(lead: Lead) {
    if (!canDeleteRecords) return
    const confirmed = window.confirm(
      `Permanently delete the lead from ${lead.name}? This cannot be undone.`,
    )
    if (!confirmed) return

    deleteLead(lead)
    setLeads(loadLeads())
    setSelectedLeadId(null)
    setNotice(`${lead.name}'s lead was deleted.`)
  }

  function findOrCreateCustomer(lead: Lead) {
    const customers = loadCustomers()
    const normalizedLeadEmail = lead.email.trim().toLowerCase()
    const normalizedLeadPhone = normalizePhone(lead.phone)
    const existingCustomer = customers.find(
      (customer) =>
        (normalizedLeadEmail &&
          customer.email.trim().toLowerCase() === normalizedLeadEmail) ||
        (normalizedLeadPhone && normalizePhone(customer.phone) === normalizedLeadPhone),
    )

    if (existingCustomer) return existingCustomer

    const { firstName, lastName } = splitCustomerName(lead.name)
    const newCustomer: Customer = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      firstName,
      lastName,
      phone: lead.phone,
      email: lead.email,
      streetAddress: lead.address,
      city: '',
      state: 'IN',
      zipCode: '',
      notes: `Website lead: ${lead.service}\n\n${lead.description}`,
      createdAt: new Date().toISOString(),
    }

    saveCustomers([newCustomer, ...customers])
    return newCustomer
  }

  function convertToCustomer(lead: Lead) {
    const customer = findOrCreateCustomer(lead)

    updateLead(
      lead.id,
      { convertedCustomerId: customer.id, status: 'read' },
      createActivity(
        'converted',
        `Converted to customer: ${customer.firstName} ${customer.lastName}.`,
      ),
    )
    setNotice(`${customer.firstName} ${customer.lastName} is ready in Customers.`)
  }

  function createEstimateFromLead(lead: Lead) {
    const customer = findOrCreateCustomer(lead)
    const estimates = loadEstimates()
    const businessSettings = loadBusinessSettings()
    const now = new Date()
    const expirationDate = new Date(now)
    expirationDate.setDate(
      expirationDate.getDate() + businessSettings.estimateValidDays,
    )

    const estimate: Estimate = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      estimateNumber: createEstimateNumber(
        estimates,
        businessSettings.estimatePrefix,
      ),
      customerId: customer.id,
      jobName: lead.service,
      serviceAddress: lead.address,
      description: lead.description,
      issueDate: now.toISOString().slice(0, 10),
      expirationDate: expirationDate.toISOString().slice(0, 10),
      lineItems: [
        {
          id: `${Date.now()}-service`,
          description: lead.service,
          quantity: 1,
          unitPrice: 0,
        },
      ],
      taxRate: businessSettings.defaultTaxRate,
      discount: 0,
      notes: [
        businessSettings.estimateTerms,
        `Created from website lead ${lead.id}. Add pricing before sending.`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      status: 'draft',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    saveEstimates([estimate, ...estimates])
    updateLead(
      lead.id,
      {
        convertedCustomerId: customer.id,
        estimateId: estimate.id,
        status: 'read',
      },
      createActivity('estimate', `Created estimate ${estimate.estimateNumber}.`),
    )
    setNotice(`${estimate.estimateNumber} created. Add pricing before sending.`)
    window.setTimeout(onOpenDocuments, 450)
  }

  return (
    <section className="inbox-page">
      <header className="inbox-page-header">
        <div>
          <p className="eyebrow">WEBSITE LEADS</p>
          <h1>Inbox</h1>
          <p>
            {unreadCount === 0
              ? 'You are caught up.'
              : `${unreadCount} new ${unreadCount === 1 ? 'lead' : 'leads'} waiting.`}
          </p>
        </div>
        <div className="inbox-summary">
          <strong>{leads.length}</strong><span>Total leads</span>
          <strong>{flaggedCount}</strong><span>Flagged</span>
        </div>
      </header>

      {notice && <div className="inbox-notice" role="status"><Check size={18} />{notice}</div>}

      <div className="inbox-toolbar">
        <label className="inbox-search">
          <Search aria-hidden="true" size={19} />
          <input
            aria-label="Search website leads"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search name, phone, service, address…"
            type="search"
            value={searchQuery}
          />
        </label>
        <div className="inbox-filters" aria-label="Lead filters" role="group">
          {(
            [
              ['inbox', 'Inbox'],
              ['unread', 'New'],
              ['flagged', 'Flagged'],
              ['archived', 'Archived'],
              ['all', 'All'],
            ] as Array<[InboxFilter, string]>
          ).map(([filterValue, label]) => (
            <button
              className={filter === filterValue ? 'active' : ''}
              key={filterValue}
              onClick={() => setFilter(filterValue)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleLeads.length === 0 ? (
        <div className="inbox-empty">
          <MessageSquareText aria-hidden="true" size={34} />
          <h2>{leads.length === 0 ? 'No website leads yet' : 'No matching leads'}</h2>
          <p>
            {leads.length === 0
              ? 'New estimate requests will appear here automatically.'
              : 'Try another search or filter.'}
          </p>
        </div>
      ) : (
        <div className="lead-list">
          {visibleLeads.map((lead) => (
            <article className={`lead-card lead-${lead.status}`} key={lead.id}>
              <button className="lead-card-main" onClick={() => openLead(lead)} type="button">
                <span className="lead-card-topline">
                  <span className={`lead-status lead-status-${lead.status}`}>
                    {getLeadStatusLabel(lead.status)}
                  </span>
                  <time dateTime={lead.submittedAt}>
                    {new Date(lead.submittedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </span>
                <strong>{lead.name}</strong>
                <span className="lead-service">{lead.service}</span>
                <span className="lead-preview">{lead.description}</span>
                <span className="lead-contact-line">{lead.phone} · {lead.email}</span>
                <ChevronRight aria-hidden="true" className="lead-card-arrow" size={21} />
              </button>
            </article>
          ))}
        </div>
      )}

      {selectedLead && (
        <div className="lead-detail-backdrop" role="presentation">
          <aside aria-label={`Lead from ${selectedLead.name}`} className="lead-detail-panel">
            <header className="lead-detail-header">
              <div>
                <span className={`lead-status lead-status-${selectedLead.status}`}>
                  {getLeadStatusLabel(selectedLead.status)}
                </span>
                <h2>{selectedLead.name}</h2>
                <p>{selectedLead.service}</p>
              </div>
              <button aria-label="Close lead" onClick={() => setSelectedLeadId(null)} type="button">
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            <div className="lead-quick-actions">
              <a href={`tel:${selectedLead.phone}`}><Phone size={18} />Call</a>
              <a href={`sms:${selectedLead.phone}`}><MessageSquareText size={18} />Text</a>
              <a href={`mailto:${selectedLead.email}?subject=${encodeURIComponent(`Your ${selectedLead.service} request`)}`}><Mail size={18} />Reply</a>
              {selectedLead.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedLead.address)}`} rel="noreferrer" target="_blank"><MapPin size={18} />Navigate</a>
              )}
            </div>

            <div className="lead-detail-body">
              <section className="lead-detail-section">
                <h3>Project request</h3>
                <p className="lead-description">{selectedLead.description}</p>
                {selectedLead.address && <p className="lead-address"><MapPin size={17} />{selectedLead.address}</p>}
              </section>

              <LeadPhotos lead={selectedLead} />

              <section className="lead-detail-section">
                <h3>Customer details</h3>
                <dl className="lead-contact-details">
                  <div><dt>Phone</dt><dd>{selectedLead.phone}</dd></div>
                  <div><dt>Email</dt><dd>{selectedLead.email}</dd></div>
                  <div><dt>Received</dt><dd>{new Date(selectedLead.submittedAt).toLocaleString()}</dd></div>
                  <div><dt>Source</dt><dd>{selectedLead.source}</dd></div>
                </dl>
              </section>

              <section className="lead-detail-section">
                <h3>Activity</h3>
                <div className="lead-activity">
                  {selectedLead.activity.map((activity) => (
                    <div key={activity.id}>
                      <span />
                      <p><strong>{activity.message}</strong><time>{new Date(activity.createdAt).toLocaleString()}</time></p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <footer className="lead-detail-footer">
              <div className="lead-management-actions">
                <button onClick={() => toggleFlag(selectedLead)} type="button">
                  <Flag size={17} />{selectedLead.status === 'flagged' ? 'Unflag' : 'Flag'}
                </button>
                <button onClick={() => toggleArchive(selectedLead)} type="button">
                  {selectedLead.status === 'archived' ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                  {selectedLead.status === 'archived' ? 'Restore' : 'Archive'}
                </button>
                {canDeleteRecords && (
                  <button className="lead-delete-button" onClick={() => removeLead(selectedLead)} type="button">
                    <Trash2 size={17} />Delete lead
                  </button>
                )}
              </div>
              <div className="lead-primary-actions">
                <button
                  className="lead-customer-button"
                  disabled={Boolean(selectedLead.convertedCustomerId)}
                  onClick={() => convertToCustomer(selectedLead)}
                  type="button"
                >
                  <UserPlus size={18} />
                  {selectedLead.convertedCustomerId ? 'Customer created' : 'Create customer'}
                </button>
                <button className="lead-estimate-button" onClick={() => createEstimateFromLead(selectedLead)} type="button">
                  <ClipboardPlus size={18} />
                  {selectedLead.estimateId ? 'Create another estimate' : 'Create estimate'}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </section>
  )
}

export default Inbox
