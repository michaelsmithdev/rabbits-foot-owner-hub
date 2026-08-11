import type { Customer } from '../customers/types/Customer'
import type { Estimate } from '../estimates/types/Estimate'
import type { Invoice } from '../invoices/types/Invoice'
import { cloudClient } from '../cloud/cloudClient'
import { loadCommunications, saveCommunications } from './data/communicationStore'
import { openSmsComposer } from './customerContact'
import { isSafeCustomerFacingUrl } from './publicAppUrl'

type CustomerDocument = Estimate | Invoice
type DocumentKind = 'estimate' | 'invoice'

const apiOrigin =
  import.meta.env.VITE_OWNER_HUB_API_URL?.trim().replace(/\/$/, '') ?? ''

function documentNumber(kind: DocumentKind, document: CustomerDocument) {
  return kind === 'estimate'
    ? (document as Estimate).estimateNumber
    : (document as Invoice).invoiceNumber
}

export async function createCustomerPortalLink(
  accessToken: string,
  customerId: string,
) {
  const response = await fetch(`${apiOrigin}/api/customer-portal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Owner-Hub-Organization':
        localStorage.getItem('owner-hub-active-organization') ?? '',
    },
    body: JSON.stringify({ action: 'create', customerId }),
  })
  const payload = (await response.json()) as {
    url?: string
    error?: string
  }

  if (!response.ok || !payload.url) {
    throw new Error(payload.error || 'Customer Hub link could not be created.')
  }
  if (!isSafeCustomerFacingUrl(payload.url)) {
    throw new Error('The Customer Hub link was not a safe public URL.')
  }

  return payload.url
}

export async function persistDocumentBeforeSharing(
  kind: DocumentKind,
  document: CustomerDocument,
) {
  const organizationId = localStorage.getItem('owner-hub-active-organization')
  if (!cloudClient || !organizationId) {
    throw new Error('Cloud sync must be connected before sending this document.')
  }

  const result = await cloudClient.from('business_records').upsert(
    {
      organization_id: organizationId,
      record_type: kind,
      record_id: document.id,
      payload: document,
      is_deleted: false,
      client_updated_at: document.updatedAt,
    },
    { onConflict: 'organization_id,record_type,record_id' },
  )

  if (result.error) {
    throw new Error('The document could not be synced before sending. Please retry.')
  }
}

export async function textCustomerDocument(options: {
  accessToken: string
  kind: DocumentKind
  document: CustomerDocument
  customer: Customer
}) {
  const { accessToken, kind, document, customer } = options

  if (!customer.phone.trim()) {
    throw new Error('No phone number is saved for this customer.')
  }

  await persistDocumentBeforeSharing(kind, document)
  const portalUrl = await createCustomerPortalLink(accessToken, customer.id)
  const number = documentNumber(kind, document)
  const label = kind === 'estimate' ? 'estimate' : 'invoice'
  const message =
    `Hi ${customer.firstName || 'there'}, your ${label} ${number} from ` +
    `Rabbit's Foot Handyman Services is ready: ${portalUrl}`
  const now = new Date().toISOString()
  const communication = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    documentId: document.id,
    channel: 'sms' as const,
    kind: kind === 'estimate' ? ('estimate_follow_up' as const) : ('invoice_reminder' as const),
    status: 'copied' as const,
    subject: `Rabbit's Foot ${label}`,
    body: message,
    createdAt: now,
  }

  saveCommunications([communication, ...loadCommunications()])
  await navigator.clipboard.writeText(message).catch(() => undefined)
  openSmsComposer(customer, message)

  return { portalUrl, message }
}
