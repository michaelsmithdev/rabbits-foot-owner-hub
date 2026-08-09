import type { Lead } from '../types/Lead.ts'

export type PendingLeadDeletion = {
  id: string
  photoPaths: string[]
}

export function mergeRemoteLeadSnapshot(
  remoteLeads: Lead[],
  queuedLeads: Lead[],
  queuedDeletions: PendingLeadDeletion[],
) {
  const deletedIds = new Set(queuedDeletions.map((item) => item.id))
  const leadsById = new Map(
    remoteLeads
      .filter((lead) => !deletedIds.has(lead.id))
      .map((lead) => [lead.id, lead]),
  )

  // Local changes that have not reached the server always win until their
  // upload succeeds. Everything else follows the server snapshot so a lead
  // deleted on another signed-in device disappears here as well.
  queuedLeads.forEach((lead) => {
    if (!deletedIds.has(lead.id)) leadsById.set(lead.id, lead)
  })

  return Array.from(leadsById.values()).sort(
    (firstLead, secondLead) =>
      new Date(secondLead.submittedAt).getTime() -
      new Date(firstLead.submittedAt).getTime(),
  )
}
