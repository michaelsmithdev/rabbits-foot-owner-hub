import { createDecipheriv, createHash } from 'node:crypto'

function decrypt(value) {
  const secret = process.env.SQUARE_TOKEN_ENCRYPTION_KEY?.trim()
  if (!secret || secret.length < 32) throw new Error('square_encryption_not_configured')
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('square_credential_invalid')
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
}

async function serviceRequest(path) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  return fetch(`${url.replace(/\/$/, '')}${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000) })
}

export async function getSquareMerchantCredentials(organizationId) {
  const [connectionResponse, secretResponse] = await Promise.all([
    serviceRequest(`/rest/v1/integration_connections?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.square&status=eq.connected&select=location_id&limit=1`),
    serviceRequest(`/rest/v1/integration_secrets?organization_id=eq.${encodeURIComponent(organizationId)}&provider=eq.square&select=access_token_ciphertext&limit=1`),
  ])
  if (connectionResponse.ok && secretResponse.ok) {
    const connections = await connectionResponse.json()
    const secrets = await secretResponse.json()
    if (connections[0]?.location_id && secrets[0]?.access_token_ciphertext) {
      return { token: decrypt(secrets[0].access_token_ciphertext), locationId: connections[0].location_id, baseUrl: squareBaseUrl() }
    }
  }
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim()
  const locationId = process.env.SQUARE_LOCATION_ID?.trim()
  if (!token || !locationId) throw new Error('square_not_configured')
  return { token, locationId, baseUrl: squareBaseUrl() }
}

function squareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase() === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'
}
