import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>
type Json = Record<string, unknown>

// Signature validation requires the exact bytes Square sent.
export const config = { api: { bodyParser: false } }

function sendJson(response: ApiResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

async function readRawBody(request: ApiRequest) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length > 0) return Buffer.concat(chunks).toString('utf8')
  if (typeof request.body === 'string') return request.body
  return request.body ? JSON.stringify(request.body) : ''
}

function signatureIsValid(rawBody: string, signature: string, key: string, notificationUrl: string) {
  const expected = createHmac('sha256', key).update(notificationUrl + rawBody).digest()
  let received: Buffer
  try { received = Buffer.from(signature, 'base64') } catch { return false }
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  const authorization = key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}
  return fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { apikey: key, ...authorization, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(12_000),
  })
}

function amountPaid(payload: Json) {
  if (!Array.isArray(payload.payments)) return 0
  return payload.payments.reduce((sum, raw) => {
    const payment = raw && typeof raw === 'object' ? raw as Json : {}
    return sum + (typeof payment.amount === 'number' ? payment.amount : 0)
  }, 0)
}

function invoiceTotal(payload: Json) {
  const subtotal = Array.isArray(payload.lineItems) ? payload.lineItems.reduce((sum, raw) => {
    const item = raw && typeof raw === 'object' ? raw as Json : {}
    return sum + (typeof item.quantity === 'number' ? item.quantity : 0) * (typeof item.unitPrice === 'number' ? item.unitPrice : 0)
  }, 0) : 0
  const taxRate = typeof payload.taxRate === 'number' ? payload.taxRate : 0
  const discount = typeof payload.discount === 'number' ? payload.discount : 0
  return Math.max(0, Math.round((subtotal + subtotal * taxRate / 100 - discount) * 100) / 100)
}

async function recordEvent(eventId: string) {
  await supabaseRequest('/rest/v1/square_webhook_events?on_conflict=event_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ event_id: eventId }),
  })
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim()
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim()
  if (!signatureKey || !notificationUrl) return sendJson(response, 503, { error: 'Square webhook validation is not configured.' })

  try {
    const rawBody = await readRawBody(request)
    const signature = typeof request.headers['x-square-hmacsha256-signature'] === 'string' ? request.headers['x-square-hmacsha256-signature'] : ''
    if (!signatureIsValid(rawBody, signature, signatureKey, notificationUrl)) return sendJson(response, 403, { error: 'Invalid Square signature.' })

    const event = JSON.parse(rawBody) as Json
    const eventId = typeof event.event_id === 'string' ? event.event_id : ''
    const eventType = typeof event.type === 'string' ? event.type : ''
    const data = event.data && typeof event.data === 'object' ? event.data as Json : {}
    const object = data.object && typeof data.object === 'object' ? data.object as Json : {}
    const subscription = object.subscription && typeof object.subscription === 'object' ? object.subscription as Json : {}
    if (eventId && eventType.startsWith('subscription.') && typeof subscription.id === 'string') {
      const squareStatus = typeof subscription.status === 'string' ? subscription.status.toUpperCase() : ''
      const status = squareStatus === 'ACTIVE' ? 'active' : squareStatus === 'PAUSED' ? 'paused' : squareStatus === 'CANCELED' || squareStatus === 'DEACTIVATED' ? 'canceled' : 'past_due'
      const updateResponse = await supabaseRequest(`/rest/v1/organization_subscriptions?square_subscription_id=eq.${encodeURIComponent(subscription.id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status, current_period_ends_at: typeof subscription.charged_through_date === 'string' ? `${subscription.charged_through_date}T23:59:59Z` : null, updated_at: new Date().toISOString() }),
      })
      if (!updateResponse.ok) throw new Error('subscription_update_failed')
      await recordEvent(eventId)
      return sendJson(response, 200, { received: true })
    }
    const payment = object.payment && typeof object.payment === 'object' ? object.payment as Json : {}
    if (!eventId || (eventType !== 'payment.created' && eventType !== 'payment.updated') || payment.status !== 'COMPLETED') {
      return sendJson(response, 200, { received: true })
    }

    const paymentId = typeof payment.id === 'string' ? payment.id : ''
    const orderId = typeof payment.order_id === 'string' ? payment.order_id : ''
    const amountMoney = payment.amount_money && typeof payment.amount_money === 'object' ? payment.amount_money as Json : {}
    const cents = typeof amountMoney.amount === 'number' ? amountMoney.amount : Number(amountMoney.amount)
    if (!paymentId || !orderId || !Number.isFinite(cents) || cents <= 0) return sendJson(response, 200, { received: true })

    const recordsResponse = await supabaseRequest('/rest/v1/business_records?record_type=eq.invoice&is_deleted=eq.false&select=organization_id,record_id,payload,client_updated_at')
    if (!recordsResponse.ok) {
      const detail = (await recordsResponse.text()).slice(0, 300)
      console.error('Square invoice lookup rejected.', recordsResponse.status, detail)
      throw new Error('invoice_lookup_failed')
    }
    const records = await recordsResponse.json() as Array<{ organization_id: string; record_id: string; payload: Json; client_updated_at: string }>
    const record = records.find((entry) => {
      const link = entry.payload.squarePaymentLink
      return link && typeof link === 'object' && (link as Json).orderId === orderId
    })
    if (!record) {
      await recordEvent(eventId)
      return sendJson(response, 200, { received: true })
    }

    const payments = Array.isArray(record.payload.payments) ? [...record.payload.payments] as Json[] : []
    if (!payments.some((entry) => entry.referenceNumber === paymentId)) {
      const paidAt = typeof payment.updated_at === 'string' ? payment.updated_at : new Date().toISOString()
      payments.push({ id: `square-${paymentId}`, date: paidAt.slice(0, 10), amount: Math.round(cents) / 100, method: 'online', referenceNumber: paymentId, notes: 'Paid securely through Square', createdAt: paidAt })
      const nextPaid = amountPaid({ ...record.payload, payments })
      const fullyPaid = nextPaid + 0.005 >= invoiceTotal(record.payload)
      const updatedAt = new Date().toISOString()
      const payload = { ...record.payload, payments, status: fullyPaid ? 'paid' : 'partial', paidAt: fullyPaid ? paidAt : null, updatedAt }
      const updateResponse = await supabaseRequest(`/rest/v1/business_records?organization_id=eq.${encodeURIComponent(record.organization_id)}&record_type=eq.invoice&record_id=eq.${encodeURIComponent(record.record_id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payload, client_updated_at: updatedAt, is_deleted: false }),
      })
      if (!updateResponse.ok) throw new Error('invoice_update_failed')
    }
    await recordEvent(eventId)
    return sendJson(response, 200, { received: true })
  } catch (error) {
    console.error('Square webhook failed.', error instanceof Error ? error.message : 'Unknown error')
    return sendJson(response, 500, { error: 'Square payment update could not be recorded.' })
  }
}
