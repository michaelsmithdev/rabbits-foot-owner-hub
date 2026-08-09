# Owner Hub commercial release runbook

This checklist covers the external controls that cannot be guaranteed by application code alone.

## Required before selling subscriptions

1. Apply every SQL migration in `supabase/migrations`, including `202608090007_commercial_launch_controls.sql`.
2. Confirm production has all variables listed in `.env.example`. Keep every server-only secret out of variables whose names begin with `VITE_`.
3. Configure Square subscription plan variation IDs for Starter, Pro, and Team, then test purchase, webhook renewal, past-due, cancel-at-period-end, and renewal restoration with a non-owner test workspace.
4. Keep plan purchase and plan changes in the web dashboard. The Android build may display plan status, but it must not launch Square checkout for digital app access.
5. Publish the public URLs `/#privacy`, `/#terms`, `/#delete-account`, and `/#support` in the Play Console and sales site.

## Reliability operations

1. Monitor `GET /api/health`; alert when it returns a non-200 response or reports `status: degraded`.
2. Enable Vercel function error alerts and review logs for authentication, AI, Square, sync, and deletion-request failures.
3. Use a paid Supabase plan with daily backups for a commercial service, or schedule frequent database exports if remaining on Free. Test a restore before launch.
4. Review pending `account_deletion_requests` every business day. Verify ownership before deletion, document the result, and complete requests within the published time frame.
5. Export a portable workspace backup before destructive support operations.

## Release verification

Run:

```text
npm test
npm run lint
npm run build
npm run build:android
```

Then verify fresh sign-up, returning sign-in, trial expiry, offline launch, sync recovery, customer portal, estimate approval, Square payment, PDF generation, account export, account deletion request, and Android cold/warm starts.

## Launch ownership

- Product support and deletion requests: `callrabbitsfoot@gmail.com`
- Legal text should receive qualified legal review before subscriptions are offered outside the current business.
- Pricing, refund policy, response-time promise, backup owner, and incident owner must be documented before accepting outside customers.
