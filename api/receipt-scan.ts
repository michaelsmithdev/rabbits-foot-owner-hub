import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

import OpenAI from 'openai'
import { applyCors, requestedOrganizationId } from './_http-security.js'

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse<IncomingMessage>

const MAX_BODY_BYTES = 500_000
const MAX_REQUESTS_PER_MINUTE = 10
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'purchaseDate', 'subtotal', 'tax', 'total', 'paymentMethod', 'receiptNumber', 'storeLocation', 'suggestedCategory', 'description', 'confidence', 'fieldConfidence', 'lineItems', 'warnings'],
  properties: {
    merchant: { type: 'string', maxLength: 160 },
    purchaseDate: { type: 'string', maxLength: 10 },
    subtotal: { type: 'number', minimum: 0 },
    tax: { type: 'number', minimum: 0 },
    total: { type: 'number', minimum: 0 },
    paymentMethod: { type: 'string', maxLength: 80 },
    receiptNumber: { type: 'string', maxLength: 100 },
    storeLocation: { type: 'string', maxLength: 180 },
    suggestedCategory: { type: 'string', enum: ['materials', 'tools', 'fuel', 'vehicle', 'subcontractor', 'equipment_rental', 'office', 'advertising', 'software', 'insurance', 'permits', 'miscellaneous'] },
    description: { type: 'string', maxLength: 240 },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    fieldConfidence: {
      type: 'object',
      additionalProperties: false,
      required: ['merchant', 'purchaseDate', 'subtotal', 'tax', 'total', 'paymentMethod', 'receiptNumber'],
      properties: {
        merchant: { type: 'number', minimum: 0, maximum: 1 },
        purchaseDate: { type: 'number', minimum: 0, maximum: 1 },
        subtotal: { type: 'number', minimum: 0, maximum: 1 },
        tax: { type: 'number', minimum: 0, maximum: 1 },
        total: { type: 'number', minimum: 0, maximum: 1 },
        paymentMethod: { type: 'number', minimum: 0, maximum: 1 },
        receiptNumber: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    lineItems: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unitPrice', 'amount', 'confidence'],
        properties: {
          description: { type: 'string', maxLength: 180 },
          quantity: { type: ['number', 'null'], minimum: 0 },
          unitPrice: { type: ['number', 'null'], minimum: 0 },
          amount: { type: 'number', minimum: 0 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
    warnings: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 180 } },
  },
} as const

const instructions = `Read only visible facts on this business receipt image. Never guess a merchant, date, amount, payment method, receipt number, store location, quantity, unit price, or line item that is not legible. Use an empty string, zero, or null for unreadable values and add a short warning. Use YYYY-MM-DD for a legible date. Classify expenses as exactly one of: materials, tools, fuel, vehicle, subcontractor, equipment_rental, office, advertising, software, insurance, permits, miscellaneous. Total must be the printed final receipt total, not a credit-card balance or savings amount. Give each important field and line item a confidence score from 0 to 1. The result is a draft and will be reviewed by the owner before any financial record is saved.`

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

function parseRequest(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const input = value as { fileName?: unknown; dataUrl?: unknown }
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 120) : 'receipt.jpg'
  const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl.trim() : ''
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 400_000) return null
  return { fileName, dataUrl }
}

async function verifyUser(accessToken: string) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_not_configured')
  const result = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!result.ok) return null
  const payload: unknown = await result.json()
  return payload && typeof payload === 'object' && typeof (payload as { id?: unknown }).id === 'string'
    ? (payload as { id: string }).id
    : null
}

