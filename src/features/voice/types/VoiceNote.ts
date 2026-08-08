export type VoiceNoteState = 'saved' | 'transcribing' | 'complete' | 'error'

export type VoiceNote = {
  id: string
  fileName: string
  mimeType: string
  durationSeconds: number
  transcript: string
  createdAt: string
  state: VoiceNoteState
}
