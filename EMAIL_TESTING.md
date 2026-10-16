# Safe email testing

**DO NOT TEST USING RANDOM EMAIL ADDRESSES.** Random or invented public addresses can bounce, damage sender reputation, and cause Supabase or Resend restrictions.

Use only:

- A controlled address owned by the developer or business.
- A documented Resend test address when testing provider behavior.
- Supabase's local email capture tool for local Auth testing.

## Minimal production smoke test

1. Confirm the Resend domain, Vercel variables, Supabase custom SMTP, migration, and webhook are configured.
2. Create a customer with a controlled valid email address.
3. Send one estimate and wait for its status to change from **Sent** to **Delivered**.
4. Send one invoice and verify the secure Customer Hub link.
5. Request one password-reset email by explicit button click.
6. Do not repeat a test while the first request is still processing.

## Bounce testing

Use only Resend's documented test addresses for provider simulations. Never deliberately send to a random domain or a real address that is not controlled by the tester.

After a simulated hard bounce, verify:

- The customer record still exists and still shows the address.
- Email Delivery shows a bounce warning.
- A repeat send is blocked until the customer address is corrected.

## Web and Android

- Web sends must use the authenticated `/api/send-email` request.
- Android sends must use the same configured `VITE_OWNER_HUB_API_URL`; no Resend secret is bundled into the app.
- Authentication links should use the deployed web URL configured in Supabase, not localhost-only redirects.
