# Owner Hub production email setup

The application code keeps Resend and Supabase SMTP credentials on the server. Never add these values to React code, Capacitor configuration, `localStorage`, or any variable beginning with `VITE_`.

## 1. Verify the Rabbit's Foot domain in Resend

1. Sign in to Resend and open **Domains**.
2. Add `callrabbitsfoot.com` (or an authentication subdomain such as `auth.callrabbitsfoot.com`).
3. Resend will display the exact DNS records required for SPF and DKIM. Copy those records into the DNS provider exactly as Resend shows them.
4. Add a DMARC TXT record using a policy appropriate for the business. Start with monitoring if no DMARC policy exists, then tighten it after reviewing reports. Use the actual values approved by the domain/DNS administrator; do not guess them.
5. Wait until Resend reports the domain as **Verified**.

## 2. Create the production Resend credentials

1. Create a Resend API key for the Owner Hub production environment.
2. Add these server-only variables to the Vercel production project:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` — for example `no-reply@callrabbitsfoot.com`, only after that domain is verified
3. Redeploy the Vercel application after saving the variables.

## 3. Configure Supabase Auth custom SMTP

In the Supabase project, open **Authentication → Email/SMTP settings** and enable custom SMTP:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the Resend API key stored securely in the Supabase dashboard
- Sender name: `Rabbit's Foot Owner Hub`
- Sender address: a verified address, preferably `no-reply@auth.callrabbitsfoot.com` when that subdomain is configured

Do not put the SMTP password in this repository or in Vercel browser variables.

## 4. Configure authentication URLs

In **Supabase → Authentication → URL Configuration**:

1. Set the Site URL to the deployed Owner Hub web URL.
2. Add the deployed Vercel URL and the final production domain as allowed redirect URLs.
3. Keep the URL used by `VITE_PUBLIC_PORTAL_URL` in the allow list.
4. Do not leave `localhost` as the only production redirect.

Confirmation and password-reset links open the secure deployed web app. After confirmation, Android users can return to the app and sign in with the confirmed account.

## 5. Apply the email-delivery migration

Apply `supabase/migrations/202608230012_production_email_delivery.sql` through the normal Supabase migration workflow. It adds:

- `email_delivery_logs`
- `customer_email_health`
- `email_webhook_events`
- RLS read policies for organization members
- Server-only write permissions and delivery-health triggers

The migration is additive and does not delete or rewrite customer emails.

## 6. Configure the verified Resend webhook

1. In Resend, create a webhook with endpoint:
   `https://YOUR-OWNER-HUB-DOMAIN/api/resend-webhook`
2. Subscribe to at least:
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
   - `email.suppressed`
   - `email.delivery_delayed`
3. Copy the webhook signing secret into the Vercel server-only variable `RESEND_WEBHOOK_SECRET`.
4. Redeploy.

The route verifies Resend's Svix signature against the unmodified request body before processing an event. Replayed webhook IDs are ignored.

## 7. Safe activation sequence

1. Verify the domain.
2. Apply the database migration.
3. Configure Resend server variables in Vercel.
4. Configure Supabase custom SMTP.
5. Configure and sign the Resend webhook.
6. Redeploy.
7. Send one confirmation email to a controlled address.
8. Send one estimate to a controlled customer address.
9. Confirm Resend shows **Delivered** and the Owner Hub customer profile updates from **Sent** to **Delivered**.
10. Review Resend logs for bounces before broader use.

## Failure recovery

- A hard bounce, complaint, or suppression marks that exact customer address as blocked.
- The address remains on the customer record so the owner can correct it.
- Changing the customer's address allows a new validated address to be used.
- Provider acceptance is recorded as `sent`; only a verified webhook changes it to `delivered`.
