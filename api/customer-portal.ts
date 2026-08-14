import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSquareMerchantCredentials } from './_square-merchant.js'
import { applyCors, requestedOrganizationId } from './_http-security.js'
import { buildCustomerPortalUrl, getPublicAppUrl } from './_public-url.js'
import { cardCheckoutAmounts } from './_card-fee.js'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>
type Json = Record<string, unknown>

function send(response: ApiResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function cors(request: ApiRequest, response: ApiResponse) {
  return applyCors(request, response, 'GET, POST, OPTIONS')
}

async function body(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function config() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  return { url: url.replace(/\/$/, ''), key }
}

async function database(path: string, init: RequestInit = {}) {
  const { url, key } = config()
  const authorization = key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}
  return fetch(`${url}${path}`, { ...init, headers: { apikey: key, ...authorization, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(12_000) })
}

async function userId(token: string) {
  const { url, key } = config()
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return null
  const payload = await response.json() as { id?: unknown }
  return typeof payload.id === 'string' ? payload.id : null
}

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex') }
function clean(value: unknown, length = 500) { return typeof value === 'string' ? value.trim().slice(0, length) : '' }
function base64Url(value: string) {
  return Buffer.from(value).toString('base64url')
}

function createPortalRealtimeToken(link: {
  id: string
  organization_id: string
  customer_id: string
}) {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim()
  if (!secret) return null

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + 60 * 60
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    aud: 'authenticated',
    role: 'authenticated',
    sub: link.id,
    iat: now,
    exp: expiresAt,
    portal_link_id: link.id,
    portal_organization_id: link.organization_id,
    portal_customer_id: link.customer_id,
  }))
  const signature = createHmac('sha256', secret)
    .update(`${header}.${claims}`)
    .digest('base64url')

  return { token: `${header}.${claims}.${signature}`, expiresAt }
}
function total(record: Json) {
  const subtotal = (Array.isArray(record.lineItems) ? record.lineItems : []).reduce((sum, raw) => {
    const item = raw && typeof raw === 'object' ? raw as Json : {}
    return sum + (typeof item.quantity === 'number' ? item.quantity : 0) * (typeof item.unitPrice === 'number' ? item.unitPrice : 0)
  }, 0)
  return Math.max(0, Math.round((subtotal + subtotal * (typeof record.taxRate === 'number' ? record.taxRate : 0) / 100 - (typeof record.discount === 'number' ? record.discount : 0)) * 100) / 100)
}

export function customerInvoiceBalance(record: Json) {
  const paid = (Array.isArray(record.payments) ? record.payments : []).reduce(
    (sum, raw) => {
      const payment = raw && typeof raw === 'object' ? (raw as Json) : {}
      return sum + (typeof payment.amount === 'number' ? payment.amount : 0)
    },
    0,
  )

  return Math.max(0, Math.round((total(record) - paid) * 100) / 100)
}

export function customerInvoiceCanPay(record: Json) {
  return (
    ['sent', 'partial', 'overdue'].includes(String(record.status)) &&
    customerInvoiceBalance(record) >= 0.5
  )
}

async function portalLink(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null
  const response = await database(`/rest/v1/customer_portal_links?token_hash=eq.${tokenHash(token)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,organization_id,customer_id,expires_at&limit=1`)
  if (!response.ok) return null
  const links = await response.json() as Array<{ id: string; organization_id: string; customer_id: string; expires_at: string }>
  return links[0] ?? null
}

async function records(organizationId: string) {
  const response = await database(`/rest/v1/business_records?organization_id=eq.${organizationId}&is_deleted=eq.false&select=record_type,record_id,payload`)
  if (!response.ok) throw new Error('records_unavailable')
  return response.json() as Promise<Array<{ record_type: string; record_id: string; payload: Json }>>
}

