import {
  cleanText,
  database,
  databaseJson,
  decryptSecret,
  isProvider,
  metaGraphVersion,
  oauthStateHash,
  saveConnectionSecrets,
  sendJson,
  upsertConnection,
} from './_content-autopilot-server.js'
import type { ApiRequest, ApiResponse, ContentProvider, Json } from './_content-autopilot-server.js'

function redirect(response: ApiResponse, origin: string, provider: string, outcome: 'success' | 'error', reason = '') {
  const safeOrigin = /^https?:\/\//.test(origin) ? origin.replace(/\/$/, '') : process.env.OWNER_HUB_PUBLIC_URL?.replace(/\/$/, '') ?? 'https://rabbits-foot-owner-hub.vercel.app'
  const url = new URL(safeOrigin)
  url.searchParams.set('contentConnection', outcome)
  url.searchParams.set('provider', provider)
  if (reason) url.searchParams.set('reason', reason)
  url.hash = 'content-autopilot'
  response.statusCode = 302
  response.setHeader('Location', url.toString())
  response.setHeader('Cache-Control', 'no-store')
  response.end()
}

async function exchangeMeta(code: string) {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  const redirectUri = process.env.META_REDIRECT_URI?.trim()
  if (!appId || !appSecret || !redirectUri) throw new Error('meta_oauth_not_configured')
  const shortResponse = await fetch(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token?${new URLSearchParams({
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
  })}`, { signal: AbortSignal.timeout(20_000) })
  const short = await shortResponse.json() as { access_token?: string; expires_in?: number; error?: { message?: string } }
  if (!shortResponse.ok || !short.access_token) throw new Error(short.error?.message ?? 'meta_token_exchange_failed')
  const longResponse = await fetch(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token,
  })}`, { signal: AbortSignal.timeout(20_000) })
  const long = await longResponse.json() as { access_token?: string; expires_in?: number }
  return {
    accessToken: longResponse.ok && long.access_token ? long.access_token : short.access_token,
    expiresIn: longResponse.ok && long.expires_in ? long.expires_in : short.expires_in ?? 3_600,
    refreshToken: '', tokenType: 'Bearer',
  }
}

async function exchangeGoogle(code: string, verifier: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (!clientId || !clientSecret || !redirectUri) throw new Error('google_oauth_not_configured')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier,
      grant_type: 'authorization_code', redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; scope?: string; error?: string }
  if (!response.ok || !payload.access_token) throw new Error(payload.error ?? 'google_token_exchange_failed')
  if (!payload.refresh_token) throw new Error('google_offline_access_missing')
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in ?? 3_600,
    tokenType: payload.token_type ?? 'Bearer',
    scopes: payload.scope?.split(' ').filter(Boolean) ?? [],
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' })
  const url = new URL(request.url ?? '', 'http://owner-hub.local')
  const state = cleanText(url.searchParams.get('state'), 500)
  const code = cleanText(url.searchParams.get('code'), 2_000)
  const oauthError = cleanText(url.searchParams.get('error'), 200)
  let redirectOrigin = process.env.OWNER_HUB_PUBLIC_URL ?? ''
  let provider = ''
  try {
    if (!state) throw new Error('oauth_state_missing')
    const tokenHash = oauthStateHash(state)
    const states = await databaseJson<Json[]>(
      `/rest/v1/content_oauth_states?token_hash=eq.${tokenHash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`,
    )
    const saved = states[0]
    if (!saved || !isProvider(saved.provider)) throw new Error('oauth_state_invalid')
    provider = saved.provider
    redirectOrigin = cleanText(saved.redirect_origin, 500) || redirectOrigin
    const consumed = await database(`/rest/v1/content_oauth_states?token_hash=eq.${tokenHash}&consumed_at=is.null`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    })
    if (!consumed.ok) throw new Error('oauth_state_not_consumed')
    if (oauthError || !code) throw new Error(oauthError || 'oauth_code_missing')
    const token = provider === 'facebook'
      ? await exchangeMeta(code)
      : await exchangeGoogle(code, saved.code_verifier_ciphertext ? decryptSecret(String(saved.code_verifier_ciphertext)) : '')
    const connection = await upsertConnection(String(saved.organization_id), provider as ContentProvider, {
      status: 'pending', scopes: 'scopes' in token ? token.scopes : [],
      token_expires_at: new Date(Date.now() + token.expiresIn * 1_000).toISOString(),
      last_error: null,
    })
    await saveConnectionSecrets(String(connection.id), token)
    redirect(response, redirectOrigin, provider, 'success')
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : 'oauth_failed'
    console.error('Content social OAuth callback failed.', { provider: provider || 'unknown', code: codeValue })
    if (provider) {
      const tokenHash = state ? oauthStateHash(state) : ''
      if (tokenHash) {
        const states = await databaseJson<Json[]>(`/rest/v1/content_oauth_states?token_hash=eq.${tokenHash}&select=organization_id&limit=1`).catch(() => [])
        if (states[0]?.organization_id) {
          await upsertConnection(String(states[0].organization_id), provider as ContentProvider, { status: 'error', last_error: 'OAuth connection failed. Retry from Owner Hub.' }).catch(() => null)
        }
      }
    }
    redirect(response, redirectOrigin, provider || 'unknown', 'error', 'connection_failed')
  }
}

export const config = { maxDuration: 30 }
