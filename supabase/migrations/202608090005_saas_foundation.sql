-- Subscription-ready multi-business foundation.
-- Safe to run more than once. Existing Rabbit's Foot data remains attached to
-- its current organization and receives a grandfathered Pro subscription.

create extension if not exists pgcrypto;

alter table public.organizations
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists accent_color text not null default '#78c800',
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.organizations
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(id::text, 8)
where slug is null;

alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_key on public.organizations(slug);

create or replace function private.organization_role(requested_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.organization_members
  where organization_id = requested_organization_id
    and user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.can_manage_organization(requested_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.organization_role(requested_organization_id) in ('owner', 'admin'), false);
$$;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'team')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  square_customer_id text,
  square_subscription_id text unique,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_subscriptions (
  organization_id, plan, status, current_period_ends_at
)
select id, 'pro', 'active', now() + interval '100 years'
from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists organization_invites_org_idx on public.organization_invites(organization_id, created_at desc);

create table if not exists public.integration_connections (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('square', 'quickbooks', 'google_calendar')),
  status text not null default 'disconnected' check (status in ('disconnected', 'pending', 'connected', 'error')),
  merchant_id text,
  location_id text,
  connected_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);

-- This table is intentionally not granted to browser roles. Only server routes
-- using the service role may read encrypted integration credentials.
create table if not exists public.integration_secrets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);

create table if not exists public.integration_oauth_states (
  token_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'square'),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('ai_estimate', 'ai_transcription', 'photo_upload', 'sms', 'email')),
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists usage_events_org_month_idx on public.usage_events(organization_id, occurred_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_logs_org_idx on public.audit_logs(organization_id, occurred_at desc);

create or replace function public.create_member_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_profiles(user_id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
after insert or update of email on auth.users
for each row execute function public.create_member_profile();

insert into public.member_profiles(user_id, email, display_name)
select id, coalesce(email, ''), coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_owner_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
  requested_name text;
begin
  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    'My Service Business'
  );

  insert into public.organizations(name, slug)
  values (
    left(requested_name, 120),
    lower(regexp_replace(left(requested_name, 80), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(new.id::text, 8)
  )
  returning id into new_organization_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (new_organization_id, new.id, 'owner');

  insert into public.organization_subscriptions(organization_id, plan, status, trial_ends_at)
  values (new_organization_id, 'pro', 'trialing', now() + interval '14 days');

  insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id)
  values (new_organization_id, new.id, 'workspace.created', 'organization', new_organization_id::text);

  return new;
end;
$$;

alter table public.member_profiles enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.organization_invites enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Members can view organization profiles" on public.member_profiles;
create policy "Members can view organization profiles" on public.member_profiles for select to authenticated
using (exists (
  select 1 from public.organization_members mine
  join public.organization_members theirs on theirs.organization_id = mine.organization_id
  where mine.user_id = (select auth.uid()) and theirs.user_id = member_profiles.user_id
));

drop policy if exists "Members can view subscriptions" on public.organization_subscriptions;
create policy "Members can view subscriptions" on public.organization_subscriptions for select to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Managers can view invites" on public.organization_invites;
create policy "Managers can view invites" on public.organization_invites for select to authenticated
using (private.can_manage_organization(organization_id));
drop policy if exists "Managers can create invites" on public.organization_invites;
create policy "Managers can create invites" on public.organization_invites for insert to authenticated
with check (private.can_manage_organization(organization_id) and invited_by = (select auth.uid()));
drop policy if exists "Managers can update invites" on public.organization_invites;
create policy "Managers can update invites" on public.organization_invites for update to authenticated
using (private.can_manage_organization(organization_id)) with check (private.can_manage_organization(organization_id));

drop policy if exists "Members can view integrations" on public.integration_connections;
create policy "Members can view integrations" on public.integration_connections for select to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Members can view usage" on public.usage_events;
create policy "Members can view usage" on public.usage_events for select to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Managers can view audit logs" on public.audit_logs;
create policy "Managers can view audit logs" on public.audit_logs for select to authenticated
using (private.can_manage_organization(organization_id));

drop policy if exists "Members can update their organization" on public.organizations;
create policy "Members can update their organization" on public.organizations for update to authenticated
using (private.can_manage_organization(id)) with check (private.can_manage_organization(id));

drop policy if exists "Managers can view organization members" on public.organization_members;
create policy "Managers can view organization members" on public.organization_members for select to authenticated
using (private.is_organization_member(organization_id));
drop policy if exists "Owners can update organization members" on public.organization_members;
create policy "Owners can update organization members" on public.organization_members for update to authenticated
using (private.organization_role(organization_id) = 'owner') with check (private.organization_role(organization_id) = 'owner');
drop policy if exists "Owners can remove organization members" on public.organization_members;
create policy "Owners can remove organization members" on public.organization_members for delete to authenticated
using (private.organization_role(organization_id) = 'owner' and user_id <> (select auth.uid()));

-- Technicians may work with records but destructive business-data operations
-- require an owner or administrator.
drop policy if exists "Members can delete business records" on public.business_records;
create policy "Managers can delete business records" on public.business_records for delete to authenticated
using (private.can_manage_organization(organization_id));
drop policy if exists "Members can delete leads" on public.leads;
create policy "Managers can delete leads" on public.leads for delete to authenticated
using (private.can_manage_organization(organization_id));

create or replace function public.audit_business_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization uuid;
  target_type text;
  target_id text;
begin
  target_organization := coalesce(new.organization_id, old.organization_id);
  target_type := coalesce(new.record_type, old.record_type);
  target_id := coalesce(new.record_id, old.record_id);
  insert into public.audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    target_organization,
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'record.created' when tg_op = 'DELETE' then 'record.deleted' else 'record.updated' end,
    target_type,
    target_id,
    jsonb_build_object('operation', tg_op)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_business_records on public.business_records;
create trigger audit_business_records after insert or update or delete on public.business_records
for each row execute function public.audit_business_record_change();

grant execute on function private.organization_role(uuid), private.can_manage_organization(uuid) to authenticated;
grant select, update on public.organizations to authenticated;
grant select, update, delete on public.organization_members to authenticated;
grant select on public.member_profiles, public.organization_subscriptions, public.integration_connections, public.usage_events, public.audit_logs to authenticated;
grant select, insert, update on public.organization_invites to authenticated;
revoke all on public.integration_secrets from anon, authenticated;
revoke all on public.integration_oauth_states from anon, authenticated;
