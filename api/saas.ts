import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, requestedOrganizationId } from './_http-security.js'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>
type Json = Record<string, unknown>
type Plan = 'starter' | 'pro' | 'team'

function send(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function setCors(request: ApiRequest, response: ApiResponse) {
  return applyCors(request, response, 'POST, OPTIONS')
}

async function body(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function supabaseConfiguration() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('Cloud administration is not configured.')
  return { url: url.replace(/\/$/, ''), key }
}

async function database(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfiguration()
  return fetch(`${url}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
}

async function authenticatedUser(request: ApiRequest) {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return null
  const { url, key } = supabaseConfiguration()
  const result = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!result.ok) return null
  const user = await result.json() as { id?: string; email?: string }
  return user.id ? { id: user.id, email: user.email ?? '' } : null
}

async function workspace(userId: string, organizationIdHint: string | null) {
  const organizationFilter = organizationIdHint
    ? `&organization_id=eq.${encodeURIComponent(organizationIdHint)}`
    : ''
  const response = await database(`/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}${organizationFilter}&select=organization_id,role&limit=1`)
  if (!response.ok) throw new Error('Workspace membership could not be verified.')
  const memberships = await response.json() as Array<{ organization_id: string; role: string }>
  return memberships[0] ?? null
}

function cleanEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 180) : ''
}

function squareBase() {
  return process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'
}

async function createSquareSubscription(organizationId: string, email: string, plan: Plan) {
  const token = process.env.SQUARE_BILLING_ACCESS_TOKEN?.trim() ?? process.env.SQUARE_ACCESS_TOKEN?.trim()
  const locationId = process.env.SQUARE_BILLING_LOCATION_ID?.trim() ?? process.env.SQUARE_LOCATION_ID?.trim()
  const planVariation = process.env[`SQUARE_SUBSCRIPTION_PLAN_${plan.toUpperCase()}`]?.trim()
  if (!token || !locationId || !planVariation) throw new Error(`The ${plan} billing plan is not configured in Square yet.`)
  const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2026-07-15', 'Content-Type': 'application/json' }

  const existingResponse = await database(`/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}&select=square_customer_id,square_subscription_id&limit=1`)
  const existing = (await existingResponse.json() as Array<{ square_customer_id?: string; square_subscription_id?: string }>)[0]
  if (existing?.square_subscription_id) throw new Error('This workspace already has a Square subscription. Contact support to change it safely.')

  let customerId = existing?.square_customer_id
  if (!customerId) {
    const customerResponse = await fetch(`${squareBase()}/v2/customers`, {
      method: 'POST', headers, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ idempotency_key: createHash('sha256').update(`${organizationId}:${email}`).digest('hex'), email_address: email, reference_id: organizationId }),
    })
    const customerPayload = await customerResponse.json() as { customer?: { id?: string }; errors?: Array<{ detail?: string }> }
    if (!customerResponse.ok || !customerPayload.customer?.id) throw new Error(customerPayload.errors?.[0]?.detail || 'Square could not create the billing customer.')
    customerId = customerPayload.customer.id
  }

  const subscriptionResponse = await fetch(`${squareBase()}/v2/subscriptions`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ idempotency_key: randomBytes(16).toString('hex'), location_id: locationId, customer_id: customerId, plan_variation_id: planVariation, source: { name: 'Owner Hub SaaS' } }),
  })
  const subscriptionPayload = await subscriptionResponse.json() as { subscription?: { id?: string; status?: string }; errors?: Array<{ detail?: string }> }
  if (!subscriptionResponse.ok || !subscriptionPayload.subscription?.id) throw new Error(subscriptionPayload.errors?.[0]?.detail || 'Square could not start the subscription.')

  const update = await database(`/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ plan, status: 'active', square_customer_id: customerId, square_subscription_id: subscriptionPayload.subscription.id, updated_at: new Date().toISOString() }),
  })
  if (!update.ok) throw new Error('The subscription started, but the workspace status could not be saved. Contact support.')
}

