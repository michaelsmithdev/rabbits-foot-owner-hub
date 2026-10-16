import type { IncomingMessage, ServerResponse } from 'node:http'
import { Resend } from 'resend'

import { cleanText, database } from './_email-core.js'

type RawRequest = IncomingMessage & { body?: unknown }

async function rawBody(request: RawRequest) {
  if (typeof request.body === 'string') return request.body
  if (Buffer.isBuffer(request.body)) return request.body.toString('utf8')
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

export default async function handler(request: RawRequest, response: ServerResponse) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed.' })
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()
    if (!apiKey || !webhookSecret) return send(response, 503, { error: 'Webhook configuration is incomplete.' })
    const payload = await rawBody(request)
    const id = cleanText(request.headers['svix-id'], 200)
    const timestamp = cleanText(request.headers['svix-timestamp'], 100)
    const signature = cleanText(request.headers['svix-signature'], 500)
    if (!id || !timestamp || !signature) return send(response, 400, { error: 'Invalid webhook signature.' })

    const resend = new Resend(apiKey)
    const event = resend.webhooks.verify({
      headers: { id, signature, timestamp },
      payload,
      webhookSecret,
    }) as {
      created_at?: string
      data?: { email_id?: string; to?: string[] }
      type?: string
    }
    const eventType = cleanText(event.type, 80)
    const providerMessageId = cleanText(event.data?.email_id, 200)
    if (!providerMessageId || !eventType) return send(response, 202, { received: true })

    const eventInsert = await database('/rest/v1/email_webhook_events', {
      body: JSON.stringify({ event_id: id, event_type: eventType }),
      headers: { Prefer: 'return=minimal' },
      method: 'POST',
    })
    if (eventInsert.status === 409) return send(response, 200, { duplicate: true })
    if (!eventInsert.ok) throw new Error('Webhook event could not be recorded.')

    const logResult = await database(
      `/rest/v1/email_delivery_logs?provider_message_id=eq.${encodeURIComponent(providerMessageId)}` +
      '&select=id,organization_id,customer_id,recipient&limit=1',
    )
    const logs = logResult.ok
      ? await logResult.json() as Array<{ id?: string; organization_id?: string; customer_id?: string; recipient?: string }>
      : []
    const log = logs[0]
    if (!log?.id || !log.organization_id || !log.customer_id || !log.recipient) {
      return send(response, 202, { received: true })
    }

    const now = event.created_at || new Date().toISOString()
    const status = eventType === 'email.delivered'
      ? 'delivered'
      : eventType === 'email.bounced'
        ? 'bounced'
        : eventType === 'email.complained'
          ? 'complained'
          : eventType === 'email.suppressed'
            ? 'suppressed'
            : eventType === 'email.delivery_delayed'
              ? 'delayed'
              : ''
    if (!status) return send(response, 200, { received: true })

    await database(`/rest/v1/email_delivery_logs?id=eq.${encodeURIComponent(log.id)}`, {
      body: JSON.stringify({
        status,
        ...(status === 'delivered' ? { delivered_at: now } : {}),
        ...(['bounced', 'complained', 'suppressed'].includes(status) ? { bounced_at: now } : {}),
      }),
      headers: { Prefer: 'return=minimal' },
      method: 'PATCH',
    })
    return send(response, 200, { received: true })
  } catch (error) {
    console.warn('Rejected Resend webhook.', error instanceof Error ? error.message : 'Unknown error')
    return send(response, 400, { error: 'Invalid webhook.' })
  }
}
