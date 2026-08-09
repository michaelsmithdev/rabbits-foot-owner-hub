import type { IncomingMessage, ServerResponse } from 'node:http'

type HealthResponse = ServerResponse<IncomingMessage>

export default async function handler(request: IncomingMessage, response: HealthResponse) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET, HEAD')
    return response.end(JSON.stringify({ status: 'method_not_allowed' }))
  }
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const required = { database: Boolean(url && key), openai: Boolean(process.env.OPENAI_API_KEY?.trim()), square: Boolean(process.env.SQUARE_ACCESS_TOKEN?.trim() && process.env.SQUARE_LOCATION_ID?.trim()) }
  let databaseReachable = false
  if (url && key) {
    try {
      const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/organizations?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000) })
      databaseReachable = result.ok
    } catch { databaseReachable = false }
  }
  const healthy = required.database && databaseReachable
  response.statusCode = healthy ? 200 : 503
  if (request.method === 'HEAD') return response.end()
  response.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded', checkedAt: new Date().toISOString(), services: { database: databaseReachable, aiConfigured: required.openai, customerPaymentsConfigured: required.square } }))
}

export const config = { maxDuration: 10 }
