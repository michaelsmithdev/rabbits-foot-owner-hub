# Rabbit's Foot Owner Hub

The private business workspace for Rabbit's Foot Handyman Services. The app is
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
