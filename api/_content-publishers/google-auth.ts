import type { Json } from '../_content-autopilot-server.js'
import { database, encryptSecret } from '../_content-autopilot-server.js'

export async function freshGoogleAccessToken(input: {
  connection: Json
  accessToken: string
  refreshToken: string
}): Promise<string> {
  const expiresAt = typeof input.connection.token_expires_at === 'string'
    ? new Date(input.connection.token_expires_at).getTime()
    : 0
  if (input.accessToken && expiresAt > Date.now() + 60_000) return input.accessToken
  if (!input.refreshToken) throw new Error('authorization_expired')
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('google_oauth_not_configured')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!response.ok || !payload.access_token) throw new Error(payload.error ?? 'authorization_expired')
  const connectionId = String(input.connection.id ?? '')
  const expiresAtValue = new Date(Date.now() + (payload.expires_in ?? 3_600) * 1_000).toISOString()
  const [secretUpdate, connectionUpdate] = await Promise.all([
    database(`/rest/v1/content_social_secrets?connection_id=eq.${encodeURIComponent(connectionId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ access_token_ciphertext: encryptSecret(payload.access_token), updated_at: new Date().toISOString() }),
    }),
    database(`/rest/v1/content_social_connections?id=eq.${encodeURIComponent(connectionId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ token_expires_at: expiresAtValue, status: 'connected', last_error: null, updated_at: new Date().toISOString() }),
    }),
  ])
  if (!secretUpdate.ok || !connectionUpdate.ok) throw new Error('refreshed_token_not_saved')
  return payload.access_token
}

