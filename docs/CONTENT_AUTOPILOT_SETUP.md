# Content Autopilot setup

This guide configures the production Content Autopilot foundation added on
August 21, 2026. Provider dashboards and approval language change over time,
so confirm any dashboard-specific wording against the linked official
documentation before enabling a live publishing flag.

## What is implemented

- Private, resumable video upload to Supabase Storage with mobile progress.
- Manual and AI-assisted Facebook, Google Business Profile, and YouTube drafts.
- Structured, server-side OpenAI output with cached video analysis.
- Independent backend publishing jobs, UTC scheduling, leases, checkpoints,
  exponential backoff, partial-success handling, and per-platform retry.
- Meta and Google OAuth, encrypted token storage, account selection, connection
  tests, disconnect/revocation, and provider-specific adapters.
- Content Library, post detail/audit history, weekly calendar, Brand Profile,
  feedback records, capability-aware previews, and analytics/Brand Brain
  foundations that show no invented metrics.
- Development publishing defaults to mock mode. Mock mode is always disabled
  automatically on a Vercel production deployment.

Level 4 publishing, automatic metric collection, embeddings, native thumbnails,
and automatic video editing remain feature-flagged future phases. The migration
creates their safe data-model foundations without presenting them as complete.

## 1. Database and private video storage

1. Back up the Supabase project before applying a new production migration.
2. Open the Supabase SQL editor for the Owner Hub project.
3. Run every pending migration in filename order, ending with:
   `supabase/migrations/202608210009_content_autopilot_foundation.sql`.
4. In **Storage**, confirm the `content-videos` bucket exists and is **Private**.
   The migration sets a 2 GB object limit and organization-member RLS policies.
5. Do not add a public-read policy. Provider adapters receive short-lived signed
   URLs only while a queued job is actively publishing.

Uploads use Supabase's TUS resumable endpoint. The existing Supabase project URL
and publishable key must already be configured in both the app and Vercel. If
the bucket is renamed, set both `CONTENT_VIDEO_BUCKET` and
`VITE_CONTENT_VIDEO_BUCKET` to the same non-secret name and update the migration
policies before deployment.

## 2. Core server secrets and safe rollout flags

Generate fresh values locally in PowerShell. Save the results directly in
Vercel; do not paste them into source code or chat.

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Use the first value for `CONTENT_TOKEN_ENCRYPTION_KEY` and the second for
`CONTENT_WORKER_SECRET`. Set these in Vercel for Production, Preview, and the
development environments that will exercise OAuth.

Start with:

```dotenv
CONTENT_AUTOPILOT_ENABLED=true
AI_CONTENT_GENERATION_ENABLED=true
FACEBOOK_PUBLISHING_ENABLED=false
GBP_PUBLISHING_ENABLED=false
YOUTUBE_PUBLISHING_ENABLED=false
AUTOPILOT_LEVEL4_ENABLED=false
CONTENT_PROVIDER_MOCK_MODE=true
```

`vercel.json` invokes `/api/content-autopilot-worker` daily at 12:00 UTC so the
project can deploy on Vercel's Hobby plan. Vercel sends `Authorization: Bearer
$CRON_SECRET` when `CRON_SECRET` is configured. For minute-level scheduled
publishing, call the same route every minute from Supabase Cron or another
secure scheduler using `CONTENT_WORKER_SECRET` (preferred) or `CRON_SECRET` as
the bearer token or `X-Content-Worker-Key` header. Never expose either secret
to the browser.

Deploy once with provider flags off. Connect and test one provider at a time,
then enable only that provider's live publishing flag. This prevents a test
deployment from posting to the Rabbit's Foot accounts.

## 3. Meta and Facebook Page setup

Official references: [Meta Reels Publishing API](https://developers.facebook.com/docs/video-api/guides/reels-publishing),
[Meta Pages API](https://developers.facebook.com/docs/pages-api/posts).

1. Sign in to [Meta for Developers](https://developers.facebook.com/apps/) with
   the Facebook account that administers the Rabbit's Foot Page.
2. Create or open a business app. Add the Facebook Login for Business capability
   offered by the current dashboard.
3. Add this exact **Valid OAuth Redirect URI**:
   `https://YOUR-OWNER-HUB-DOMAIN/api/content-autopilot-oauth-callback`.
4. Configure the production Owner Hub domain in the app's allowed domains and
   privacy-policy/data-deletion settings required by Meta.
5. Request the Page permissions used by Owner Hub:
   `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.
6. During app-development testing, use an app-role account that administers the
   test Page. For normal production users, request the current level of Advanced
   Access/App Review Meta requires. Complete Business Verification if the
   dashboard makes it a prerequisite.
7. Copy the App ID, App Secret, and the current Graph API version displayed for
   the app into Vercel as server-only values:

   ```dotenv
   META_APP_ID=...
   META_APP_SECRET=...
   META_REDIRECT_URI=https://YOUR-OWNER-HUB-DOMAIN/api/content-autopilot-oauth-callback
   META_GRAPH_API_VERSION=vXX.X
   ```

8. Redeploy. In Owner Hub, open **Settings → Social accounts → Facebook →
   Connect**. Complete OAuth, choose the Rabbit's Foot Page, and run **Test
   Connection**.
9. Only after that test succeeds, set `FACEBOOK_PUBLISHING_ENABLED=true` and
   redeploy. Publish a private/internal test video before relying on a customer
   job video.

Owner Hub exchanges the user token, retrieves the selected Page token on the
server, encrypts it with AES-256-GCM, and never returns it to the browser.

## 4. Google Business Profile setup

Official references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Business Profile Local Posts](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts),
[Business Profile media](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media).

1. Open or create the Google Cloud project that will own the Rabbit's Foot
   integrations.
2. Confirm the business and Google account meet Google's Business Profile API
   eligibility rules. Request API access if the project does not already have
   it.
3. Enable the APIs used by the adapter:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (the v4 Local Posts and media service)
4. Configure the OAuth consent screen. Add the business identity, authorized
   domain, privacy-policy URL, support email, and test users while the app is in
   Testing status.
5. Add the scope `https://www.googleapis.com/auth/business.manage`. Google may
   require OAuth verification before the app can serve users outside its test
   list.
