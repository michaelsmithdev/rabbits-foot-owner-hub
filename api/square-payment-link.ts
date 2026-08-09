import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSquareMerchantCredentials } from './_square-merchant.ts'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>

function sendJson(response: ApiResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

async function readBody(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function allowedOrigin(request: ApiRequest, response: ApiResponse) {
  const origin = request.headers.origin
  if (!origin) return true
  try {
    const url = new URL(origin)
    const allowed = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.vercel.app') ||
      (process.env.OWNER_HUB_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).includes(origin)
    if (!allowed) return false
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    response.setHeader('Vary', 'Origin')
    return true
  } catch { return false }
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

async function verifyUser(token: string) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  const result = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!result.ok) return null
  const user = await result.json() as { id?: unknown }
  return typeof user.id === 'string' ? user.id : null
}

function invoiceBalance(payload: Record<string, unknown>) {
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : []
  const subtotal = lineItems.reduce((sum, raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0
    const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0
    return sum + quantity * unitPrice
  }, 0)
  const taxRate = typeof payload.taxRate === 'number' ? payload.taxRate : 0
  const discount = typeof payload.discount === 'number' ? payload.discount : 0
  const paid = Array.isArray(payload.payments) ? payload.payments.reduce((sum, raw) => {
    const payment = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    return sum + (typeof payment.amount === 'number' ? payment.amount : 0)
  }, 0) : 0
  return Math.max(0, Math.round((subtotal + subtotal * taxRate / 100 - discount - paid) * 100) / 100)
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!allowedOrigin(request, response)) return sendJson(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : ''
  if (!token) return sendJson(response, 401, { error: 'Sign in before creating a Square payment link.' })

  try {
    const userId = await verifyUser(token)
    if (!userId) return sendJson(response, 401, { error: 'Your secure session expired.' })
    const body = await readBody(request) as { invoiceId?: unknown; amount?: unknown }
    if (typeof body.invoiceId !== 'string') return sendJson(response, 400, { error: 'Choose an invoice.' })

    const membership = await supabaseRequest(`/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}&select=organization_id&limit=1`)
    const memberships = await membership.json() as Array<{ organization_id?: string }>
    const organizationId = memberships[0]?.organization_id
    if (!membership.ok || !organizationId) return sendJson(response, 403, { error: 'No business workspace is connected.' })

    const recordResponse = await supabaseRequest(`/rest/v1/business_records?organization_id=eq.${encodeURIComponent(organizationId)}&record_type=eq.invoice&record_id=eq.${encodeURIComponent(body.invoiceId)}&is_deleted=eq.false&select=payload&limit=1`)
    const records = await recordResponse.json() as Array<{ payload?: Record<string, unknown> }>
    const invoice = records[0]?.payload
    if (!recordResponse.ok || !invoice) return sendJson(response, 404, { error: 'Invoice not found in the secure workspace. Sync and retry.' })
    if (!['sent', 'partial', 'overdue'].includes(String(invoice.status))) {
      return sendJson(response, 400, { error: 'Mark the invoice Sent before accepting payment.' })
    }
    const balance = invoiceBalance(invoice)
    const requested = typeof body.amount === 'number' && Number.isFinite(body.amount) ? body.amount : balance
    const amount = Math.min(balance, Math.max(0, Math.round(requested * 100) / 100))
    if (amount < 0.5) return sendJson(response, 400, { error: 'This invoice has no payable balance.' })

    const merchant = await getSquareMerchantCredentials(organizationId)
    const invoiceNumber = typeof invoice.invoiceNumber === 'string' ? invoice.invoiceNumber : 'Invoice'
    const idempotencyKey = createHash('sha256').update(`${organizationId}:${body.invoiceId}:${amount}:${String(invoice.updatedAt ?? '')}`).digest('hex')
    const origin = request.headers.origin && allowedOrigin(request, response) ? request.headers.origin : 'https://rabbits-foot-owner-hub.vercel.app'
    const squareResponse = await fetch(`${merchant.baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${merchant.token}`, 'Square-Version': '2026-07-15', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key: idempotencyKey || randomUUID(),
        description: `Owner Hub ${invoiceNumber}`,
        quick_pay: { name: `${invoiceNumber} - ${String(invoice.jobName ?? 'Handyman services').slice(0, 80)}`, price_money: { amount: Math.round(amount * 100), currency: 'USD' }, location_id: merchant.locationId },
        checkout_options: { redirect_url: `${origin}/#documents` },
        pre_populated_data: {},
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const squarePayload = await squareResponse.json() as { payment_link?: { id?: string; order_id?: string; url?: string }; errors?: Array<{ detail?: string }> }
    if (!squareResponse.ok || !squarePayload.payment_link?.url) {
      console.error('Square payment-link error', squarePayload.errors?.map((item) => item.detail))
      return sendJson(response, 502, { error: 'Square could not create the payment link. Check the Square connection and retry.' })
    }
    return sendJson(response, 200, { url: squarePayload.payment_link.url, paymentLinkId: squarePayload.payment_link.id, orderId: squarePayload.payment_link.order_id, amount })
  } catch (error) {
    console.error('Square payment-link request failed.', error instanceof Error ? error.message : 'Unknown error')
    return sendJson(response, 500, { error: 'The payment link could not be created safely.' })
  }
}
