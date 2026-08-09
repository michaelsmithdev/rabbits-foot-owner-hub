-- Owner Hub 2.3 scheduling and communication records.
alter table public.business_records
  drop constraint if exists business_records_record_type_check;

alter table public.business_records
  add constraint business_records_record_type_check
  check (
    record_type in (
      'customer', 'estimate', 'invoice', 'settings', 'photo',
      'walkthrough', 'pricebook', 'job', 'appointment', 'communication'
    )
  );

create table if not exists public.customer_portal_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists customer_portal_links_lookup_idx
  on public.customer_portal_links(token_hash, expires_at)
  where revoked_at is null;

alter table public.customer_portal_links enable row level security;

drop policy if exists "Members can manage customer portal links" on public.customer_portal_links;
create policy "Members can manage customer portal links"
on public.customer_portal_links for all
to authenticated
using (private.is_organization_member(organization_id))
with check (private.is_organization_member(organization_id));

grant select, insert, update, delete on public.customer_portal_links to authenticated;

create table if not exists public.square_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.square_webhook_events enable row level security;

-- Server routes use the service role for verified customer approvals and Square events.
grant select on table public.organization_members to service_role;
grant select, insert, update on table public.business_records to service_role;
grant select, insert, update, delete on table public.customer_portal_links to service_role;
grant select, insert on table public.square_webhook_events to service_role;
