import type { AiEstimateGeneration } from '../../estimates/ai/types'
import type { VoiceNote } from '../../voice/types/VoiceNote'

export type WalkthroughStatus = 'draft' | 'analyzing' | 'ready' | 'converted'

export type Walkthrough = {
  id: string
  customerId: string
  serviceAddress: string
  propertyType: 'residential' | 'commercial'
  jobCategory: string
  typedNotes: string
  originalTranscript: string
  voiceNotes: VoiceNote[]
  photoIds: string[]
  photoContext: Record<string, string>
  answers: Record<string, string>
  status: WalkthroughStatus
  aiEstimate?: AiEstimateGeneration
  estimateId?: string
  createdAt: string
  updatedAt: string
}
