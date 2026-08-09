-- AI estimate and transcription routes verify plan limits with the service role.
-- RLS bypass does not replace PostgreSQL table privileges, so grant only the
-- reads and usage writes those server routes require.

grant select on table public.organization_members to service_role;
grant select on table public.organization_subscriptions to service_role;
grant select, insert on table public.usage_events to service_role;
grant usage, select on sequence public.usage_events_id_seq to service_role;
