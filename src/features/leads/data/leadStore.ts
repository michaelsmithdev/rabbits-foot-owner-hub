import type { Lead, LeadStatus } from '../types/Lead'

const LEADS_STORAGE_KEY = 'rabbits-foot-leads'
const LEAD_QUEUE_STORAGE_KEY = 'rabbits-foot-lead-sync-queue'
const LEAD_METADATA_STORAGE_KEY = 'rabbits-foot-lead-sync-metadata'

type LeadMetadata = Record<string, { fingerprint: string; updatedAt: string }>

const leadStatuses: LeadStatus[] = ['unread', 'read', 'flagged', 'archived']

function readJson<T>(key: string, fallback: T): T {
  try {
    const storedValue = localStorage.getItem(key)
    return storedValue ? (JSON.parse(storedValue) as T) : fallback
  } catch {
    return fallback
  }
}
function isLead(value: unknown): value is Lead {
  if (!value || typeof value !== 'object') return false

  const lead = value as Partial<Lead>

  return (
    typeof lead.id === 'string' &&
    typeof lead.organizationId === 'string' &&
    typeof lead.source === 'string' &&
    typeof lead.status === 'string' &&
    leadStatuses.includes(lead.status as LeadStatus) &&
    typeof lead.name === 'string' &&
    typeof lead.phone === 'string' &&
    typeof lead.email === 'string' &&
    typeof lead.service === 'string' &&
    typeof lead.address === 'string' &&
    typeof lead.description === 'string' &&
    Array.isArray(lead.photoPaths) &&
    Array.isArray(lead.activity) &&
    (lead.convertedCustomerId === null ||
      typeof lead.convertedCustomerId === 'string') &&
    (lead.estimateId === null || typeof lead.estimateId === 'string') &&
    typeof lead.submittedAt === 'string' &&
    typeof lead.updatedAt === 'string'
  )
}

export function loadLeads(): Lead[] {
  return readJson<unknown[]>(LEADS_STORAGE_KEY, [])
    .filter(isLead)
    .sort(
      (firstLead, secondLead) =>
        new Date(secondLead.submittedAt).getTime() -
        new Date(firstLead.submittedAt).getTime(),
    )
}

export function saveLeads(leads: Lead[]) {
  localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads))

  const metadata = readJson<LeadMetadata>(LEAD_METADATA_STORAGE_KEY, {})
  const queuedById = new Map(
    readJson<Lead[]>(LEAD_QUEUE_STORAGE_KEY, []).map((lead) => [lead.id, lead]),
  )

  leads.forEach((lead) => {
    const fingerprint = JSON.stringify(lead)

    if (metadata[lead.id]?.fingerprint === fingerprint) return

    queuedById.set(lead.id, lead)
    metadata[lead.id] = {
      fingerprint,
      updatedAt: lead.updatedAt,
    }
  })

  localStorage.setItem(
    LEAD_QUEUE_STORAGE_KEY,
    JSON.stringify(Array.from(queuedById.values())),
  )
  localStorage.setItem(LEAD_METADATA_STORAGE_KEY, JSON.stringify(metadata))
  window.dispatchEvent(new Event('ownerhub:sync-requested'))
}

export function loadQueuedLeads() {
  return readJson<Lead[]>(LEAD_QUEUE_STORAGE_KEY, [])
}

export function clearQueuedLeads(leads: Lead[]) {
  const completedIds = new Set(leads.map((lead) => lead.id))
  const remainingLeads = loadQueuedLeads().filter(
    (lead) => !completedIds.has(lead.id),
  )

  localStorage.setItem(LEAD_QUEUE_STORAGE_KEY, JSON.stringify(remainingLeads))
}

export function applyRemoteLeads(leads: Lead[]) {
  const localLeads = loadLeads()
  const queuedIds = new Set(loadQueuedLeads().map((lead) => lead.id))
  const leadsById = new Map(localLeads.map((lead) => [lead.id, lead]))
  const metadata = readJson<LeadMetadata>(LEAD_METADATA_STORAGE_KEY, {})

  leads.forEach((lead) => {
    if (queuedIds.has(lead.id)) return

    leadsById.set(lead.id, lead)
    metadata[lead.id] = {
      fingerprint: JSON.stringify(lead),
      updatedAt: lead.updatedAt,
    }
  })

  localStorage.setItem(
    LEADS_STORAGE_KEY,
    JSON.stringify(Array.from(leadsById.values())),
  )
  localStorage.setItem(LEAD_METADATA_STORAGE_KEY, JSON.stringify(metadata))
}