function safePortalData(
  all: Array<{ record_type: string; record_id: string; payload: Json }>,
  link: { id: string; organization_id: string; customer_id: string; expires_at: string },
) {
  const customerId = link.customer_id
  const customer = all.find((item) => item.record_type === 'customer' && item.record_id === customerId)?.payload
  if (!customer) return null
  const belongs = (item: { payload: Json }) => item.payload.customerId === customerId
  return {
    expiresAt: link.expires_at,
    realtime: createPortalRealtimeToken(link),
    customer: { id: customerId, firstName: clean(customer.firstName, 80), lastName: clean(customer.lastName, 80), email: clean(customer.email, 200), phone: clean(customer.phone, 40) },
    estimates: all.filter((item) => item.record_type === 'estimate' && belongs(item) && item.payload.status !== 'draft').map(({ payload }) => ({
      id: payload.id, estimateNumber: payload.estimateNumber, jobName: payload.jobName, serviceAddress: payload.serviceAddress,
      scopeOfWork: payload.scopeOfWork, exclusions: payload.exclusions, lineItems: payload.lineItems, taxRate: payload.taxRate, discount: payload.discount,
      issueDate: payload.issueDate, expirationDate: payload.expirationDate, status: payload.status,
      approval: payload.approval && typeof payload.approval === 'object' ? { customerName: (payload.approval as Json).customerName, acceptedAt: (payload.approval as Json).acceptedAt } : undefined,
      total: total(payload),
    })),
    invoices: all.filter((item) => item.record_type === 'invoice' && belongs(item) && !['draft', 'void'].includes(String(item.payload.status))).map(({ payload }) => {
      const paid = (Array.isArray(payload.payments) ? payload.payments : []).reduce((sum, raw) => sum + (raw && typeof raw === 'object' && typeof (raw as Json).amount === 'number' ? (raw as Json).amount as number : 0), 0)
      const balance = Math.max(0, Math.round((total(payload) - paid) * 100) / 100)
      const checkout = cardCheckoutAmounts(balance, payload)
      const payments = (Array.isArray(payload.payments) ? payload.payments : []).map((raw) => {
        const payment = raw && typeof raw === 'object' ? raw as Json : {}
        return { id: payment.id, date: payment.date, amount: payment.amount, method: payment.method }
      })
      return { id: payload.id, invoiceNumber: payload.invoiceNumber, jobName: payload.jobName, serviceAddress: payload.serviceAddress, description: payload.description, lineItems: payload.lineItems, issueDate: payload.issueDate, dueDate: payload.dueDate, status: payload.status, total: total(payload), balance, payments, cardProcessingFeePercent: checkout.feePercent, cardFeeAmount: checkout.feeAmount, cardCheckoutTotal: checkout.checkoutAmount }
    }),
    appointments: all.filter((item) => item.record_type === 'appointment' && belongs(item)).map(({ payload }) => ({ id: payload.id, title: payload.title, serviceAddress: payload.serviceAddress, startAt: payload.startAt, endAt: payload.endAt, status: payload.status })),
    jobs: all.filter((item) => item.record_type === 'job' && belongs(item)).map(({ payload }) => ({ id: payload.id, jobNumber: payload.jobNumber, jobName: payload.jobName, serviceAddress: payload.serviceAddress, scopeOfWork: payload.scopeOfWork, status: payload.status, completedAt: payload.completedAt })),
  }
}

async function loadPortal(token: string) {
  const link = await portalLink(token)
  if (!link) return null
  const all = await records(link.organization_id)
  return { link, all, data: safePortalData(all, link) }
}

