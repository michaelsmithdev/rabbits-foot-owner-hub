import type { SupabaseClient } from '@supabase/supabase-js'

import {
  applyRemoteRecords,
  clearSyncQueue,
  loadSyncQueue,
  type CloudRecordType,
} from './syncQueue'
import {
  applyRemoteLeads,
  clearQueuedLeads,
  loadQueuedLeads,
} from '../leads/data/leadStore'
import type { Lead, LeadActivity, LeadStatus } from '../leads/types/Lead'
import { synchronizePendingPhotos } from '../photos/data/photoStore'

type DatabaseLead = {
  id: string
  organization_id: string
  source: string
  status: LeadStatus
  name: string
  phone: string
  email: string
  service: string
  address: string
  description: string
  photo_paths: string[]
  activity: LeadActivity[]
  converted_customer_id: string | null
  estimate_id: string | null
  submitted_at: string
  updated_at: string
}

function fromDatabaseLead(lead: DatabaseLead): Lead {
  return {
    id: lead.id,
    organizationId: lead.organization_id,
    source: lead.source,
    status: lead.status,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    service: lead.service,
    address: lead.address,
    description: lead.description,
    photoPaths: lead.photo_paths ?? [],
    activity: lead.activity ?? [],
    convertedCustomerId: lead.converted_customer_id,
    estimateId: lead.estimate_id,
    submittedAt: lead.submitted_at,
    updatedAt: lead.updated_at,
  }
}

function toDatabaseLead(lead: Lead) {
  return {
    id: lead.id,
    organization_id: lead.organizationId,
    source: lead.source,
    status: lead.status,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    service: lead.service,
    address: lead.address,
    description: lead.description,
    photo_paths: lead.photoPaths,
    activity: lead.activity,
    converted_customer_id: lead.convertedCustomerId,
    estimate_id: lead.estimateId,
    submitted_at: lead.submittedAt,
    updated_at: lead.updatedAt,
  }
}

export async function getOrganizationId(client: SupabaseClient) {
  const { data, error } = await client
    .from('organization_members')
    .select('organization_id')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data?.organization_id) {
    throw new Error('No business workspace is connected to this account.')
  }

  return data.organization_id as string
}

export async function synchronizeBusinessRecords(
  client: SupabaseClient,
  organizationId: string,
) {
  await synchronizePendingPhotos(client, organizationId)

  const queuedChanges = loadSyncQueue()

  if (queuedChanges.length > 0) {
    const originalRecordTypes: CloudRecordType[] = [
      'customer',
      'estimate',
      'invoice',
      'settings',
      'photo',
    ]
    const originalChanges = queuedChanges.filter((change) =>
      originalRecordTypes.includes(change.recordType),
    )
    const operatingSystemChanges = queuedChanges.filter((change) =>
      !originalRecordTypes.includes(change.recordType),
    )

    const uploadChanges = async (changes: typeof queuedChanges) => {
      if (changes.length === 0) return null

      const { error } = await client
        .from('business_records')
        .upsert(
          changes.map((change) => ({
            organization_id: organizationId,
            record_type: change.recordType,
            record_id: change.recordId,
            payload: change.payload,
            is_deleted: change.isDeleted,
            client_updated_at: change.clientUpdatedAt,
          })),
          {
            onConflict: 'organization_id,record_type,record_id',
          },
        )

      return error
    }

    const originalUploadError = await uploadChanges(originalChanges)
    if (originalUploadError) throw originalUploadError
    clearSyncQueue(originalChanges)

    const operatingSystemUploadError = await uploadChanges(
      operatingSystemChanges,
    )

    if (operatingSystemUploadError) {
      const isPendingRecordTypeMigration =
        operatingSystemUploadError.code === '23514' ||
        /record_type|check constraint/i.test(
          operatingSystemUploadError.message,
        )

      if (!isPendingRecordTypeMigration) throw operatingSystemUploadError

      console.warn(
        'New Owner Hub records remain safely queued on this device until the database migration is applied.',
      )
    } else {
      clearSyncQueue(operatingSystemChanges)
    }
  }

  const { data, error: downloadError } = await client
    .from('business_records')
    .select(
      'record_type,record_id,payload,is_deleted,client_updated_at',
    )
    .eq('organization_id', organizationId)

  if (downloadError) throw downloadError

  applyRemoteRecords(
    (data ?? []) as Array<{
      record_type: CloudRecordType
      record_id: string
      payload: Record<string, unknown> & { id: string }
      is_deleted: boolean
      client_updated_at: string
    }>,
  )

  const queuedLeads = loadQueuedLeads()

  if (queuedLeads.length > 0) {
    const { error: leadUploadError } = await client
      .from('leads')
      .upsert(queuedLeads.map(toDatabaseLead), { onConflict: 'id' })

    if (leadUploadError) throw leadUploadError
    clearQueuedLeads(queuedLeads)
  }

  const { data: leadData, error: leadDownloadError } = await client
    .from('leads')
    .select('*')
    .eq('organization_id', organizationId)
    .order('submitted_at', { ascending: false })

  if (leadDownloadError) throw leadDownloadError

  applyRemoteLeads(
    ((leadData ?? []) as DatabaseLead[]).map(fromDatabaseLead),
  )
}
