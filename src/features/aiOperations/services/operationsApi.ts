import { cloudClient } from '../../cloud/cloudClient'
import type { AiAction } from '../types'
import type { DailyBrief } from './recommendationEngine'

export type GeneratedOperationsBrief = {
  headline: string
  summary: string
  priority: string
  watchouts: string[]
}

function apiUrl() {
  const configuredOrigin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim()
  return `${configuredOrigin?.replace(/\/$/, '') ?? ''}/api/ai-operations`
}

function readError(value: unknown) {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error
    : 'AI briefing is temporarily unavailable. Your normal recommendations still work.'
}

export async function generateOperationsBrief(brief: DailyBrief, actions: AiAction[]) {
  if (!cloudClient) throw new Error('Cloud sign-in is required for an AI-generated brief.')
  const { data, error } = await cloudClient.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Your secure session expired. Sign in and retry.')
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 35_000)
  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
        'X-Owner-Hub-Organization': localStorage.getItem('owner-hub-active-organization') ?? '',
      },
      body: JSON.stringify({
        summary: brief,
        observations: actions.slice(0, 12).map((action) => `${action.title}: ${action.summary} Reason: ${action.reason}`),
      }),
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new Error(readError(payload))
    if (!payload || typeof payload !== 'object' || typeof (payload as { headline?: unknown }).headline !== 'string') throw new Error('The AI brief was incomplete.')
    return payload as GeneratedOperationsBrief
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The AI brief took too long. Your normal recommendations still work.', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}