async function createCustomerSquareCheckout(
  request: ApiRequest,
  portal: NonNullable<Awaited<ReturnType<typeof loadPortal>>>,
  rawToken: string,
  invoiceId: string,
) {
  const record = portal.all.find(
    (item) =>
      item.record_type === 'invoice' &&
      item.record_id === invoiceId &&
      item.payload.customerId === portal.link.customer_id,
  )

  if (!record) throw new Error('invoice_not_found')
  if (!customerInvoiceCanPay(record.payload)) {
    if (['sent', 'partial', 'overdue'].includes(String(record.payload.status))) {
      throw new Error('invoice_paid')
    }
    throw new Error('invoice_not_payable')
  }

  const amount = customerInvoiceBalance(record.payload)
  const checkout = cardCheckoutAmounts(amount, record.payload)

  const existingLink =
    record.payload.squarePaymentLink &&
    typeof record.payload.squarePaymentLink === 'object'
      ? (record.payload.squarePaymentLink as Json)
      : null

  if (
    existingLink &&
    existingLink.source === 'customer_portal' &&
    typeof existingLink.url === 'string' &&
    typeof existingLink.amount === 'number' &&
    typeof existingLink.invoiceAmount === 'number' &&
    Math.abs(existingLink.invoiceAmount - amount) <= 0.005 &&
    typeof existingLink.cardFeePercent === 'number' &&
    Math.abs(existingLink.cardFeePercent - checkout.feePercent) <= 0.005
  ) {
    return { url: existingLink.url, ...checkout }
  }

  const merchant = await getSquareMerchantCredentials(portal.link.organization_id)
  const invoiceNumber = clean(record.payload.invoiceNumber, 80) || 'Invoice'
  const jobName = clean(record.payload.jobName, 80) || 'Handyman services'
  const idempotencyKey = createHash('sha256')
    .update(
      `${portal.link.organization_id}:${invoiceId}:${checkout.checkoutAmount}:${String(record.payload.updatedAt ?? '')}`,
    )
    .digest('hex')
  const publicAppUrl = getPublicAppUrl(request)
  const squareResponse = await fetch(`${merchant.baseUrl}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${merchant.token}`,
      'Square-Version': '2026-07-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: idempotencyKey,
      description: `Owner Hub ${invoiceNumber}`,
      quick_pay: {
        name: `${invoiceNumber} - ${jobName}`,
        price_money: { amount: Math.round(checkout.checkoutAmount * 100), currency: 'USD' },
        location_id: merchant.locationId,
      },
      checkout_options: {
        redirect_url: `${publicAppUrl}/?payment=return#portal/${rawToken}`,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const squarePayload = await squareResponse.json() as {
    payment_link?: { id?: string; order_id?: string; url?: string }
    errors?: Array<{ detail?: string }>
  }
  const paymentLink = squarePayload.payment_link

  if (!squareResponse.ok || !paymentLink?.url) {
    console.error('Customer Square checkout failed.', squarePayload.errors?.map((item) => item.detail))
    throw new Error('square_checkout_failed')
  }

  const now = new Date().toISOString()
  const nextPayload = {
    ...record.payload,
    squarePaymentLink: {
      url: paymentLink.url,
      paymentLinkId: paymentLink.id,
      orderId: paymentLink.order_id,
      amount: checkout.checkoutAmount,
      invoiceAmount: checkout.invoiceAmount,
      cardFeeAmount: checkout.feeAmount,
      cardFeePercent: checkout.feePercent,
      createdAt: now,
      source: 'customer_portal',
    },
    updatedAt: now,
  }
  const update = await database(
    `/rest/v1/business_records?organization_id=eq.${encodeURIComponent(portal.link.organization_id)}&record_type=eq.invoice&record_id=eq.${encodeURIComponent(invoiceId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ payload: nextPayload, client_updated_at: now, is_deleted: false }),
    },
  )

  if (!update.ok) throw new Error('checkout_tracking_failed')
  return { url: paymentLink.url, ...checkout }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!cors(request, response)) return send(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
  try {
    if (request.method === 'GET') {
      const token = new URL(request.url ?? '/', 'http://ownerhub.local').searchParams.get('token') ?? ''
      const portal = await loadPortal(token)
      return portal?.data ? send(response, 200, portal.data) : send(response, 404, { error: 'This secure customer link is invalid or expired.' })
    }
    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
    const payload = await body(request) as Json
    const action = clean(payload.action, 40)
    if (action === 'create') {
      const accessToken = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : ''
      const ownerId = accessToken ? await userId(accessToken) : null
      if (!ownerId) return send(response, 401, { error: 'Sign in before creating a customer link.' })
      const customerId = clean(payload.customerId, 80)
      const organizationIdHint = requestedOrganizationId(request)
      const organizationFilter = organizationIdHint
        ? `&organization_id=eq.${encodeURIComponent(organizationIdHint)}`
        : ''
      const membershipResponse = await database(`/rest/v1/organization_members?user_id=eq.${ownerId}${organizationFilter}&select=organization_id&limit=1`)
      const memberships = await membershipResponse.json() as Array<{ organization_id?: string }>
      const organizationId = memberships[0]?.organization_id
      if (!organizationId || !customerId) return send(response, 400, { error: 'Choose a customer in the connected workspace.' })
      const rawToken = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString()
      const insertion = await database('/rest/v1/customer_portal_links', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ organization_id: organizationId, customer_id: customerId, token_hash: tokenHash(rawToken), expires_at: expiresAt, created_by: ownerId }) })
      if (!insertion.ok) return send(response, 502, { error: 'Run the Owner Hub 2.3 database migration, then retry.' })
      return send(response, 200, {
        url: buildCustomerPortalUrl(rawToken, request),
        expiresAt,
      })
    }
    const rawToken = clean(payload.token, 80)
    const portal = await loadPortal(rawToken)
    if (!portal?.data) return send(response, 404, { error: 'This secure customer link is invalid or expired.' })
    if (action === 'create_payment') {
      const invoiceId = clean(payload.invoiceId, 80)

      try {
        const checkout = await createCustomerSquareCheckout(request, portal, rawToken, invoiceId)
        return send(response, 200, checkout)
      } catch (error) {
        const code = error instanceof Error ? error.message : ''

        if (code === 'invoice_not_found') return send(response, 404, { error: 'This invoice is not available.' })
        if (code === 'invoice_not_payable') return send(response, 400, { error: 'This invoice is not ready for payment.' })
        if (code === 'invoice_paid') return send(response, 409, { error: 'This invoice has already been paid.' })
        if (code === 'square_not_configured') return send(response, 503, { error: 'Square payment is temporarily unavailable.' })

        return send(response, 502, { error: 'Square checkout could not be opened. Please try again.' })
      }
    }
    if (action === 'request_change') {
      const estimateId = clean(payload.estimateId, 80)
      const estimate = portal.all.find((item) => item.record_type === 'estimate' && item.record_id === estimateId && item.payload.customerId === portal.link.customer_id)
      const message = clean(payload.message, 2000)
      if (!estimate || !message) return send(response, 400, { error: 'Describe the requested change.' })
      const now = new Date().toISOString(); const id = randomUUID()
      const communication = { id, customerId: portal.link.customer_id, documentId: estimateId, channel: 'system', kind: 'custom', status: 'delivered', subject: 'Customer requested estimate changes', body: message, createdAt: now, sentAt: now }
      const insertion = await database('/rest/v1/business_records', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ organization_id: portal.link.organization_id, record_type: 'communication', record_id: id, payload: communication, is_deleted: false, client_updated_at: now }) })
      return insertion.ok ? send(response, 200, { ok: true }) : send(response, 502, { error: 'The request could not be delivered.' })
    }
    if (action === 'request_work') {
      const service = clean(payload.service, 160)
      const preferredTiming = clean(payload.preferredTiming, 240)
      const details = clean(payload.details, 2000)
      if (!service || !details) {
        return send(response, 400, { error: 'Describe the service and work you need.' })
      }

      const now = new Date().toISOString()
      const id = randomUUID()
      const timingLine = preferredTiming ? `Preferred timing: ${preferredTiming}\n\n` : ''
      const communication = {
        id,
        customerId: portal.link.customer_id,
        channel: 'system',
        kind: 'custom',
        status: 'delivered',
        subject: `New work request: ${service}`,
        body: `${timingLine}${details}`,
        createdAt: now,
        sentAt: now,
      }
      const insertion = await database('/rest/v1/business_records', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          organization_id: portal.link.organization_id,
          record_type: 'communication',
          record_id: id,
          payload: communication,
          is_deleted: false,
          client_updated_at: now,
        }),
      })
      return insertion.ok
        ? send(response, 200, { ok: true })
        : send(response, 502, { error: 'The work request could not be delivered.' })
    }
    if (action === 'approve_estimate') {
      const estimateId = clean(payload.estimateId, 80); const approvingName = clean(payload.customerName, 160)
      const estimate = portal.all.find((item) => item.record_type === 'estimate' && item.record_id === estimateId && item.payload.customerId === portal.link.customer_id)
      if (!estimate || !approvingName || !['draft', 'sent'].includes(String(estimate.payload.status))) return send(response, 400, { error: 'This estimate cannot be approved.' })
      const now = new Date().toISOString(); const item = estimate.payload
      item.status = 'approved'; item.updatedAt = now; item.approval = { customerName: approvingName, method: 'email', note: clean(payload.note, 500), acceptedAt: now, snapshot: { estimateNumber: item.estimateNumber, revisionNumber: typeof item.revisionNumber === 'number' ? item.revisionNumber : 0, customerId: item.customerId, jobName: item.jobName, serviceAddress: item.serviceAddress, scopeOfWork: item.scopeOfWork ?? '', exclusions: Array.isArray(item.exclusions) ? item.exclusions : [], lineItems: item.lineItems, taxRate: item.taxRate, discount: item.discount, acceptedAmount: total(item) } }
      const update = await database(`/rest/v1/business_records?organization_id=eq.${portal.link.organization_id}&record_type=eq.estimate&record_id=eq.${estimateId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payload: item, client_updated_at: now }) })
      return update.ok ? send(response, 200, { ok: true }) : send(response, 502, { error: 'Approval could not be saved.' })
    }
    return send(response, 400, { error: 'Unsupported customer action.' })
  } catch (error) {
    console.error('Customer portal failed.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 500, { error: 'The secure customer portal is temporarily unavailable.' })
  }
}