async function manageSquareSubscription(organizationId: string, action: 'cancel' | 'resume') {
  const token = process.env.SQUARE_BILLING_ACCESS_TOKEN?.trim() ?? process.env.SQUARE_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('Subscription billing is not configured.')
  const subscriptionRecord = await database(`/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}&select=square_subscription_id&limit=1`)
  const subscriptionId = (await subscriptionRecord.json() as Array<{ square_subscription_id?: string }>)[0]?.square_subscription_id
  if (!subscriptionRecord.ok || !subscriptionId) throw new Error('No Square subscription is attached to this workspace.')
  const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2026-07-15', 'Content-Type': 'application/json' }
  const squareResponse = action === 'cancel'
    ? await fetch(`${squareBase()}/v2/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15_000) })
    : await fetch(`${squareBase()}/v2/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'PUT', headers, body: JSON.stringify({ subscription: { canceled_date: null } }), signal: AbortSignal.timeout(15_000) })
  const squarePayload = await squareResponse.json() as { errors?: Array<{ detail?: string }> }
  if (!squareResponse.ok) throw new Error(squarePayload.errors?.[0]?.detail || `Square could not ${action} the subscription.`)
  const update = await database(`/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cancel_at_period_end: action === 'cancel', updated_at: new Date().toISOString() }) })
  if (!update.ok) throw new Error('Square accepted the change, but subscription status could not be refreshed.')
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!setCors(request, response)) return send(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; return response.end() }
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })

  try {
    const user = await authenticatedUser(request)
    if (!user) return send(response, 401, { error: 'Your secure session expired. Sign in and retry.' })
    const membership = await workspace(user.id, requestedOrganizationId(request))
    if (!membership) return send(response, 403, { error: 'No business workspace is connected.' })
    const payload = await body(request) as Json
    const action = typeof payload.action === 'string' ? payload.action : ''

    if (action === 'accept-invite') {
      const rawToken = typeof payload.token === 'string' ? payload.token.trim() : ''
      if (!rawToken) return send(response, 400, { error: 'The invitation link is incomplete.' })
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const inviteResponse = await database(`/rest/v1/organization_invites?token_hash=eq.${tokenHash}&accepted_at=is.null&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,organization_id,email,role&limit=1`)
      const invites = await inviteResponse.json() as Array<{ id?: string; organization_id?: string; email?: string; role?: string }>
      const invite = invites[0]
      if (!inviteResponse.ok || !invite?.id || !invite.organization_id) return send(response, 410, { error: 'This invitation expired or was already used.' })
      if (cleanEmail(invite.email) !== cleanEmail(user.email)) return send(response, 403, { error: `Sign in as ${invite.email} to accept this invitation.` })
      const subscriptionResponse = await database(`/rest/v1/organization_subscriptions?organization_id=eq.${invite.organization_id}&select=plan&limit=1`)
      const plan = ((await subscriptionResponse.json() as Array<{ plan?: Plan }>)[0]?.plan ?? 'starter') as Plan
      const seatLimit: Record<Plan, number> = { starter: 1, pro: 3, team: 8 }
      const membersResponse = await database(`/rest/v1/organization_members?organization_id=eq.${invite.organization_id}&select=user_id`)
      const existingMembers = await membersResponse.json() as Array<{ user_id?: string }>
      if (existingMembers.length >= seatLimit[plan] && !existingMembers.some((item) => item.user_id === user.id)) {
        return send(response, 409, { error: `The ${plan} plan has no available team seats.` })
      }
      const membershipInsert = await database('/rest/v1/organization_members?on_conflict=organization_id,user_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ organization_id: invite.organization_id, user_id: user.id, role: invite.role === 'admin' ? 'admin' : 'member' }),
      })
      if (!membershipInsert.ok) throw new Error('Team membership could not be created.')
      await database(`/rest/v1/organization_invites?id=eq.${invite.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ accepted_at: new Date().toISOString() }) })
      await database('/rest/v1/audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ organization_id: invite.organization_id, actor_user_id: user.id, action: 'member.joined', entity_type: 'member', entity_id: user.id }) })
      if (membership.organization_id !== invite.organization_id && membership.role === 'owner') {
        const temporaryResponse = await database(`/rest/v1/organizations?id=eq.${membership.organization_id}&name=eq.${encodeURIComponent('Invitation pending')}&select=id&limit=1`)
        const temporary = await temporaryResponse.json() as Array<{ id?: string }>
        const recordsResponse = await database(`/rest/v1/business_records?organization_id=eq.${membership.organization_id}&select=record_id&limit=1`)
        const records = await recordsResponse.json() as Array<{ record_id?: string }>
        if (temporary[0]?.id && records.length === 0) {
          await database(`/rest/v1/organizations?id=eq.${membership.organization_id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        }
      }
      return send(response, 200, { message: 'You joined the business workspace.', organizationId: invite.organization_id })
    }

    const canManage = membership.role === 'owner' || membership.role === 'admin'
    if (!canManage) return send(response, 403, { error: 'Only an owner or administrator can make this change.' })

    if (action === 'create-invite') {
      const email = cleanEmail(payload.email)
      const role = payload.role === 'admin' ? 'admin' : 'member'
      if (!email || !email.includes('@')) return send(response, 400, { error: 'Enter a valid team member email.' })
      const rawToken = randomBytes(32).toString('base64url')
      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      const insertion = await database('/rest/v1/organization_invites', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ organization_id: membership.organization_id, email, role, token_hash: tokenHash, invited_by: user.id }),
      })
      if (!insertion.ok) throw new Error('The invitation could not be created.')
      const origin = (request.headers.origin ?? process.env.OWNER_HUB_PUBLIC_URL ?? '').replace(/\/$/, '')
      return send(response, 200, { inviteUrl: `${origin}/#invite/${encodeURIComponent(rawToken)}` })
    }

    if (action === 'update-member' || action === 'remove-member') {
      if (membership.role !== 'owner') return send(response, 403, { error: 'Only the workspace owner can change team access.' })
      const targetUserId = typeof payload.userId === 'string' ? payload.userId : ''
      if (!targetUserId || targetUserId === user.id) return send(response, 400, { error: 'Choose another team member.' })
      const targetResponse = await database(`/rest/v1/organization_members?organization_id=eq.${membership.organization_id}&user_id=eq.${encodeURIComponent(targetUserId)}&select=role&limit=1`)
      const target = (await targetResponse.json() as Array<{ role?: string }>)[0]
      if (!target || target.role === 'owner') return send(response, 400, { error: 'The workspace owner cannot be changed here.' })
      if (action === 'remove-member') {
        const deletion = await database(`/rest/v1/organization_members?organization_id=eq.${membership.organization_id}&user_id=eq.${encodeURIComponent(targetUserId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
        if (!deletion.ok) throw new Error('The team member could not be removed.')
      } else {
        const nextRole = payload.role === 'admin' ? 'admin' : 'member'
        const update = await database(`/rest/v1/organization_members?organization_id=eq.${membership.organization_id}&user_id=eq.${encodeURIComponent(targetUserId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ role: nextRole }) })
        if (!update.ok) throw new Error('The team role could not be updated.')
      }
      await database('/rest/v1/audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ organization_id: membership.organization_id, actor_user_id: user.id, action: action === 'remove-member' ? 'member.removed' : 'member.role_updated', entity_type: 'member', entity_id: targetUserId }) })
      return send(response, 200, { message: action === 'remove-member' ? 'Team member removed.' : 'Team role updated.' })
    }

    if (action === 'start-subscription') {
      const plan = payload.plan
      if (plan !== 'starter' && plan !== 'pro' && plan !== 'team') return send(response, 400, { error: 'Choose a valid subscription plan.' })
      await createSquareSubscription(membership.organization_id, user.email, plan)
      return send(response, 200, { message: `${plan[0].toUpperCase()}${plan.slice(1)} subscription started. Square will email the billing receipt.` })
    }

    if (action === 'cancel-subscription' || action === 'resume-subscription') {
      if (membership.role !== 'owner') return send(response, 403, { error: 'Only the workspace owner can change subscription renewal.' })
      const operation = action === 'cancel-subscription' ? 'cancel' : 'resume'
      await manageSquareSubscription(membership.organization_id, operation)
      await database('/rest/v1/audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ organization_id: membership.organization_id, actor_user_id: user.id, action: `subscription.${operation}_requested`, entity_type: 'subscription', entity_id: membership.organization_id }) })
      return send(response, 200, { message: operation === 'cancel' ? 'Subscription cancellation scheduled for the end of the billing period.' : 'Subscription renewal restored.' })
    }

    if (action === 'square-oauth-start') {
      const applicationId = process.env.SQUARE_APPLICATION_ID?.trim()
      const redirectUri = process.env.SQUARE_OAUTH_REDIRECT_URI?.trim()
      if (!applicationId || !redirectUri) throw new Error('Square Connect needs its application ID and callback URL configured first.')
      const rawState = randomBytes(32).toString('base64url')
      const stateHash = createHash('sha256').update(rawState).digest('hex')
      const insertion = await database('/rest/v1/integration_oauth_states', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ token_hash: stateHash, organization_id: membership.organization_id, user_id: user.id, provider: 'square' }),
      })
      if (!insertion.ok) throw new Error('The secure Square connection could not be started.')
      const authorizationUrl = new URL(`${squareBase()}/oauth2/authorize`)
      authorizationUrl.searchParams.set('client_id', applicationId)
      authorizationUrl.searchParams.set('scope', 'CUSTOMERS_READ CUSTOMERS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE MERCHANT_PROFILE_READ')
      authorizationUrl.searchParams.set('session', 'false')
      authorizationUrl.searchParams.set('state', rawState)
      return send(response, 200, { authorizationUrl: authorizationUrl.toString() })
    }

    return send(response, 400, { error: 'Unknown workspace action.' })
  } catch (error) {
    console.error('SaaS workspace request failed.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 500, { error: error instanceof Error ? error.message : 'The workspace request failed.' })
  }
}

export const config = { maxDuration: 30 }
