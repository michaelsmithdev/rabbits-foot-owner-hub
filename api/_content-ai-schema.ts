export const contentTypes = [
  'before_after', 'repair', 'installation', 'transformation', 'maintenance',
  'tip', 'educational', 'customer_result', 'promotion', 'business_update', 'other',
] as const

export const aiContentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['confidence', 'confidenceReasons', 'privacyWarnings', 'contentType', 'videoSummary', 'facebook', 'googleBusiness', 'youtube', 'score'],
  properties: {
    confidence: { type: 'string', enum: ['high', 'medium', 'needs_review'] },
    confidenceReasons: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    privacyWarnings: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    contentType: { type: 'string', enum: contentTypes },
    videoSummary: { type: 'string' },
    facebook: {
      type: 'object', additionalProperties: false,
      required: ['caption', 'hashtags', 'callToAction', 'publishAsReel'],
      properties: {
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        callToAction: { type: 'string' },
        publishAsReel: { type: 'boolean' },
      },
    },
    googleBusiness: {
      type: 'object', additionalProperties: false,
      required: ['summary', 'callToAction', 'callToActionUrl'],
      properties: {
        summary: { type: 'string' },
        callToAction: { type: 'string', enum: ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'] },
        callToActionUrl: { type: 'string' },
      },
    },
    youtube: {
      type: 'object', additionalProperties: false,
      required: ['title', 'description', 'tags', 'categoryId'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        categoryId: { type: 'string' },
      },
    },
    score: {
      type: 'object', additionalProperties: false,
      required: ['overall', 'hook', 'clarity', 'localRelevance', 'callToAction', 'platformFit', 'recommendations'],
      properties: {
        overall: { type: 'integer', minimum: 0, maximum: 100 },
        hook: { type: 'integer', minimum: 0, maximum: 100 },
        clarity: { type: 'integer', minimum: 0, maximum: 100 },
        localRelevance: { type: 'integer', minimum: 0, maximum: 100 },
        callToAction: { type: 'integer', minimum: 0, maximum: 100 },
        platformFit: { type: 'integer', minimum: 0, maximum: 100 },
        recommendations: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
    },
  },
} as const

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function textArray(value: unknown, maximumItems: number, maximumLength = 100): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.flatMap((item) => {
    const clean = cleanText(item, maximumLength)
    return clean ? [clean] : []
  }))).slice(0, maximumItems)
}

export function normalizeAiContentResult(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('invalid_ai_content')
  const result = value as Record<string, unknown>
  const facebook = result.facebook as Record<string, unknown>
  const googleBusiness = result.googleBusiness as Record<string, unknown>
  const youtube = result.youtube as Record<string, unknown>
  const score = result.score as Record<string, unknown>
  if (!facebook || !googleBusiness || !youtube || !score) throw new Error('invalid_ai_content')
  const confidence = ['high', 'medium', 'needs_review'].includes(String(result.confidence))
    ? String(result.confidence)
    : 'needs_review'
  const contentType = contentTypes.includes(String(result.contentType) as (typeof contentTypes)[number])
    ? String(result.contentType)
    : 'other'
  const integer = (input: unknown) => Math.max(0, Math.min(100, Math.round(Number(input) || 0)))
  return {
    confidence,
    confidenceReasons: textArray(result.confidenceReasons, 5, 200),
    privacyWarnings: textArray(result.privacyWarnings, 10, 200),
    contentType,
    videoSummary: cleanText(result.videoSummary, 2_000),
    facebook: {
      caption: cleanText(facebook.caption, 4_000),
      hashtags: textArray(facebook.hashtags, 6, 60).map((tag) => tag.replace(/^#/, '')),
      callToAction: cleanText(facebook.callToAction, 300),
      publishAsReel: facebook.publishAsReel === true,
    },
    googleBusiness: {
      summary: cleanText(googleBusiness.summary, 1_500),
      callToAction: ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'].includes(String(googleBusiness.callToAction))
        ? String(googleBusiness.callToAction)
        : 'LEARN_MORE',
      callToActionUrl: cleanText(googleBusiness.callToActionUrl, 500),
    },
    youtube: {
      title: cleanText(youtube.title, 100),
      description: cleanText(youtube.description, 5_000),
      tags: textArray(youtube.tags, 20, 100),
      categoryId: cleanText(youtube.categoryId, 10) || '26',
    },
    score: {
      overall: integer(score.overall), hook: integer(score.hook), clarity: integer(score.clarity),
      localRelevance: integer(score.localRelevance), callToAction: integer(score.callToAction),
      platformFit: integer(score.platformFit), recommendations: textArray(score.recommendations, 4, 250),
    },
  }
}
