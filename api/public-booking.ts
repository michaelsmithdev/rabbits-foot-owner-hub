import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { applyCors } from './_http-security.js'
import { isValidEmailAddress, normalizeEmail } from '../src/shared/email/emailValidation.js'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>

const attempts = new Map<string, { count: number; resetAt: number }>()

function send(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function configuration() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Online booking is temporarily unavailable.')
  return { url: url.replace(/\/$/, ''), key }
}

async function database(path: string, init: RequestInit = {}) {
  const { url, key } = configuration()
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

async function readBody(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function cleanText(value: unknown, length: number) {
  if (typeof value !== 'string') return ''
  const printable = Array.from(value.trim(), (character) => character.charCodeAt(0) < 32 ? ' ' : character).join('')
  return printable.replace(/\s+/g, ' ').slice(0, length)
}

function rateLimited(request: ApiRequest) {
  const address = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim()
  const key = createHash('sha256').update(address).digest('hex').slice(0, 24)
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 60 * 60_000 })
    return false
  }
  current.count += 1
  return current.count > 8
}

async function organizationForSlug(slug: string) {
  const response = await database(`/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`)
  if (!response.ok) throw new Error('The booking workspace could not be loaded.')
  return (await response.json() as Array<{ id?: string; name?: string; slug?: string }>)[0] ?? null
}

async function publicProfile(organization: { id: string; name?: string }) {
  const settingsResponse = await database(`/rest/v1/business_records?organization_id=eq.${encodeURIComponent(organization.id)}&record_type=eq.settings&is_deleted=eq.false&select=payload&limit=1`)
  const settingsRows = settingsResponse.ok ? await settingsResponse.json() as Array<{ payload?: Record<string, unknown> }> : []
  const settings = settingsRows[0]?.payload ?? {}
  return {
    businessName: cleanText(settings.businessName, 120) || cleanText(organization.name, 120) || 'Service business',
    phone: cleanText(settings.phone, 40),
    email: cleanText(settings.email, 160),
    city: cleanText(settings.city, 80),
    state: cleanText(settings.state, 40),
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!applyCors(request, response, 'GET, POST, OPTIONS')) return send(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end() }
  if (request.method !== 'GET' && request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  if (rateLimited(request)) return send(response, 429, { error: 'Too many requests. Please try again later.' })

  try {
    const requestUrl = new URL(request.url ?? '/api/public-booking', 'https://ownerhub.local')
    const payload = request.method === 'POST' ? await readBody(request) as Record<string, unknown> : {}
    const slug = cleanText(request.method === 'GET' ? requestUrl.searchParams.get('slug') : payload.slug, 120).toLowerCase()
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return send(response, 400, { error: 'This booking link is invalid.' })
    const organization = await organizationForSlug(slug)
    if (!organization?.id) return send(response, 404, { error: 'This booking page was not found.' })

    if (request.method === 'GET') return send(response, 200, await publicProfile({ id: organization.id, name: organization.name }))
    if (cleanText(payload.company, 200)) return send(response, 202, { received: true })

    const name = cleanText(payload.name, 100)
    const phone = cleanText(payload.phone, 40)
    const email = normalizeEmail(cleanText(payload.email, 150))
    const service = cleanText(payload.service, 100)
    const address = cleanText(payload.address, 300)
    const description = cleanText(payload.description, 4000)
    const preferredDate = cleanText(payload.preferredDate, 10)
    const preferredWindow = ['morning', 'afternoon', 'evening', 'flexible'].includes(String(payload.preferredWindow)) ? String(payload.preferredWindow) : 'flexible'
    const urgency = ['standard', 'soon', 'urgent'].includes(String(payload.urgency)) ? String(payload.urgency) : 'standard'
    if (!isValidEmailAddress(email)) {
      return send(response, 400, { error: 'Enter a valid email address before continuing.' })
    }
    if (!name || !phone || !service || !address || description.length < 10 || payload.consent !== true) {
      return send(response, 400, { error: 'Complete every required field and confirm contact permission.' })
    }

    const now = new Date().toISOString()
    const id = randomUUID()
    const timing = preferredDate ? `Preferred ${preferredDate} (${preferredWindow}).` : `Timing is ${preferredWindow}.`
    const activity = [{ id: randomUUID(), type: 'submitted', message: `Online booking request received. ${timing} Priority: ${urgency}.`, createdAt: now }]
    const insertion = await database('/rest/v1/leads', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        organization_id: organization.id,
        source: 'owner-hub-booking',
        status: urgency === 'urgent' ? 'flagged' : 'unread',
        name,
        phone,
        email,
        service,
        address,
        description: `${description}\n\nRequested timing: ${timing} Priority: ${urgency}.`,
        photo_paths: [],
        activity,
        converted_customer_id: null,
        estimate_id: null,
        submitted_at: now,
        updated_at: now,
      }),
    })
    if (!insertion.ok) throw new Error('The booking request could not be saved.')
    console.info('Public booking request received.', { organizationId: organization.id, leadId: id, urgency })
    return send(response, 201, { received: true, requestId: id })
  } catch (error) {
    console.error('Public booking failed.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 500, { error: 'Your request could not be submitted. Please contact the business directly.' })
  }
}

export const config = { maxDuration: 20 }
