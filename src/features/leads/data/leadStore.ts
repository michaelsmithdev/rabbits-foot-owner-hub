import type { Lead, LeadStatus } from '../types/Lead'
import {
  DATA_REFRESHED_EVENT,
  SYNC_REQUESTED_EVENT,
} from '../../cloud/syncQueue'
import { mergeRemoteLeadSnapshot } from './leadMerge'

const LEADS_STORAGE_KEY = 'rabbits-foot-leads'
const LEAD_QUEUE_STORAGE_KEY = 'rabbits-foot-lead-sync-queue'
const LEAD_METADATA_STORAGE_KEY = 'rabbits-foot-lead-sync-metadata'
const LEAD_DELETE_QUEUE_KEY = 'rabbits-foot-lead-delete-queue'

export type LeadDeletion = {
  id: string
  photoPaths: string[]
}

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
  let hasQueuedChanges = false

  leads.forEach((lead) => {
    const fingerprint = JSON.stringify(lead)

    if (metadata[lead.id]?.fingerprint === fingerprint) return

    queuedById.set(lead.id, lead)
    hasQueuedChanges = true
    metadata[lead.id] = {
      fingerprint,
      updatedAt: lead.updatedAt,
    }
  })

  if (!hasQueuedChanges) return

  localStorage.setItem(
    LEAD_QUEUE_STORAGE_KEY,
    JSON.stringify(Array.from(queuedById.values())),
  )
  localStorage.setItem(LEAD_METADATA_STORAGE_KEY, JSON.stringify(metadata))
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
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

export function deleteLead(lead: Lead) {
  const remainingLeads = loadLeads().filter((item) => item.id !== lead.id)
  const remainingQueuedLeads = loadQueuedLeads().filter((item) => item.id !== lead.id)
  const metadata = readJson<LeadMetadata>(LEAD_METADATA_STORAGE_KEY, {})
  const deletions = readJson<LeadDeletion[]>(LEAD_DELETE_QUEUE_KEY, [])
    .filter((item) => item.id !== lead.id)

  delete metadata[lead.id]
  deletions.push({ id: lead.id, photoPaths: lead.photoPaths })

  localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(remainingLeads))
  localStorage.setItem(LEAD_QUEUE_STORAGE_KEY, JSON.stringify(remainingQueuedLeads))
  localStorage.setItem(LEAD_METADATA_STORAGE_KEY, JSON.stringify(metadata))
  localStorage.setItem(LEAD_DELETE_QUEUE_KEY, JSON.stringify(deletions))
  window.dispatchEvent(new Event(SYNC_REQUESTED_EVENT))
}

export function loadQueuedLeadDeletions(): LeadDeletion[] {
  return readJson<LeadDeletion[]>(LEAD_DELETE_QUEUE_KEY, [])
}

export function clearQueuedLeadDeletions(deletions: LeadDeletion[]) {
  const completedIds = new Set(deletions.map((item) => item.id))
  const remaining = loadQueuedLeadDeletions().filter(
    (item) => !completedIds.has(item.id),
  )

  localStorage.setItem(LEAD_DELETE_QUEUE_KEY, JSON.stringify(remaining))
}

export function applyRemoteLeads(leads: Lead[]) {
  const queuedLeads = loadQueuedLeads()
  const nextLeads = mergeRemoteLeadSnapshot(
    leads,
    queuedLeads,
    loadQueuedLeadDeletions(),
  )
  const queuedIds = new Set(queuedLeads.map((lead) => lead.id))
  const metadata: LeadMetadata = {}

  nextLeads.forEach((lead) => {
    if (queuedIds.has(lead.id)) return
    metadata[lead.id] = {
      fingerprint: JSON.stringify(lead),
      updatedAt: lead.updatedAt,
    }
  })
  const serializedLeads = JSON.stringify(nextLeads)
  const hasLeadChanges =
    localStorage.getItem(LEADS_STORAGE_KEY) !== serializedLeads

  localStorage.setItem(LEADS_STORAGE_KEY, serializedLeads)
  localStorage.setItem(LEAD_METADATA_STORAGE_KEY, JSON.stringify(metadata))

  if (hasLeadChanges) {
    window.dispatchEvent(new Event(DATA_REFRESHED_EVENT))
  }
}
