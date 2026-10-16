# Rabbit's Foot Owner Hub

The private business workspace for Rabbit's Foot Handyman Services LLC. The app is
built with React, Vite, and TypeScript and is designed as an installable,
mobile-first Progressive Web App.

## Run locally

```bash
npm install
npm run dev
```

Open the address printed by Vite. For a production-style PWA test:

```bash
npm run build
npm run preview
```

Use the browser's install control to add the Owner Hub to a phone, tablet, or
desktop. After the first successful load, the application shell can open
offline.

## Quality checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```

The approved Rabbit's Foot shield logo is stored at
`public/rabbits-foot-logo.png`. Its committed PWA icon sizes are used for app
installation, the mobile shell, and printable invoices.

## Secure cloud setup

The Owner Hub uses Supabase Auth, Postgres Row Level Security, Realtime, and a
private Storage bucket. Local records remain available offline and are migrated
into the authenticated business workspace on the first successful sync.

1. Create a Supabase project and run every file in `supabase/migrations` in
   filename order in its SQL editor.
2. Copy `.env.example` to `.env.local`, add the project URL and publishable key,
   then restart the app and choose **First-time setup** on the login screen.
3. Add the server-only values from the website's `.env.example` to Vercel so
   estimate requests are stored in the Owner Hub as well as emailed.

Never place the Supabase service-role key in this Vite project or in a variable
whose name begins with `VITE_` or `NEXT_PUBLIC_`.

## Data protection and synchronization

Customers, estimates, invoices, payments, leads, settings, and photo metadata
are cached on the device for field use. New photos are retained in IndexedDB
while offline, uploaded to a private Supabase Storage bucket when the connection
returns, and restricted to organization members by database policy. The
Settings screen also provides a portable JSON data backup.

## Scheduling, Customer Hub, and Square

Owner Hub 2.3 adds a field schedule, appointment conflict protection, customer
message handoff, and expiring Customer Hub links. Customers can review and
approve estimates, request changes, view scheduled work, and open Square-hosted
invoice checkout without signing in.

Run `supabase/migrations/202608090004_schedule_and_communications.sql` before
using these features in production. Then add the following server-only values
to Vercel:

- `SQUARE_ACCESS_TOKEN` - production token from the Square Developer Console.
- `SQUARE_LOCATION_ID` - the Square location receiving Owner Hub payments.
- `SQUARE_ENVIRONMENT` - `production` for live payments or `sandbox` for tests.
- `SQUARE_WEBHOOK_SIGNATURE_KEY` - signature key for the webhook subscription.
- `SQUARE_WEBHOOK_NOTIFICATION_URL` - exact HTTPS URL ending in
  `/api/square-webhook`.

In the Square Developer Console, subscribe that URL to `payment.created` and
`payment.updated`. Completed checkouts are matched to their secure Square order
and recorded once on the corresponding invoice. Keep every Square credential
out of variables beginning with `VITE_`.
## AI Estimate Assistant configuration

The AI estimator calls the OpenAI Responses API through the authenticated
serverless route at `api/ai-estimate.ts`. The OpenAI key is never included in
the browser or Android bundle.

Required deployment variables:

- `OPENAI_API_KEY` - server-only OpenAI Platform project key.
- `VITE_SUPABASE_URL` - the Owner Hub Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` - the browser-safe Supabase key.

Optional variables:

- `OPENAI_ESTIMATE_MODEL` - defaults to `gpt-5.6-sol`.
- `OWNER_HUB_ALLOWED_ORIGINS` - comma-separated additional web origins.
- `VITE_OWNER_HUB_API_URL` - public API origin used by the Android bundle.

The local `.env.local` and `.env.android.local` files are ignored by Git.
OpenAI API billing must have available credit; a ChatGPT subscription does not
provide API credit.

## Content Autopilot

Content Autopilot adds private resumable video uploads, provider-specific
Facebook/Google Business Profile/YouTube drafts, secure OAuth connections,
independent background publishing jobs, AI-assisted copy, Content Library,
calendar, and Brand Brain foundations. Apply
`supabase/migrations/202608210009_content_autopilot_foundation.sql`, keep all
live provider flags disabled initially, and follow the exact credential and
approval sequence in [docs/CONTENT_AUTOPILOT_SETUP.md](docs/CONTENT_AUTOPILOT_SETUP.md).

Automated tests never call live social APIs. Local development defaults to
clearly labeled mock publishing, while Vercel production always requires both a
real connected account and that provider's explicit live-publishing flag.

## AI Operations and receipt intelligence

AI Operations uses the same offline queue and organization-scoped Supabase
`business_records` data model on web and Android. Apply
`supabase/migrations/202608230010_ai_operations_foundation.sql` after the earlier
migrations. The migration is additive and preserves existing records.

Customer-facing labor pricing and the private internal labor cost are separate
settings. Estimate pricing uses the customer rate; job profitability uses only
the internal cost.

The default **Approval** mode requires the owner to approve every action.
**Manual** mode analyzes only. **Autopilot** is restricted to the owner's
explicit low-risk allowlist and cannot send customer messages, create invoices,
take payments, delete data, change balances, edit accounting history, or change
business configuration.

Receipt extraction and the optional owner-triggered daily AI brief use secure
authenticated server routes. Add `OPENAI_OPERATIONS_MODEL` only to override the
default operations model. The OpenAI key and Supabase service-role key remain
server-only and must never use a `VITE_` prefix.

## Interactive tutorial maintenance

The complete, route-aware tutorial is configured in
`src/features/tutorial/tutorialConfig.ts`. Add new steps there instead of
building page-specific popups. Give the real control or section a stable
`data-tour="feature-name"` attribute, use that value as the step target, and
provide a nearby fallback target when the control depends on saved data.

Tutorial actions are intentionally limited to the allowlist in that same file.
Only harmless actions such as opening an empty form or changing the document
tab belong there. Sending messages, saving records, taking payments, deleting
data, or opening external pages must remain explanation-only steps. Increase
`TUTORIAL_VERSION` only when an older saved step can no longer resume safely.
