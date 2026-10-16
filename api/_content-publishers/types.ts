import type { Json } from '../_content-autopilot-server.js'
import type { ContentProvider } from '../_content-autopilot-server.js'

export type PublishRecord = {
  job: Json
  post: Json
  content: Json
  connection: Json
  accessToken: string
  refreshToken: string
  videoUrl: string
  checkpoint: (state: Json, providerSessionId?: string) => Promise<void>
}

export type PublishResult = {
  state: 'processing' | 'published'
  providerPostId?: string
  providerUrl?: string
  progress: number
  providerState: Json
  warning?: string
}

export type ProviderAccount = { id: string; parentId?: string; name: string; accessToken?: string }

export interface SocialPublisher {
  readonly provider: ContentProvider
  listAccounts(accessToken: string): Promise<ProviderAccount[]>
  testConnection(connection: Json, accessToken: string): Promise<{ checks: string[]; warning?: string }>
  publish(record: PublishRecord): Promise<PublishResult>
  getStatus(connection: Json, accessToken: string, providerPostId: string): Promise<Json>
  deletePost(connection: Json, accessToken: string, providerPostId: string, providerState?: Json): Promise<void>
}

export async function providerFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const result = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) })
  const payload = await result.json().catch(() => ({})) as T & { error?: { message?: string; code?: number }; error_description?: string }
  if (!result.ok) {
    const providerMessage = payload.error?.message ?? payload.error_description ?? `provider_http_${result.status}`
    throw new Error(`${result.status}:${providerMessage}`)
  }
  return payload
}
