import type { IncomingMessage } from 'node:http'

import {
  isValidEmailAddress,
  normalizeEmail,
} from '../src/shared/email/emailValidation.js'
import { requestedOrganizationId } from './_http-security.js'

export type EmailType =
  | 'estimate'
  | 'invoice'
  | 'customer_message'
  | 'receipt'
  | 'system_notification'

export type ApiRequest = IncomingMessage & { body?: unknown }
export type Json = Record<string, unknown>

export type AuthenticatedWorkspace = {
  organizationId: string
  role: 'owner' | 'admin' | 'member'
  userId: string
}

export type EmailDocument = Json & {
  id: string
  customerId: string
}

function configuration() {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Email service database configuration is missing.')
  return { key, url }
}

export async function database(path: string, init: RequestInit = {}) {
  const { key, url } = configuration()
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  })
}

export async function readBody(request: ApiRequest) {
  if (request.body && typeof request.body === 'object') return request.body as Json
  if (typeof request.body === 'string') return JSON.parse(request.body) as Json
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Json
}

async function authenticatedUserId(request: ApiRequest) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { key, url } = configuration()
  const result = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return null
  const user = await result.json() as { id?: unknown }
  return typeof user.id === 'string' ? user.id : null
}

export async function authenticatedWorkspace(request: ApiRequest) {
  const userId = await authenticatedUserId(request)
  if (!userId) return null
  const requested = requestedOrganizationId(request)
  const result = await database(
    `/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}&select=organization_id,role`,
  )
  if (!result.ok) throw new Error('Workspace access could not be verified.')
  const memberships = await result.json() as Array<{ organization_id?: unknown; role?: unknown }>
  const membership = memberships.find((item) => item.organization_id === requested) ?? memberships[0]
  if (typeof membership?.organization_id !== 'string') return null
  const role = membership.role === 'owner' || membership.role === 'admin' ? membership.role : 'member'
  return { organizationId: membership.organization_id, role, userId } satisfies AuthenticatedWorkspace
}

export async function loadBusinessRecord(
  organizationId: string,
  recordType: 'customer' | 'estimate' | 'invoice',
  recordId: string,
) {
  const result = await database(
    `/rest/v1/business_records?organization_id=eq.${encodeURIComponent(organizationId)}` +
    `&record_type=eq.${recordType}&record_id=eq.${encodeURIComponent(recordId)}` +
    '&is_deleted=is.false&select=payload&limit=1',
  )
  if (!result.ok) throw new Error('Email records could not be loaded.')
  const rows = await result.json() as Array<{ payload?: unknown }>
  return rows[0]?.payload && typeof rows[0].payload === 'object'
    ? rows[0].payload as Json
    : null
}

export function cleanText(value: unknown, limit = 500) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export function escapeHtml(value: unknown) {
  return cleanText(value, 5_000)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(Number.isFinite(value) ? value : 0)
}

function documentTotal(document: Json) {
  const subtotal = (Array.isArray(document.lineItems) ? document.lineItems : [])
    .reduce((sum, raw) => {
      const item = raw && typeof raw === 'object' ? raw as Json : {}
      const quantity = Number(item.quantity)
      const unitPrice = Number(item.unitPrice)
      return sum + (Number.isFinite(quantity) ? quantity : 0) *
        (Number.isFinite(unitPrice) ? unitPrice : 0)
    }, 0)
  const taxRate = Number(document.taxRate)
  const discount = Number(document.discount)
  return Math.max(
    0,
    subtotal + subtotal * (Number.isFinite(taxRate) ? taxRate / 100 : 0) -
      (Number.isFinite(discount) ? discount : 0),
  )
}

