import { createHash } from 'node:crypto'

import OpenAI from 'openai'

import { aiContentSchema, normalizeAiContentResult } from './_content-ai-schema.js'
import {
  aiContentEnabled,
  cleanText,
  database,
  databaseJson,
  textArray,
} from './_content-autopilot-server.js'
import type { Json, Workspace } from './_content-autopilot-server.js'

const PROMPT_VERSION = 'content-autopilot-v1.0'

const CONTENT_INSTRUCTIONS = `
You create truthful, platform-specific marketing copy for a local handyman business.
Use only the confirmed facts supplied in the request or clearly visible in the representative frames.
Never invent materials, work performed, pricing, customer satisfaction, warranties, licensing,
certifications, guarantees, safety claims, or exact locations. Never include a customer name,
street address, phone, email, paperwork detail, or private note in public copy.

Facebook must have a concrete conversational hook, a grounded problem-to-work-to-result flow,
a concise CTA, and no more than six relevant hashtags. Google Business Profile must be natural
local-search copy, never keyword-stuffed, and no longer than 1,500 characters. YouTube must have
a truthful searchable title no longer than 100 characters, a useful description no longer than
5,000 characters, and relevant tags. Do not copy one caption into all three platforms.

If facts are uncertain, use generic truthful language and set confidence to needs_review. Add a
privacy warning when frames may show faces, addresses, house numbers, license plates, paperwork,
screens, phone numbers, or other personal information. Privacy detection is only an assist; do not
claim it is flawless. The content score is a heuristic review score, never a performance promise.
`.trim()

export async function generateContentAi(workspace: Workspace, payload: Json) {
  if (!aiContentEnabled()) throw new Error('ai_content_disabled')
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('openai_not_configured')
  const contentItemId = cleanText(payload.contentItemId, 80)
  const items = await databaseJson<Array<Json>>(
    `/rest/v1/content_items?id=eq.${encodeURIComponent(contentItemId)}&organization_id=eq.${workspace.organizationId}&select=*&limit=1`,
  )
  const item = items[0]
  if (!item || item.upload_status !== 'uploaded') throw new Error('content_item_not_ready')
  const [profiles, preferences, examples] = await Promise.all([
    databaseJson<Array<Json>>(`/rest/v1/content_brand_profiles?organization_id=eq.${workspace.organizationId}&select=*&limit=1`),
    databaseJson<Array<Json>>(`/rest/v1/content_brand_preferences?organization_id=eq.${workspace.organizationId}&or=(source.eq.owner,accepted.eq.true)&select=preference_key,preference_value,source,locked,confidence,evidence_count&order=locked.desc,evidence_count.desc&limit=30`),
    databaseJson<Array<Json>>(`/rest/v1/content_platform_posts?organization_id=eq.${workspace.organizationId}&status=eq.published&select=provider,title,caption,description,hashtags,tags&order=published_at.desc&limit=6`),
  ])
  const frameDataUrls = Array.isArray(payload.frameDataUrls)
    ? payload.frameDataUrls.flatMap((frame) => typeof frame === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(frame) && frame.length <= 500_000 ? [frame] : []).slice(0, 3)
    : []
  const cachedAnalysis = item.video_analysis && typeof item.video_analysis === 'object' ? item.video_analysis : null
  if (!cachedAnalysis && frameDataUrls.length === 0) throw new Error('representative_frames_required')
  const profile = profiles[0] ?? {}
  const model = process.env.OPENAI_CONTENT_MODEL?.trim() || process.env.OPENAI_ESTIMATE_MODEL?.trim() || 'gpt-5.4-mini'
  const inputText = JSON.stringify({
    business: {
      name: cleanText(profile.business_name, 160),
      description: cleanText(profile.business_description, 2_000),
      serviceArea: cleanText(profile.service_area, 300),
      website: cleanText(profile.website, 300),
      defaultCta: cleanText(profile.default_cta, 300),
      primaryServices: textArray(profile.primary_services, 30, 100),
      writingStyle: cleanText(profile.writing_style, 1_000),
      emojiPreference: cleanText(profile.emoji_preference, 100),
      hashtagPreference: cleanText(profile.hashtag_preference, 100),
      phrasesToAvoid: textArray(profile.phrases_to_avoid, 30, 100),
      defaultYouTubeCategoryId: cleanText(profile.youtube_category_id, 10) || '26',
    },
    confirmedJobContext: item.job_context && typeof item.job_context === 'object' ? item.job_context : {},
    ownerStartingCaption: cleanText(payload.masterCaption, 5_000),
    ownerSelectedContentType: cleanText(payload.contentType, 80),
    lockedAndAcceptedPreferences: preferences,
    recentPublishedExamples: examples,
    cachedVideoAnalysis: cachedAnalysis,
    rules: {
      historicalExamplesAreStyleReferencesOnly: true,
      customerPrivateInformationWasIntentionallyRemoved: true,
    },
  })
  const openai = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 1 })
  const response = await openai.responses.create({
    model,
    instructions: CONTENT_INSTRUCTIONS,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: inputText },
        ...(!cachedAnalysis ? frameDataUrls.map((frame) => ({ type: 'input_image' as const, image_url: frame, detail: 'low' as const })) : []),
      ],
    }],
    reasoning: { effort: 'low' },
    text: {
      verbosity: 'medium',
      format: {
        type: 'json_schema', name: 'rabbit_foot_platform_content', strict: true,
        description: 'Truthful platform-specific content, privacy review, confidence, and heuristic quality score.',
        schema: aiContentSchema,
      },
    },
    max_output_tokens: 4_000,
    store: false,
    safety_identifier: createHash('sha256').update(workspace.userId).digest('hex'),
  })
  const normalized = normalizeAiContentResult(JSON.parse(response.output_text))
  const rows = await databaseJson<Array<{ id: string }>>('/rest/v1/content_ai_generations', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      organization_id: workspace.organizationId,
      content_item_id: contentItemId,
      platform: null,
      model,
      prompt_version: PROMPT_VERSION,
      request_type: cachedAnalysis ? 'platform_copy' : 'video_analysis_and_platform_copy',
      generated_output: normalized,
      input_units: response.usage?.input_tokens ?? null,
      output_units: response.usage?.output_tokens ?? null,
      approximate_cost: null,
    }),
  })
  const generationId = rows[0]?.id
  if (!generationId) throw new Error('ai_generation_not_saved')
  const itemUpdate = await database(`/rest/v1/content_items?id=eq.${contentItemId}&organization_id=eq.${workspace.organizationId}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      video_analysis: cachedAnalysis ?? { summary: normalized.videoSummary, contentType: normalized.contentType, analyzedAt: new Date().toISOString(), model },
      privacy_warnings: normalized.privacyWarnings,
      creation_mode: 'ai_assisted',
      status: normalized.confidence === 'needs_review' || normalized.privacyWarnings.length > 0 ? 'needs_review' : 'draft',
      updated_at: new Date().toISOString(),
    }),
  })
  if (!itemUpdate.ok) throw new Error('ai_analysis_not_saved')
  await database('/rest/v1/usage_events', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      organization_id: workspace.organizationId,
      event_type: 'ai_content',
      quantity: 1,
      metadata: { model, requestType: cachedAnalysis ? 'platform_copy' : 'video_analysis_and_platform_copy', frames: cachedAnalysis ? 0 : frameDataUrls.length },
    }),
  })
  return { generationId, model, ...normalized }
}
