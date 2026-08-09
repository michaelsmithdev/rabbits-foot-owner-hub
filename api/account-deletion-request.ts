import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { applyCors, requestedOrganizationId } from './_http-security.js'

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
  if (!url || !key) throw new Error('Deletion requests are temporarily unavailable.')
  return { url: url.replace(/\/$/, ''), key }
}

async function database(path: string, init: RequestInit = {}) {
  const { url, key } = configuration()
  return fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(12_000) })
}

async function readBody(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

async function userFromRequest(request: ApiRequest) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7).trim() : ''
  if (!token) return null
  const { url, key } = configuration()
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) return null
  const user = await response.json() as { id?: string; email?: string }
  return user.id && user.email ? { id: user.id, email: user.email } : null
}

async function ownedOrganization(userId: string, organizationId: string | null) {
  if (!organizationId) return null
  const response = await database(`/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}&organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner&select=organization_id&limit=1`)
  if (!response.ok) throw new Error('Workspace ownership could not be verified.')
  const memberships = await response.json() as Array<{ organization_id?: string }>
  return memberships[0]?.organization_id ?? null
}

function rateLimited(request: ApiRequest) {
  const address = String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',')[0].trim()
  const key = createHash('sha256').update(address).digest('hex').slice(0, 24)
  const now = Date.now()
  const current = attempts.get(key)
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 }); return false }
  current.count += 1
  return current.count > 5
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!applyCors(request, response, 'POST, OPTIONS')) return send(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end() }
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  if (rateLimited(request)) return send(response, 429, { error: 'Too many requests. Retry later.' })

  try {
    const payload = await readBody(request) as { email?: unknown; reason?: unknown; source?: unknown; action?: unknown }
    const user = await userFromRequest(request)
    const requestedEmail = (user?.email ?? (typeof payload.email === 'string' ? payload.email : '')).trim().toLowerCase().slice(0, 180)
    if (!requestedEmail || !/^\S+@\S+\.\S+$/.test(requestedEmail)) return send(response, 400, { error: 'Enter the email used for the Owner Hub account.' })
    const requestedWorkspace = user ? requestedOrganizationId(request) : null
    const organizationId = user ? await ownedOrganization(user.id, requestedWorkspace) : null
    if (requestedWorkspace && !organizationId) return send(response, 403, { error: 'Only the workspace owner can request deletion of business records.' })

    if (payload.action === 'cancel') {
      if (!user) return send(response, 401, { error: 'Sign in to cancel a deletion request.' })
      const cancelResponse = await database(`/rest/v1/account_deletion_requests?user_id=eq.${encodeURIComponent(user.id)}&status=eq.pending`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() }) })
      if (!cancelResponse.ok) throw new Error('The deletion request could not be canceled.')
      return send(response, 200, { message: 'Account deletion request canceled.' })
    }

    const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 800) : ''
    const existingResponse = await database(`/rest/v1/account_deletion_requests?requested_email=eq.${encodeURIComponent(requestedEmail)}&status=in.(pending,verified,processing)&select=id&limit=1`)
    if (!existingResponse.ok) throw new Error('Existing deletion requests could not be checked.')
    const existing = await existingResponse.json() as Array<{ id?: string }>
    if (existing[0]?.id) return send(response, 202, { message: 'Your deletion request was received. We will verify account ownership before processing it.' })
    const dueAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const insertion = await database('/rest/v1/account_deletion_requests', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: user?.id ?? null, organization_id: organizationId, requested_email: requestedEmail, reason, source: typeof payload.source === 'string' ? payload.source.slice(0, 40) : user ? 'in-app' : 'public-web', status: 'pending', due_at: dueAt }) })
    if (!insertion.ok) throw new Error('The deletion request could not be recorded.')
    console.info('Account deletion request recorded.', { authenticated: Boolean(user), organizationId, dueAt })
    return send(response, 202, { message: 'Your deletion request was received. We will verify account ownership before processing it.' })
  } catch (error) {
    console.error('Account deletion request failed.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 500, { error: 'The request could not be submitted. Contact support if this continues.' })
  }
}

export const config = { maxDuration: 20 }
