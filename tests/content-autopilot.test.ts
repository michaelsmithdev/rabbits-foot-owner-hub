import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { normalizeAiContentResult, aiContentSchema } from '../api/_content-ai-schema.ts'
import { oauthStateHash, providerSafeError } from '../api/_content-autopilot-server.ts'
import {
  aggregateContentStatus,
  contentIdempotencyKey,
  normalizeScheduledAt,
  retryDelaySeconds,
} from '../api/_content-publish-logic.ts'
import {
  normalizeTagList,
  providerCapabilities,
  publicJobContext,
  textPrivacyWarnings,
  validatePlatformPost,
  validateVideo,
} from '../src/features/contentAutopilot/contentRules.ts'
import type { PlatformPostDraft } from '../src/features/contentAutopilot/types.ts'

const root = process.cwd()

function youtubeDraft(): PlatformPostDraft {
  return {
    provider: 'youtube', enabled: true, title: 'Drywall repair in South Bend', caption: '',
    description: 'A grounded look at the repair.', hashtags: [], tags: ['drywall repair'],
    callToAction: '', callToActionUrl: '', scheduledAt: null,
    metadata: { youtubeVisibility: 'private', youtubeCategoryId: '26', madeForKids: false },
  }
}

test('upload validation accepts supported video and rejects unsafe input', () => {
  assert.equal(validateVideo({ name: 'repair.mov', size: 42_000_000, type: 'video/quicktime' }), null)
  assert.match(validateVideo({ name: 'notes.pdf', size: 42_000, type: 'application/pdf' }) ?? '', /MP4/)
  assert.match(validateVideo({ name: 'empty.mp4', size: 0, type: 'video/mp4' }) ?? '', /empty/)
})

test('provider selection keeps independent platform payload rules', () => {
  const youtube = youtubeDraft()
  assert.deepEqual(validatePlatformPost(youtube), [])
  assert.match(validatePlatformPost({ ...youtube, title: '' })[0], /title/)
  const google: PlatformPostDraft = {
    ...youtube, provider: 'google_business', title: '', caption: 'Local repair update',
    callToAction: 'LEARN_MORE', callToActionUrl: 'not-a-url', metadata: { googleTopicType: 'STANDARD' },
  }
  assert.match(validatePlatformPost(google).join(' '), /valid CTA URL/)
  assert.deepEqual(normalizeTagList('#repair, repair, South Bend'), ['repair', 'South Bend'])
})

test('duplicate prevention is deterministic per platform post', () => {
  const first = contentIdempotencyKey('d996ac6a-6d78-4d99-a12e-d3573a2010cf')
  assert.equal(first, contentIdempotencyKey('d996ac6a-6d78-4d99-a12e-d3573a2010cf'))
  assert.notEqual(first, contentIdempotencyKey('9ab54c91-9f73-4c56-96d1-c7ad82988ee7'))
  assert.equal(first.length, 64)
})

test('retry behavior backs off exponentially and caps at one hour', () => {
  assert.equal(retryDelaySeconds(1), 30)
  assert.equal(retryDelaySeconds(2), 60)
  assert.equal(retryDelaySeconds(8), 3_600)
  assert.equal(retryDelaySeconds(20), 3_600)
})

test('partial provider failure never erases successful providers', () => {
  assert.equal(aggregateContentStatus(['published', 'failed', 'published']), 'partially_published')
  assert.equal(aggregateContentStatus(['published', 'canceled']), 'partially_published')
  assert.equal(aggregateContentStatus(['published', 'published']), 'published')
  assert.equal(aggregateContentStatus(['retrying', 'published']), 'publishing')
})

test('scheduling stores future timestamps in UTC and treats immediate times as now', () => {
  const now = Date.parse('2026-08-21T12:00:00-04:00')
  assert.equal(normalizeScheduledAt('2026-08-22T10:00:00-04:00', now), '2026-08-22T14:00:00.000Z')
  assert.equal(normalizeScheduledAt('2026-08-21T12:00:10-04:00', now), null)
  assert.equal(normalizeScheduledAt('not-a-date', now), null)
})

test('privacy filtering warns on private data and unsupported public claims', () => {
  const warnings = textPrivacyWarnings('Finished at 123 Main Street. Call 574-555-1212. Guaranteed for $99.')
  assert.ok(warnings.includes('Possible street address'))
  assert.ok(warnings.includes('Possible phone number'))
  assert.ok(warnings.includes('Claim needs owner verification'))
  assert.ok(warnings.includes('Pricing claim needs owner verification'))
})