async function verifyWorkspace(userId: string, organizationId: string | null) {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.VITE_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) throw new Error('supabase_service_not_configured')
  const organizationFilter = organizationId ? `&organization_id=eq.${encodeURIComponent(organizationId)}` : ''
  const result = await fetch(`${url.replace(/\/$/, '')}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}${organizationFilter}&select=organization_id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  })
  const rows = result.ok ? await result.json() as Array<{ organization_id?: string }> : []
  return rows[0]?.organization_id ?? null
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
  const number = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.round(input * 100) / 100 : 0
  const text = (input: unknown, maximum: number) => typeof input === 'string' ? input.trim().slice(0, maximum) : ''
  const allowedCategories = [
    'materials', 'tools', 'fuel', 'vehicle', 'subcontractor',
    'equipment_rental', 'office', 'advertising', 'software', 'insurance',
    'permits', 'miscellaneous',
  ]
  const category = allowedCategories.includes(String(result.suggestedCategory))
    ? result.suggestedCategory
    : 'miscellaneous'
  const confidence = ['high', 'medium', 'low'].includes(String(result.confidence)) ? result.confidence : 'low'

  return {
    merchant: text(result.merchant, 160),
    purchaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(result.purchaseDate)) ? result.purchaseDate : '',
    subtotal: number(result.subtotal),
    tax: number(result.tax),
    total: number(result.total),
    paymentMethod: text(result.paymentMethod, 80),
    receiptNumber: text(result.receiptNumber, 100),
    storeLocation: text(result.storeLocation, 180),
    suggestedCategory: category,
    description: text(result.description, 240),
    confidence,
    fieldConfidence: (() => {
      const raw = result.fieldConfidence && typeof result.fieldConfidence === 'object'
        ? result.fieldConfidence as Record<string, unknown>
        : {}
      const score = (input: unknown) => typeof input === 'number' && Number.isFinite(input)
        ? Math.min(1, Math.max(0, Math.round(input * 100) / 100))
        : 0
      return {
        merchant: score(raw.merchant),
        purchaseDate: score(raw.purchaseDate),
        subtotal: score(raw.subtotal),
        tax: score(raw.tax),
        total: score(raw.total),
        paymentMethod: score(raw.paymentMethod),
        receiptNumber: score(raw.receiptNumber),
      }
    })(),
    lineItems: Array.isArray(result.lineItems) ? result.lineItems.slice(0, 30).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const line = item as Record<string, unknown>
      const description = text(line.description, 180)
      const optionalNumber = (input: unknown) => typeof input === 'number' && Number.isFinite(input) && input >= 0
        ? Math.round(input * 100) / 100
        : null
      const itemConfidence = typeof line.confidence === 'number' && Number.isFinite(line.confidence)
        ? Math.min(1, Math.max(0, Math.round(line.confidence * 100) / 100))
        : 0
      return description ? [{
        description,
        quantity: optionalNumber(line.quantity),
        unitPrice: optionalNumber(line.unitPrice),
        amount: number(line.amount),
        confidence: itemConfidence,
      }] : []
    }) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map((item) => text(item, 180)).filter(Boolean).slice(0, 4) : [],
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!applyCors(request, response, 'POST, OPTIONS')) {
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
    sendJson(response, 401, { error: 'Sign in before scanning a receipt.' })
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
  try {
    const organizationId = await verifyWorkspace(userId, requestedOrganizationId(request))
    if (!organizationId) {
      sendJson(response, 403, { error: 'No business workspace is connected to this account.' })
      return
    }
  } catch {
    sendJson(response, 503, { error: 'Your business workspace could not be verified.' })
    return
  }
  if (isRateLimited(userId)) {
    response.setHeader('Retry-After', '60')
    sendJson(response, 429, { error: 'Too many receipt scans. Wait one minute and retry.' })
    return
  }

  let input: ReturnType<typeof parseRequest>
  try {
    input = parseRequest(await readBody(request))
  } catch (error) {
    sendJson(response, error instanceof Error && error.message === 'request_too_large' ? 413 : 400, { error: 'The receipt image was not valid.' })
    return
  }
  if (!input) {
    sendJson(response, 400, { error: 'Choose a clear JPG, PNG, or WebP receipt image.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    sendJson(response, 503, { error: 'Receipt scanning is not configured yet. Enter the receipt manually.' })
    return
  }

  try {
    const model = process.env.OPENAI_RECEIPT_MODEL?.trim() || process.env.OPENAI_ESTIMATE_MODEL?.trim() || 'gpt-5.4-mini'
    const openai = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 0 })
    const result = await openai.responses.create({
      model,
      instructions,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: `Read the attached business receipt named ${input.fileName}.` },
          { type: 'input_image', image_url: input.dataUrl, detail: 'high' },
        ],
      }],
      reasoning: { effort: 'low' },
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'owner_hub_receipt',
          description: 'Visible receipt facts for owner review.',
          strict: true,
          schema: receiptSchema,
        },
      },
      max_output_tokens: 1_500,
      store: false,
      safety_identifier: createHash('sha256').update(userId).digest('hex'),
    })
    const cleaned = cleanResult(JSON.parse(result.output_text))
    if (!cleaned) throw new Error('invalid_model_response')
    sendJson(response, 200, cleaned)
  } catch (error) {
    console.error('Receipt scan failed.', {
      name: error instanceof Error ? error.name : 'UnknownError',
      status: error instanceof OpenAI.APIError ? error.status : undefined,
    })
    if (error instanceof OpenAI.APIError && error.status === 429) {
      sendJson(response, 429, { error: 'The scanner is temporarily busy. Wait briefly, retry, or enter the receipt manually.' })
      return
    }
    sendJson(response, 502, { error: 'The receipt could not be read reliably. Enter the details manually or retry with a clearer photo.' })
  }
}

export const config = { maxDuration: 45 }
