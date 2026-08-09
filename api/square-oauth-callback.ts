import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

type ApiRequest = IncomingMessage
type ApiResponse = ServerResponse<IncomingMessage>

function databaseConfiguration() {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('cloud_not_configured')
  return { url: url.replace(/\/$/, ''), key }
}

async function database(path: string, init: RequestInit = {}) {
  const { url, key } = databaseConfiguration()
  return fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) })
}

function encrypt(value: string) {
  const secret = process.env.SQUARE_TOKEN_ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 32) throw new Error('encryption_not_configured')
  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

function redirect(response: ApiResponse, status: 'connected' | 'error') {
  const origin = (process.env.OWNER_HUB_PUBLIC_URL ?? process.env.SQUARE_OAUTH_REDIRECT_URI?.replace(/\/api\/square-oauth-callback.*$/, '') ?? '').replace(/\/$/, '')
  response.statusCode = 302
  response.setHeader('Set-Cookie', `owner_hub_square_status=${status}; Max-Age=120; Path=/; SameSite=Lax; Secure`)
  response.setHeader('Location', `${origin}/#business`)
  response.end()
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  try {
    const requestUrl = new URL(request.url ?? '', `https://${request.headers.host ?? 'localhost'}`)
    const code = requestUrl.searchParams.get('code') ?? ''
    const state = requestUrl.searchParams.get('state') ?? ''
    if (!code || !state) throw new Error('missing_oauth_response')
    const stateHash = createHash('sha256').update(state).digest('hex')
    const stateResponse = await database(`/rest/v1/integration_oauth_states?token_hash=eq.${stateHash}&provider=eq.square&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=organization_id&limit=1`)
    const states = await stateResponse.json() as Array<{ organization_id?: string }>
    const organizationId = states[0]?.organization_id
    if (!stateResponse.ok || !organizationId) throw new Error('invalid_oauth_state')

    const applicationId = process.env.SQUARE_APPLICATION_ID?.trim()
    const applicationSecret = process.env.SQUARE_APPLICATION_SECRET?.trim()
    const redirectUri = process.env.SQUARE_OAUTH_REDIRECT_URI?.trim()
    if (!applicationId || !applicationSecret || !redirectUri) throw new Error('square_oauth_not_configured')
    const sandbox = process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() === 'sandbox'
    const base = sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com'
    const tokenResponse = await fetch(`${base}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Square-Version': '2026-07-15' }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ client_id: applicationId, client_secret: applicationSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri, short_lived: false }),
    })
    const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_at?: string; merchant_id?: string; errors?: Array<{ detail?: string }> }
    if (!tokenResponse.ok || !token.access_token || !token.merchant_id) throw new Error(token.errors?.[0]?.detail || 'square_token_exchange_failed')

    const locationsResponse = await fetch(`${base}/v2/locations`, { headers: { Authorization: `Bearer ${token.access_token}`, 'Square-Version': '2026-07-15' }, signal: AbortSignal.timeout(15_000) })
    const locationsPayload = await locationsResponse.json() as { locations?: Array<{ id?: string; status?: string }> }
    const locationId = locationsPayload.locations?.find((item) => item.status === 'ACTIVE')?.id ?? locationsPayload.locations?.[0]?.id
    if (!locationId) throw new Error('square_location_missing')

    const secretsResponse = await database('/rest/v1/integration_secrets?on_conflict=organization_id,provider', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ organization_id: organizationId, provider: 'square', access_token_ciphertext: encrypt(token.access_token), refresh_token_ciphertext: token.refresh_token ? encrypt(token.refresh_token) : null, expires_at: token.expires_at ?? null, updated_at: new Date().toISOString() }),
    })
    if (!secretsResponse.ok) throw new Error('square_secret_save_failed')
    const connectionResponse = await database('/rest/v1/integration_connections?on_conflict=organization_id,provider', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ organization_id: organizationId, provider: 'square', status: 'connected', merchant_id: token.merchant_id, location_id: locationId, connected_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }),
    })
    if (!connectionResponse.ok) throw new Error('square_connection_save_failed')
    await database(`/rest/v1/integration_oauth_states?token_hash=eq.${stateHash}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ consumed_at: new Date().toISOString() }) })
    return redirect(response, 'connected')
  } catch (error) {
    console.error('Square OAuth callback failed.', error instanceof Error ? error.message : 'Unknown error')
    return redirect(response, 'error')
  }
}
