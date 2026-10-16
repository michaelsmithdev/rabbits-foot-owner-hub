import type {
  ContentProvider,
  PlatformPostDraft,
  ProviderCapabilities,
} from './types'

export const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024
export const supportedVideoTypes = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/avi',
  'video/x-msvideo',
])

export const providerLabels: Record<ContentProvider, string> = {
  facebook: 'Facebook',
  google_business: 'Google Business Profile',
  youtube: 'YouTube',
}

export const providerCapabilities: Record<ContentProvider, ProviderCapabilities> = {
  facebook: {
    videoUpload: true,
    reels: true,
    localPosts: false,
    locationVideo: false,
    localPostVideoAttachment: false,
    scheduling: true,
    analytics: ['views', 'reach', 'reactions', 'comments', 'shares'],
    deletePost: true,
    warnings: ['Reels and Page video availability depend on Page permissions and Meta app review.'],
  },
  google_business: {
    videoUpload: true,
    reels: false,
    localPosts: true,
    locationVideo: true,
    localPostVideoAttachment: false,
    scheduling: true,
    analytics: ['local_post_insights', 'location_media_views'],
    deletePost: true,
    warnings: [
      'Google documents Local Post media by source URL but does not explicitly guarantee video attachment parity. Owner Hub publishes the Local Post and uploads the video as location media separately.',
    ],
  },
  youtube: {
    videoUpload: true,
    reels: false,
    localPosts: false,
    locationVideo: false,
    localPostVideoAttachment: false,
    scheduling: true,
    analytics: ['views', 'likes', 'comments'],
    deletePost: true,
    warnings: ['Uploads from unverified API projects are restricted to private until Google completes an API compliance audit.'],
  },
}

export function validateVideo(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (!supportedVideoTypes.has(file.type.toLowerCase())) {
    return 'Choose an MP4, MOV, WebM, M4V, or AVI video.'
  }
  if (file.size <= 0) return 'This video file is empty.'
  if (file.size > MAX_VIDEO_SIZE_BYTES) return 'Choose a video smaller than 2 GB.'
  return null
}

export function normalizeTagList(value: string | string[], maximum = 15): string[] {
  const values = Array.isArray(value) ? value : value.split(/[#,\n]/)
  return Array.from(new Set(values.map((item) => item.trim().replace(/^#/, '')).filter(Boolean)))
    .slice(0, maximum)
}

export function validatePlatformPost(post: PlatformPostDraft): string[] {
  if (!post.enabled) return []
  const errors: string[] = []
  if (post.provider === 'facebook' && !post.caption.trim()) errors.push('Facebook needs a caption.')
  if (post.provider === 'google_business') {
    if (!post.caption.trim()) errors.push('Google Business Profile needs a summary.')
    if (post.callToAction !== 'CALL' && post.callToAction && !isHttpUrl(post.callToActionUrl)) {
      errors.push('Google Business Profile needs a valid CTA URL.')
    }
  }
  if (post.provider === 'youtube') {
    if (!post.title.trim()) errors.push('YouTube needs a title.')
    if (post.title.trim().length > 100) errors.push('YouTube titles can be at most 100 characters.')
    if (post.description.length > 5_000) errors.push('YouTube descriptions can be at most 5,000 characters.')
  }
  return errors
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function publicJobContext(input: {
  jobName?: string
  description?: string
  scopeOfWork?: string
  materials?: string[]
  city?: string
  status?: string
}) {
  return {
    jobName: input.jobName?.trim().slice(0, 160) ?? '',
    workDescription: input.description?.trim().slice(0, 1_500) ?? '',
    confirmedScope: input.scopeOfWork?.trim().slice(0, 2_500) ?? '',
    confirmedMaterials: (input.materials ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 30),
    serviceAreaCity: input.city?.trim().slice(0, 100) ?? '',
    completionStatus: input.status === 'completed' || input.status === 'invoiced' ? input.status : '',
  }
}

export function textPrivacyWarnings(value: string): string[] {
  const warnings: string[] = []
  if (/\b\d{1,5}\s+[A-Za-z0-9.' -]+\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|boulevard|blvd)\b/i.test(value)) {
    warnings.push('Possible street address')
  }
  if (/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.test(value)) warnings.push('Possible phone number')
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) warnings.push('Possible email address')
  if (/\b(?:guarantee|guaranteed|licensed|certified|warranty|cheapest|best in town)\b/i.test(value)) warnings.push('Claim needs owner verification')
  if (/\$\s?\d+(?:[,.]\d{2})?/.test(value)) warnings.push('Pricing claim needs owner verification')
  return Array.from(new Set(warnings))
}

export function deriveContentStatus(statuses: Array<PlatformPostDraft['status']>): 'draft' | 'scheduled' | 'publishing' | 'partially_published' | 'published' | 'failed' | 'canceled' | 'needs_review' {
  const active = statuses.filter(Boolean)
  if (active.length === 0 || active.every((status) => status === 'draft')) return 'draft'
  if (active.every((status) => status === 'published')) return 'published'
  if (active.includes('published') && active.every((status) => status === 'published' || status === 'canceled')) return 'partially_published'
  if (active.includes('published') && active.some((status) => status === 'failed' || status === 'needs_review')) return 'partially_published'
  if (active.includes('needs_review')) return 'needs_review'
  if (active.every((status) => status === 'failed')) return 'failed'
  if (active.every((status) => status === 'canceled')) return 'canceled'
  if (active.some((status) => status === 'scheduled')) return 'scheduled'
  return 'publishing'
}
