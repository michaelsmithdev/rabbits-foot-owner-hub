import { cloudClient } from '../../cloud/cloudClient'

const MAX_AUDIO_BYTES = 2_500_000
const REQUEST_TIMEOUT_MS = 75_000

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriptionError'
  }
}

function apiUrl() {
  const origin = import.meta.env.VITE_OWNER_HUB_API_URL?.trim().replace(/\/$/, '') ?? ''
  return `${origin}/api/transcribe`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new TranscriptionError('The saved recording could not be read.'))
    reader.readAsDataURL(blob)
  })
}

export async function transcribeAudio(blob: Blob, fileName: string): Promise<string> {
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new TranscriptionError('This recording is too large. Record a shorter note and try again.')
  }
  if (!cloudClient) {
    throw new TranscriptionError('Sign in to transcribe this saved voice note.')
  }

  const { data, error } = await cloudClient.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new TranscriptionError('Your secure session expired. Sign in and retry the saved note.')
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Owner-Hub-Organization': localStorage.getItem('owner-hub-active-organization') ?? '',
      },
      body: JSON.stringify({
        audioBase64: await blobToBase64(blob),
        mimeType: blob.type || 'audio/webm',
        fileName,
      }),
      signal: controller.signal,
    })
    const payload: unknown = await response.json().catch(() => null)
    const transcript =
      payload && typeof payload === 'object' && typeof (payload as { transcript?: unknown }).transcript === 'string'
        ? (payload as { transcript: string }).transcript.trim()
        : ''

    if (!response.ok || !transcript) {
      const errorMessage =
        payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : 'The saved recording could not be transcribed. Retry when connected.'
      throw new TranscriptionError(errorMessage)
    }

    return transcript
  } catch (error) {
    if (error instanceof TranscriptionError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TranscriptionError('Transcription took too long. The recording is saved; retry it.')
    }
    throw new TranscriptionError('Transcription is unavailable. The recording is saved on this device.')
  } finally {
    window.clearTimeout(timeout)
  }
}