function paidTotal(document: Json) {
  return (Array.isArray(document.payments) ? document.payments : []).reduce((sum, raw) => {
    const payment = raw && typeof raw === 'object' ? raw as Json : {}
    const amount = Number(payment.amount)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

function safePortalUrl(value: unknown, request: ApiRequest) {
  const raw = cleanText(value, 1_000)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const configuredOrigins = [
      process.env.OWNER_HUB_PUBLIC_URL,
      process.env.VITE_PUBLIC_PORTAL_URL,
      request.headers.origin,
    ].filter(Boolean).map((origin) => new URL(String(origin)).origin)
    return url.protocol === 'https:' && configuredOrigins.includes(url.origin) &&
      url.hash.startsWith('#portal/') ? url.toString() : ''
  } catch {
    return ''
  }
}

function emailShell(content: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6ef;font-family:Arial,sans-serif;color:#10130f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto;background:#fff;border-radius:18px;border:1px solid #dbe4cf"><tr><td style="padding:28px"><div style="color:#579b00;font-weight:800;letter-spacing:.08em;font-size:13px">RABBIT'S FOOT HANDYMAN SERVICES</div>${content}<p style="margin:28px 0 0;color:#596054;font-size:14px;line-height:1.6">Rabbit's Foot Handyman Services<br>Small Fixes. Big Difference.</p></td></tr></table></td></tr></table></body></html>`
}

export function buildDocumentEmail(options: {
  customer: Json
  document: Json
  portalUrl: unknown
  request: ApiRequest
  type: 'estimate' | 'invoice'
}) {
  const { customer, document, request, type } = options
  const portalUrl = safePortalUrl(options.portalUrl, request)
  if (!portalUrl) throw new Error('A secure customer document link could not be created.')
  const firstName = escapeHtml(customer.firstName) || 'there'
  const jobName = escapeHtml(document.jobName) || (type === 'estimate' ? 'Your project' : 'Your job')
  const serviceAddress = escapeHtml(document.serviceAddress)
  const number = escapeHtml(type === 'estimate' ? document.estimateNumber : document.invoiceNumber)
  const total = documentTotal(document)
  const amount = type === 'invoice' ? Math.max(0, total - paidTotal(document)) : total
  const dueDate = escapeHtml(type === 'estimate' ? document.expirationDate : document.dueDate)
  const label = type === 'estimate' ? 'Estimate' : 'Invoice'
  const subject = type === 'estimate'
    ? `Estimate from Rabbit's Foot Handyman Services – ${cleanText(document.jobName, 120) || number}`
    : `Invoice ${cleanText(document.invoiceNumber, 80)} – Rabbit's Foot Handyman Services`
  const detailLabel = type === 'estimate' ? 'Estimate total' : 'Amount due'
  const dateLabel = type === 'estimate' ? 'Valid through' : 'Due date'
  const html = emailShell(`
    <h1 style="font-size:26px;line-height:1.2;margin:18px 0 10px">${label} ${number}</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 20px">Hi ${firstName}, your ${label.toLowerCase()} for <strong>${jobName}</strong> is ready.</p>
    <div style="background:#f1f8e7;border-radius:12px;padding:18px;margin:0 0 22px"><div style="font-size:13px;color:#596054">${detailLabel}</div><div style="font-size:28px;font-weight:800;margin-top:4px">${money(amount)}</div>${serviceAddress ? `<div style="font-size:14px;margin-top:10px">${serviceAddress}</div>` : ''}${dueDate ? `<div style="font-size:14px;margin-top:6px">${dateLabel}: ${dueDate}</div>` : ''}</div>
    <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#10130f;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">View ${label}</a>
  `)
  const text = [
    `Hi ${cleanText(customer.firstName, 80) || 'there'},`,
    `Your ${label.toLowerCase()} ${cleanText(type === 'estimate' ? document.estimateNumber : document.invoiceNumber, 80)} for ${cleanText(document.jobName, 120)} is ready.`,
    `${detailLabel}: ${money(amount)}`,
    serviceAddress ? `Service address: ${cleanText(document.serviceAddress, 300)}` : '',
    dueDate ? `${dateLabel}: ${cleanText(type === 'estimate' ? document.expirationDate : document.dueDate, 80)}` : '',
    `View ${label}: ${portalUrl}`,
    "Rabbit's Foot Handyman Services",
  ].filter(Boolean).join('\n\n')
  return { html, subject, text }
}

export function normalizedRecipient(customer: Json, requestedRecipient: unknown) {
  const saved = normalizeEmail(customer.email)
  const requested = normalizeEmail(requestedRecipient)
  if (!isValidEmailAddress(saved) || requested !== saved) return ''
  return saved
}
