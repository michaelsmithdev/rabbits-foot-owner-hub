import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import OpenAI from 'openai'
import { applyCors, requestedOrganizationId } from './_http-security.js'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>

const MAX_BODY_BYTES = 24_000
const MAX_REQUESTS_PER_MINUTE = 6
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const briefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'priority', 'watchouts'],
  properties: {
    headline: { type: 'string', maxLength: 100 },
    summary: { type: 'string', maxLength: 500 },
    priority: { type: 'string', maxLength: 240 },
    watchouts: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 180 } },
  },
} as const

function sendJson(response: ApiResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

async function readBody(request: ApiRequest) {
  if (request.body !== undefined) return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function parseRequest(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const input = value as { summary?: unknown; observations?: unknown }
  if (!input.summary || typeof input.summary !== 'object' || Array.isArray(input.summary)) return null
  const summary = Object.fromEntries(Object.entries(input.summary as Record<string, unknown>).flatMap(([key, raw]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) return []
    if (typeof raw === 'number' && Number.isFinite(raw)) return [[key, Math.round(raw * 100) / 100]]
    if (typeof raw === 'string') return [[key, raw.slice(0, 120)]]
    return []
  }).slice(0, 20))
  const observations = Array.isArray(input.observations)
    ? input.observations.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 240)).filter(Boolean).slice(0, 12)
    : []
  return Object.keys(summary).length > 0 ? { summary, observations } : null
}

async function verifyUser(accessToken: string) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  const result = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return null
  const payload: unknown = await result.json()
  return payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string' ? (payload as { id: string }).id : null
}

async function verifyWorkspace(userId: string, organizationId: string | null) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key || !organizationId) return false
  const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=organization_id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return false
  const rows = await result.json() as Array<{ organization_id?: string }>
  return rows[0]?.organization_id === organizationId
}

function isRateLimited(userId: string) {
  const now = Date.now()
  const current = rateLimits.get(userId)
  if (!current || now >= current.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + 60_000 })
    return false
  }
  current.count += 1
  return current.count > MAX_REQUESTS_PER_MINUTE
}

function cleanResult(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  const text = (input: unknown, max: number) => typeof input === 'string' ? input.trim().slice(0, max) : ''
  const headline = text(result.headline, 100)
  const summary = text(result.summary, 500)
  const priority = text(result.priority, 240)
  if (!headline || !summary || !priority) return null
  return {
    headline, summary, priority,
    watchouts: Array.isArray(result.watchouts) ? result.watchouts.map((item) => text(item, 180)).filter(Boolean).slice(0, 3) : [],
  }
}

export async function handleAiOperations(request: ApiRequest, response: ApiResponse) {
  if (!applyCors(request, response, 'POST, OPTIONS')) return sendJson(response, 403, { error: 'This request origin is not allowed.' })
  if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return }
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' })
  const authorization = request.headers.authorization
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!accessToken) return sendJson(response, 401, { error: 'Sign in before requesting an AI brief.' })

  let userId: string | null
  try { userId = await verifyUser(accessToken) } catch { return sendJson(response, 503, { error: 'Secure authentication is temporarily unavailable.' }) }
  if (!userId) return sendJson(response, 401, { error: 'Your secure session expired. Sign in and retry.' })
  try {
    if (!await verifyWorkspace(userId, requestedOrganizationId(request))) return sendJson(response, 403, { error: 'No business workspace is connected to this account.' })
  } catch { return sendJson(response, 503, { error: 'Your business workspace could not be verified.' }) }
  if (isRateLimited(userId)) return sendJson(response, 429, { error: 'Too many AI brief requests. Wait one minute and retry.' })

  let input: ReturnType<typeof parseRequest>
  try { input = parseRequest(await readBody(request)) } catch (error) { return sendJson(response, error instanceof Error && error.message === 'request_too_large' ? 413 : 400, { error: 'The operations summary was not valid.' }) }
  if (!input) return sendJson(response, 400, { error: 'A compact business summary is required.' })
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return sendJson(response, 503, { error: 'AI briefing is not configured. The deterministic operations brief is still available.' })

  try {
    const model = process.env.OPENAI_OPERATIONS_MODEL?.trim() || process.env.OPENAI_ESTIMATE_MODEL?.trim() || 'gpt-5.4-mini'
    const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 })
    const result = await openai.responses.create({
      model,
      instructions: 'You are the private operations analyst for a handyman business owner. Use only the supplied structured facts. Never invent customers, revenue, costs, dates, promises, prices, or completed actions. Give one concise priority. Treat recommendations as owner-review suggestions, not authority to execute. Never recommend automatic payments, refunds, deletion, balance changes, accounting edits, or business-configuration changes.',
      input: JSON.stringify(input),
      reasoning: { effort: 'low' },
      text: { verbosity: 'low', format: { type: 'json_schema', name: 'owner_hub_operations_brief', strict: true, schema: briefSchema } },
      max_output_tokens: 700,
      store: false,
      safety_identifier: createHash('sha256').update(userId).digest('hex'),
    })
    const cleaned = cleanResult(JSON.parse(result.output_text))
    if (!cleaned) throw new Error('invalid_model_response')
    sendJson(response, 200, cleaned)
  } catch (error) {
    console.error('AI operations brief failed.', { name: error instanceof Error ? error.name : 'UnknownError', status: error instanceof OpenAI.APIError ? error.status : undefined })
    sendJson(response, error instanceof OpenAI.APIError && error.status === 429 ? 429 : 502, { error: 'AI briefing is temporarily unavailable. The normal Owner Hub recommendations still work.' })
  }
}
