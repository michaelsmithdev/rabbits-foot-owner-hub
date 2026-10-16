import type { ServerResponse } from 'node:http'
import { Resend } from 'resend'

import { applyCors } from './_http-security.js'
import {
  type ApiRequest,
  authenticatedWorkspace,
  buildDocumentEmail,
  cleanText,
  database,
  loadBusinessRecord,
  normalizedRecipient,
  readBody,
} from './_email-core.js'

type ApiResponse = ServerResponse

function send(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function errorMessage(status: number) {
  if (status === 429) return 'Too many email attempts. Please wait a moment and try again.'
  if (status === 401 || status === 403) return 'Sign in again before sending email.'
  if (status === 422) return "Email could not be delivered. Check the customer's email address and try again."
  return 'Email could not be sent right now. Please try again.'
}

async function existingRequest(organizationId: string, idempotencyKey: string) {
  const result = await database(
    `/rest/v1/email_delivery_logs?organization_id=eq.${organizationId}` +
    `&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}` +
    '&select=id,status,provider_message_id&limit=1',
  )
  if (!result.ok) throw new Error('Email delivery logging is not available.')
  const rows = await result.json() as Array<{ id?: string; status?: string; provider_message_id?: string }>
  return rows[0] ?? null
}

async function isRateLimited(organizationId: string, recipient: string) {
  const since = new Date(Date.now() - 5 * 60_000).toISOString()
  const result = await database(
    `/rest/v1/email_delivery_logs?organization_id=eq.${organizationId}` +
    `&recipient=eq.${encodeURIComponent(recipient)}&created_at=gte.${encodeURIComponent(since)}` +
    '&select=id&limit=6',
  )
  if (!result.ok) throw new Error('Email rate limits could not be checked.')
  return ((await result.json()) as unknown[]).length >= 5
}

async function blockedByDeliveryHistory(
  organizationId: string,
  customerId: string,
  recipient: string,
) {
  const result = await database(
    `/rest/v1/customer_email_health?organization_id=eq.${organizationId}` +
    `&customer_id=eq.${encodeURIComponent(customerId)}&email=eq.${encodeURIComponent(recipient)}` +
    '&status=in.(bounced,complained,suppressed)&select=status&limit=1',
  )
  if (!result.ok) throw new Error('Email delivery health could not be checked.')
  const rows = await result.json() as Array<{ status?: string }>
  return rows[0]?.status ?? ''
}

async function updateLog(id: string, values: Record<string, unknown>) {
  await database(`/rest/v1/email_delivery_logs?id=eq.${encodeURIComponent(id)}`, {
    body: JSON.stringify(values),
    headers: { Prefer: 'return=minimal' },
    method: 'PATCH',
  })
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!applyCors(request, response, 'POST, OPTIONS')) return
  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })

  let logId = ''
  try {
    const workspace = await authenticatedWorkspace(request)
    if (!workspace) return send(response, 401, { error: errorMessage(401), code: 'unauthorized' })
    const body = await readBody(request)
    const type = body.type === 'invoice' ? 'invoice' : body.type === 'estimate' ? 'estimate' : ''
    const customerId = cleanText(body.customerId, 160)
    const documentId = cleanText(body.documentId, 160)
    const idempotencyKey = cleanText(body.idempotencyKey, 200)
    if (!type || !customerId || !documentId || !/^[A-Za-z0-9._:/-]{8,200}$/.test(idempotencyKey)) {
      return send(response, 400, { error: 'The email request was incomplete.', code: 'invalid_request' })
    }

    const previous = await existingRequest(workspace.organizationId, idempotencyKey)
    if (previous?.status === 'sent' || previous?.status === 'delivered') {
      return send(response, 200, { message: 'Email sent', providerMessageId: previous.provider_message_id, status: previous.status })
    }
    if (previous) return send(response, 409, { error: 'This email request is already being processed.', code: 'duplicate' })

    const [customer, document] = await Promise.all([
      loadBusinessRecord(workspace.organizationId, 'customer', customerId),
      loadBusinessRecord(workspace.organizationId, type, documentId),
    ])
    if (!customer) return send(response, 404, { error: 'The selected customer could not be found.', code: 'customer_missing' })
    if (!document || cleanText(document.customerId, 160) !== customerId) {
      return send(response, 404, { error: `The selected ${type} could not be found.`, code: 'document_missing' })
    }

    const recipient = normalizedRecipient(customer, body.recipient)
    if (!recipient) return send(response, 422, { error: 'Enter a valid email address before continuing.', code: 'invalid_address' })
    const blockedStatus = await blockedByDeliveryHistory(workspace.organizationId, customerId, recipient)
    if (blockedStatus) {
      return send(response, 422, {
        error: "This address previously bounced. Verify the customer's email before sending again.",
        code: 'known_bounce',
      })
    }
    if (await isRateLimited(workspace.organizationId, recipient)) {
      return send(response, 429, { error: errorMessage(429), code: 'rate_limited' })
    }

    const insertion = await database('/rest/v1/email_delivery_logs', {
      body: JSON.stringify({
        organization_id: workspace.organizationId,
        user_id: workspace.userId,
        customer_id: customerId,
        document_id: documentId,
        email_type: type,
        recipient,
        status: 'pending',
        idempotency_key: idempotencyKey,
      }),
      headers: { Prefer: 'return=representation' },
      method: 'POST',
    })
    if (!insertion.ok) throw new Error('Email delivery logging is not configured.')
    const inserted = await insertion.json() as Array<{ id?: string }>
    logId = inserted[0]?.id ?? ''
    if (!logId) throw new Error('Email delivery logging failed.')

    const apiKey = process.env.RESEND_API_KEY?.trim()
    const fromAddress = process.env.RESEND_FROM_EMAIL?.trim()
    if (!apiKey || !fromAddress) throw new Error('Production email credentials are not configured.')
    const template = buildDocumentEmail({ customer, document, portalUrl: body.portalUrl, request, type })
    const resend = new Resend(apiKey)
    const from = fromAddress.includes('<')
      ? fromAddress
      : `Rabbit's Foot Owner Hub <${fromAddress}>`
    const result = await resend.emails.send({
      from,
      html: template.html,
      subject: template.subject,
      text: template.text,
      to: recipient,
    }, { idempotencyKey })

    if (result.error || !result.data?.id) {
      const providerStatus = Number((result.error as { statusCode?: unknown } | null)?.statusCode) || 502
      await updateLog(logId, {
        error_code: cleanText((result.error as { name?: unknown } | null)?.name, 100) || 'provider_error',
        status: 'failed',
      })
      return send(response, providerStatus === 429 ? 429 : 502, {
        error: errorMessage(providerStatus),
        code: providerStatus === 429 ? 'rate_limited' : 'provider_failure',
      })
    }

    await updateLog(logId, { provider_message_id: result.data.id, status: 'sent' })
    return send(response, 200, {
      message: 'Email sent',
      providerMessageId: result.data.id,
      status: 'sent',
    })
  } catch (error) {
    if (logId) await updateLog(logId, { error_code: 'server_error', status: 'failed' }).catch(() => undefined)
    console.error('Email send failed.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 500, { error: errorMessage(500), code: 'server_error' })
  }
}
