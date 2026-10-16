import type { Customer } from '../customers/types/Customer'
import type { Estimate } from '../estimates/types/Estimate'
import type { Invoice } from '../invoices/types/Invoice'
import { cloudClient } from '../cloud/cloudClient'
import { loadCommunications, saveCommunications } from './data/communicationStore'
import { openSmsComposer } from './customerContact'
import { isSafeCustomerFacingUrl } from './publicAppUrl'
import {
  INVALID_EMAIL_MESSAGE,
  requireValidEmail,
} from '../../shared/email/emailValidation'

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
  const responseText = await response.text()
  let payload: { url?: string; error?: string }

  try {
    payload = responseText
      ? (JSON.parse(responseText) as { url?: string; error?: string })
      : {}
  } catch {
    throw new Error(
      'Customer Hub is temporarily unavailable. Please wait a moment and try again.',
    )
  }

  if (!response.ok || !payload.url) {
    throw new Error(
      payload.error ||
        'Customer Hub is temporarily unavailable. Please wait a moment and try again.',
    )
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
    `Rabbit's Foot Handyman Services LLC is ready: ${portalUrl}`
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

export async function emailCustomerDocument(options: {
  accessToken: string
  idempotencyKey: string
  kind: DocumentKind
  document: CustomerDocument
  customer: Customer
}) {
  const { accessToken, idempotencyKey, kind, document, customer } = options
  let recipient: string
  try {
    recipient = requireValidEmail(customer.email)
  } catch {
    throw new Error(INVALID_EMAIL_MESSAGE)
  }

  await persistDocumentBeforeSharing(kind, document)
  const portalUrl = await createCustomerPortalLink(accessToken, customer.id)
  const response = await fetch(`${apiOrigin}/api/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Owner-Hub-Organization':
        localStorage.getItem('owner-hub-active-organization') ?? '',
    },
    body: JSON.stringify({
      customerId: customer.id,
      documentId: document.id,
      idempotencyKey,
      portalUrl,
      recipient,
      type: kind,
    }),
  }).catch(() => {
    throw new Error('Unable to connect. Check your internet connection and try again.')
  })
  const responseText = await response.text()
  let payload: {
    error?: string
    message?: string
    providerMessageId?: string
    status?: string
  } = {}
  try {
    payload = responseText ? JSON.parse(responseText) as typeof payload : {}
  } catch {
    payload = {}
  }
  if (!response.ok) {
    throw new Error(payload.error || 'Email could not be sent right now. Please try again.')
  }

  const label = kind === 'estimate' ? 'estimate' : 'invoice'
  const now = new Date().toISOString()
  saveCommunications([{
    id: crypto.randomUUID(),
    customerId: customer.id,
    documentId: document.id,
    channel: 'email',
    kind: kind === 'estimate' ? 'estimate_follow_up' : 'invoice_reminder',
    status: 'sent',
    subject: `Rabbit's Foot ${label}`,
    body: `${label[0].toUpperCase()}${label.slice(1)} emailed to ${recipient}.`,
    createdAt: now,
    sentAt: now,
  }, ...loadCommunications()])

  return {
    message: payload.message || 'Email sent',
    portalUrl,
    providerMessageId: payload.providerMessageId,
    status: payload.status || 'sent',
  }
}
