import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import OpenAI, { toFile } from 'openai'
import { applyCors, requestedOrganizationId } from './_http-security.ts'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>

const MAX_BODY_BYTES = 3_700_000
const MAX_AUDIO_BYTES = 2_500_000
const MAX_REQUESTS_PER_MINUTE = 10
const rateLimits = new Map<string, { count: number; resetAt: number }>()
const allowedMimeTypes = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
])

function setCors(request: ApiRequest, response: ApiResponse): boolean {
  return applyCors(request, response, 'POST, OPTIONS')
}

function sendJson(response: ApiResponse, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

async function readBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    return typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  }

  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function verifyUser(accessToken: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!supabaseUrl || !supabaseKey) throw new Error('supabase_not_configured')

  const result = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return null
  const payload: unknown = await result.json()
  return payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
    ? (payload as { id: string }).id
    : null
}

async function serviceDatabase(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_service_not_configured')
  return fetch(`${url.replace(/\/$/, '')}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(10_000) })
}

async function checkTranscriptionEntitlement(userId: string, organizationIdHint: string | null) {
  const organizationFilter = organizationIdHint
    ? `&organization_id=eq.${encodeURIComponent(organizationIdHint)}`
    : ''
  const membershipResponse = await serviceDatabase(`/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}${organizationFilter}&select=organization_id&limit=1`)
  const organizationId = ((await membershipResponse.json() as Array<{ organization_id?: string }>)[0]?.organization_id)
  if (!membershipResponse.ok || !organizationId) throw new Error('workspace_not_found')
  const subscriptionResponse = await serviceDatabase(`/rest/v1/organization_subscriptions?organization_id=eq.${organizationId}&select=plan,status,trial_ends_at&limit=1`)
  const subscription = (await subscriptionResponse.json() as Array<{ plan?: string; status?: string; trial_ends_at?: string | null }>)[0]
  const trialValid = subscription?.status === 'trialing' && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at).getTime() > Date.now())
  if (!subscriptionResponse.ok || !subscription || (subscription.status !== 'active' && !trialValid)) throw new Error('subscription_inactive')
  const limits: Record<string, number> = { starter: 30, pro: 200, team: 600 }
  const limit = limits[subscription.plan ?? 'starter'] ?? limits.starter
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const usageResponse = await serviceDatabase(`/rest/v1/usage_events?organization_id=eq.${organizationId}&event_type=eq.ai_transcription&occurred_at=gte.${encodeURIComponent(monthStart.toISOString())}&select=quantity`)
  const usage = usageResponse.ok ? await usageResponse.json() as Array<{ quantity?: number }> : []
  if (usage.reduce((sum, item) => sum + (item.quantity ?? 0), 0) >= limit) throw new Error('transcription_limit_reached')
  return organizationId
}

async function recordTranscriptionUsage(organizationId: string, model: string, durationBytes: number) {
  await serviceDatabase('/rest/v1/usage_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ organization_id: organizationId, event_type: 'ai_transcription', quantity: 1, metadata: { model, bytes: durationBytes } }) })
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

function parseAudio(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const body = value as { audioBase64?: unknown; mimeType?: unknown; fileName?: unknown }
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.split(';')[0].toLowerCase() : ''
  const fileName = typeof body.fileName === 'string'
    ? body.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100)
    : 'owner-hub-recording.webm'

  if (!audioBase64 || !/^[a-zA-Z0-9+/=]+$/.test(audioBase64) || !allowedMimeTypes.has(mimeType)) return null
  const buffer = Buffer.from(audioBase64, 'base64')
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) return null
  return { buffer, mimeType, fileName }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!setCors(request, response)) {
    sendJson(response, 403, { error: 'This request origin is not allowed.' })
    return
  }
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS')
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  const authorization = request.headers.authorization
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!accessToken) {
    sendJson(response, 401, { error: 'Sign in before transcribing a recording.' })
    return
  }

  let userId: string | null
  try {
    userId = await verifyUser(accessToken)
  } catch {
    sendJson(response, 503, { error: 'Secure authentication is temporarily unavailable.' })
    return
  }
  if (!userId) {
    sendJson(response, 401, { error: 'Your secure session expired. Sign in and retry.' })
    return
  }
  let organizationId: string
  try {
    organizationId = await checkTranscriptionEntitlement(userId, requestedOrganizationId(request))
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    console.error('Voice transcription entitlement check failed.', { code })
    sendJson(response, code === 'transcription_limit_reached' ? 429 : code === 'subscription_inactive' ? 402 : 503, {
      error: code === 'transcription_limit_reached'
        ? 'This month’s voice transcription allowance has been used. Upgrade the plan or type the note.'
        : code === 'subscription_inactive'
          ? 'Choose an active plan in Business & billing to use voice transcription.'
          : 'Your voice allowance could not be verified. Retry shortly.',
    })
    return
  }
  if (isRateLimited(userId)) {
    response.setHeader('Retry-After', '60')
    sendJson(response, 429, { error: 'Too many transcription requests. Wait one minute and retry.' })
    return
  }

  let audio: ReturnType<typeof parseAudio>
  try {
    audio = parseAudio(await readBody(request))
  } catch (error) {
    sendJson(response, error instanceof Error && error.message === 'request_too_large' ? 413 : 400, {
      error: 'The recording request was not valid.',
    })
    return
  }
  if (!audio) {
    sendJson(response, 400, { error: 'Use a supported recording no larger than 2.5 MB.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    sendJson(response, 503, { error: 'Voice transcription has not been configured yet.' })
    return
  }

  try {
    const openai = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 1 })
    const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || 'gpt-4o-transcribe'
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(audio.buffer, audio.fileName, { type: audio.mimeType }),
      model,
      language: 'en',
      response_format: 'json',
      prompt: [
        'English contractor job-site note.',
        'Transcribe only what the speaker says; do not guess or rewrite the scope.',
        'Measurements, quantities, fractions, model numbers, and product sizes must be preserved exactly.',
        'Use clear contractor notation: 32-inch screen door, 36-inch screen door, 2x4, 3/4-inch, 8 feet 2 inches.',
        'Expected vocabulary includes screen door, storm door, rough opening, jamb, frame, trim, drywall, outlet, plumbing, labor, materials, remove, replace, install, repair, customer-supplied, disposal, and haul-away.',
      ].join(' '),
    })
    const cleanTranscript = transcription.text.trim().slice(0, 12_000)
    if (!cleanTranscript) throw new Error('empty_transcript')
    await recordTranscriptionUsage(organizationId, model, audio.buffer.length)
    sendJson(response, 200, {
      transcript: cleanTranscript,
      recordingId: createHash('sha256').update(`${userId}:${audio.fileName}`).digest('hex').slice(0, 16),
    })
  } catch (error) {
    console.error('Voice transcription failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      status: error instanceof OpenAI.APIError ? error.status : undefined,
    })
    sendJson(response, 502, { error: 'The recording is saved, but transcription is temporarily unavailable. Retry it.' })
  }
}

export const config = { maxDuration: 60 }
