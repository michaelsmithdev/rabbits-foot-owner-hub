export const contentProviders = ['facebook', 'google_business', 'youtube'] as const

export type ContentProvider = (typeof contentProviders)[number]
export type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'token_expired' | 'error'
export type ContentItemStatus = 'draft' | 'scheduled' | 'publishing' | 'partially_published' | 'published' | 'failed' | 'canceled' | 'needs_review'
export type PlatformPostStatus = 'draft' | 'uploading' | 'queued' | 'processing' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'retrying' | 'canceled' | 'needs_review'
export type ContentType = 'before_after' | 'repair' | 'installation' | 'transformation' | 'maintenance' | 'tip' | 'educational' | 'customer_result' | 'promotion' | 'business_update' | 'other'

export type ProviderCapabilities = {
  videoUpload: boolean
  reels: boolean
  localPosts: boolean
  locationVideo: boolean
  localPostVideoAttachment: boolean
  scheduling: boolean
  analytics: string[]
  deletePost: boolean
  warnings: string[]
}

export type SocialConnection = {
  id: string
  provider: ContentProvider
  displayName: string
  externalAccountId: string
  externalResourceId: string
  status: ConnectionStatus
  tokenExpiresAt: string | null
  lastCheckedAt: string | null
  lastError: string
  capabilities: ProviderCapabilities
}

export type PlatformPostDraft = {
  id?: string
  provider: ContentProvider
  enabled: boolean
  title: string
  caption: string
  description: string
  hashtags: string[]
  tags: string[]
  callToAction: string
  callToActionUrl: string
  scheduledAt: string | null
  status?: PlatformPostStatus
  providerUrl?: string
  lastErrorMessage?: string
  metadata: {
    publishAsReel?: boolean
    googleTopicType?: 'STANDARD' | 'EVENT' | 'OFFER'
    youtubeCategoryId?: string
    youtubeVisibility?: 'private' | 'unlisted' | 'public'
    madeForKids?: boolean
    containsSyntheticMedia?: boolean
  }
}

export type ContentItemSummary = {
  id: string
  originalFilename: string
  videoStorageKey: string
  masterCaption: string
  contentType: ContentType
  creationMode: 'manual' | 'ai_assisted' | 'ai_draft' | 'autopilot'
  status: ContentItemStatus
  uploadStatus: 'uploading' | 'uploaded' | 'failed'
  linkedJobId: string
  jobName: string
  durationSeconds: number | null
  aspectRatio: string
  fileSize: number
  privacyWarnings: string[]
  createdAt: string
  updatedAt: string
  previewUrl?: string
  platformPosts: PlatformPostDraft[]
}

export type BrandProfile = {
  businessName: string
  businessDescription: string
  serviceArea: string
  website: string
  phone: string
  defaultCta: string
  primaryServices: string[]
  writingStyle: string
  emojiPreference: string
  hashtagPreference: string
  phrasesToAvoid: string[]
  youtubeCategoryId: string
  autonomyLevel: 0 | 1 | 2 | 3 | 4
  timezone: string
  contentGoals: Record<ContentProvider, number>
}

export type LearnedPreference = {
  id: string
  key: string
  value: unknown
  confidence: number | null
  evidenceCount: number
  accepted: boolean | null
  locked: boolean
}

export type ContentBootstrap = {
  enabled: boolean
  aiEnabled: boolean
  mockMode: boolean
  connections: SocialConnection[]
  items: ContentItemSummary[]
  brandProfile: BrandProfile
  learnedPreferences: LearnedPreference[]
  analytics: {
    publishedPosts: number | null
    totalViews: number | null
    totalEngagement: number | null
    bestPlatform: ContentProvider | null
    topJobType: string | null
  }
}

export type VideoMetadata = {
  durationSeconds: number
  width: number
  height: number
  aspectRatio: string
}

export type AiContentResult = {
  generationId: string
  model: string
  confidence: 'high' | 'medium' | 'needs_review'
  confidenceReasons: string[]
  privacyWarnings: string[]
  contentType: ContentType
  videoSummary: string
  facebook: {
    caption: string
    hashtags: string[]
    callToAction: string
    publishAsReel: boolean
  }
  googleBusiness: {
    summary: string
    callToAction: 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL'
    callToActionUrl: string
  }
  youtube: {
    title: string
    description: string
    tags: string[]
    categoryId: string
  }
  score: {
    overall: number
    hook: number
    clarity: number
    localRelevance: number
    callToAction: number
    platformFit: number
    recommendations: string[]
  }
}