test('job context removes customer identity and private fields', () => {
  const safe = publicJobContext({
    jobName: 'Bathroom tile repair', description: 'Repaired two cracked tiles', scopeOfWork: 'Remove and replace two tiles',
    materials: ['customer-approved tile'], city: 'Mishawaka', status: 'completed',
    ...({ customerName: 'John Smith', streetAddress: '123 Main St', phone: '574-555-1212' } as object),
  })
  assert.deepEqual(Object.keys(safe).sort(), ['completionStatus', 'confirmedMaterials', 'confirmedScope', 'jobName', 'serviceAreaCity', 'workDescription'])
  assert.doesNotMatch(JSON.stringify(safe), /John|123 Main|574-/)
})

test('AI structured output is strict and normalized to provider limits', () => {
  assert.equal(aiContentSchema.additionalProperties, false)
  const normalized = normalizeAiContentResult({
    confidence: 'high', confidenceReasons: ['Clear completed work'], privacyWarnings: [], contentType: 'repair', videoSummary: 'Visible drywall patch.',
    facebook: { caption: 'A grounded local repair.', hashtags: ['#repair'], callToAction: 'Call or message.', publishAsReel: true },
    googleBusiness: { summary: 'Drywall repair completed for a local home.', callToAction: 'LEARN_MORE', callToActionUrl: 'https://example.com' },
    youtube: { title: 'x'.repeat(140), description: 'Repair walkthrough', tags: ['drywall'], categoryId: '26' },
    score: { overall: 88.8, hook: 91, clarity: 90, localRelevance: 80, callToAction: 82, platformFit: 93, recommendations: ['Confirm the city.'] },
  })
  assert.equal(normalized.youtube.title.length, 100)
  assert.deepEqual(normalized.facebook.hashtags, ['repair'])
  assert.equal(normalized.score.overall, 89)
})

test('OAuth state is hashed and expired credentials receive a corrective error', () => {
  const raw = 'owner-hub-oauth-state-secret'
  assert.notEqual(oauthStateHash(raw), raw)
  assert.equal(oauthStateHash(raw), oauthStateHash(raw))
  const expired = providerSafeError(new Error('401 invalid_grant token expired'))
  assert.equal(expired.code, 'authorization_expired')
  assert.equal(expired.transient, false)
})

test('YouTube connection test verifies the selected channel without incompatible API filters', () => {
  const publisher = readFileSync(join(root, 'api/_content-publishers/youtube.ts'), 'utf8')
  const testMethod = publisher.match(/async testConnection[\s\S]*?\n {2}}\n\n {2}async publish/)?.[0] ?? ''
  assert.match(testMethod, /this\.listAccounts\(accessToken\)/)
  assert.doesNotMatch(testMethod, /[?&]id=.*mine=true|mine=true.*[?&]id=/)
})

test('capability matrix reflects official provider differences', () => {
  assert.equal(providerCapabilities.facebook.reels, true)
  assert.equal(providerCapabilities.google_business.localPosts, true)
  assert.equal(providerCapabilities.google_business.locationVideo, true)
  assert.equal(providerCapabilities.google_business.localPostVideoAttachment, false)
  assert.equal(providerCapabilities.youtube.scheduling, true)
})

test('database migration keeps social secrets server-only and uses RLS', () => {
  const migration = readFileSync(join(root, 'supabase/migrations/202608210009_content_autopilot_foundation.sql'), 'utf8')
  assert.match(migration, /content_social_secrets[\s\S]+enable row level security/i)
  assert.doesNotMatch(migration, /grant\s+(?:select|all)[^;]+content_social_secrets\s+to\s+authenticated/i)
  assert.match(migration, /claim_content_publish_jobs[\s\S]+for update skip locked/i)
  assert.match(migration, /private\.is_organization_member/i)
})

test('mobile composer has layout-critical breakpoints and full-width modal safety', () => {
  const css = readFileSync(join(root, 'src/features/contentAutopilot/pages/ContentAutopilot.css'), 'utf8')
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /\.ca-modal \{ width: 100%; max-height: 94dvh;/)
  assert.match(css, /\.ca-video-selected, \.ca-two-column, \.ca-three-column, \.ca-detail-grid \{ grid-template-columns: 1fr;/)
})