6. Create an OAuth 2.0 **Web application** client. Add this exact authorized
   redirect URI:
   `https://YOUR-OWNER-HUB-DOMAIN/api/content-autopilot-oauth-callback`.
7. Put the client values in Vercel:

   ```dotenv
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://YOUR-OWNER-HUB-DOMAIN/api/content-autopilot-oauth-callback
   ```

8. Redeploy. In Owner Hub, connect Google Business Profile, choose the Rabbit's
   Foot account/location, and run **Test Connection**.
9. Set `GBP_PUBLISHING_ENABLED=true` only after the test passes.

Google's products are not treated as a Facebook clone. Owner Hub publishes a
Local Post for the summary and CTA, then separately attempts the official
location-media video resource using a short-lived signed source URL. If Google
accepts the Local Post but rejects the video, the library records the post as
published with a specific video warning; it does not claim unsupported video
attachment parity or erase the successful text post.

## 5. YouTube setup

Official references: [YouTube videos resource](https://developers.google.com/youtube/v3/docs/videos),
[videos.insert upload method](https://developers.google.com/youtube/v3/docs/videos/insert).

1. In the same Google Cloud project, enable **YouTube Data API v3**.
2. Reuse the OAuth web client and redirect URI from the Google setup.
3. The YouTube connection requests:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/youtube.force-ssl`
4. Add the Google account that owns the Rabbit's Foot channel as an OAuth test
   user until the consent screen is verified/published.
5. In Owner Hub, connect YouTube separately, select the correct channel, and run
   **Test Connection**.
6. Check quota in Google Cloud before a live test. Owner Hub uses resumable,
   chunked uploads, but each `videos.insert` still consumes YouTube API quota.
7. Google restricts uploads from unverified API projects to private visibility.
   Complete Google's API compliance audit before expecting public or unlisted
   automated uploads.
8. Keep the first test video's visibility **Private**. After the audit and a
   successful connection test, set `YOUTUBE_PUBLISHING_ENABLED=true`.

Owner Hub's scheduler stores the owner's local choice in UTC and starts the
backend upload at that scheduled time. It does not depend on the phone or
browser staying open.

## 6. OpenAI setup

Official references: [OpenAI API quickstart](https://platform.openai.com/docs/quickstart),
[Responses API](https://platform.openai.com/docs/api-reference/responses).

1. Use an OpenAI Platform project key with available API billing. A ChatGPT
   subscription is separate from API billing.
2. Store the key only as the server-side `OPENAI_API_KEY` Vercel variable.
3. Set `OPENAI_CONTENT_MODEL` to a current model available to that project.
   Owner Hub falls back to its configurable estimate model and then to the
   coded baseline only when this variable is absent.
4. Keep `AI_CONTENT_GENERATION_ENABLED=true` only in environments allowed to
   spend API credit.

The server sends at most three representative low-detail frames for the first
analysis, validates a strict JSON schema, stores the model and token usage, and
caches the analysis. Later caption generation reuses the cached result instead
of repeatedly sending the high-resolution video. The prompt prohibits invented
materials, satisfaction, prices, warranties, licensing, guarantees, and private
customer information.

## 7. Production verification

Run locally before deployment:

```bash
npm run lint
npm run test
npm run build
npm audit --omit=dev
```

Then verify in the deployed Owner Hub:

1. Open Content Autopilot on a phone-sized screen.
2. Confirm all provider flags are still off.
3. Upload a short non-customer test video and watch the resumable progress.
4. Save a manual draft, preview each platform, schedule it, and confirm the
   individual jobs appear in Content Library.
5. Connect and test one provider.
6. Enable only that provider's live flag and publish a private test.
7. Close the browser, wait for the worker, reopen Content Library, and verify
   the provider ID/link and audit history.
8. Simulate one invalid/expired authorization and confirm only that platform
   fails and can be retried without republishing successful platforms.

Do not enable `AUTOPILOT_LEVEL4_ENABLED`. Level 4 must remain opt-in and will be
activated only after privacy/confidence exception handling and real-provider
acceptance tests are complete.

## Environment-variable checklist

Required for the module foundation:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CONTENT_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET` and/or `CONTENT_WORKER_SECRET`
- `OWNER_HUB_PUBLIC_URL`

Required for AI: `OPENAI_API_KEY`, optionally `OPENAI_CONTENT_MODEL`.

Required for Meta: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, and
`META_GRAPH_API_VERSION`.

Required for Google Business Profile or YouTube: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.

The complete names-only template is in `.env.example`. Provider secrets,
refresh tokens, access tokens, encryption keys, and worker keys must never use a
`VITE_` prefix or be committed.
