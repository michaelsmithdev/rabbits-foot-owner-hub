create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);

create or replace function private.is_organization_member(requested_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = requested_organization_id
      and user_id = (select auth.uid())
  );
$$;

create table if not exists public.business_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_type text not null check (record_type in ('customer', 'estimate', 'invoice')),
  record_id text not null,
  payload jsonb,
  is_deleted boolean not null default false,
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (organization_id, record_type, record_id),
  check ((is_deleted and payload is null) or (not is_deleted and payload is not null))
);

create index if not exists business_records_organization_updated_idx
  on public.business_records(organization_id, server_updated_at desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source text not null default 'website',
  status text not null default 'unread' check (status in ('unread', 'read', 'flagged', 'archived')),
  name text not null check (char_length(name) between 1 and 100),
  phone text not null check (char_length(phone) between 1 and 40),
  email text not null check (char_length(email) between 3 and 150),
  service text not null check (char_length(service) between 1 and 100),
  address text not null default '',
  description text not null check (char_length(description) between 1 and 5000),
  photo_paths text[] not null default '{}',
  activity jsonb not null default '[]'::jsonb,
  converted_customer_id text,
  estimate_id text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_organization_status_idx
  on public.leads(organization_id, status, submitted_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

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
    'Rabbit''s Foot'
  );

  insert into public.organizations(name)
  values (left(requested_name, 120))
  returning id into new_organization_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (new_organization_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_owner_organization();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.business_records enable row level security;
alter table public.leads enable row level security;

drop policy if exists "Members can view their organization" on public.organizations;
create policy "Members can view their organization"
on public.organizations for select
to authenticated
using (private.is_organization_member(id));

drop policy if exists "Users can view their memberships" on public.organization_members;
create policy "Users can view their memberships"
on public.organization_members for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Members can read business records" on public.business_records;
create policy "Members can read business records"
on public.business_records for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Members can create business records" on public.business_records;
create policy "Members can create business records"
on public.business_records for insert
to authenticated
with check (private.is_organization_member(organization_id));

drop policy if exists "Members can update business records" on public.business_records;
create policy "Members can update business records"
on public.business_records for update
to authenticated
using (private.is_organization_member(organization_id))
with check (private.is_organization_member(organization_id));

drop policy if exists "Members can delete business records" on public.business_records;
create policy "Members can delete business records"
on public.business_records for delete
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Members can read leads" on public.leads;
create policy "Members can read leads"
on public.leads for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Members can create leads" on public.leads;
create policy "Members can create leads"
on public.leads for insert
to authenticated
with check (private.is_organization_member(organization_id));

drop policy if exists "Members can update leads" on public.leads;
create policy "Members can update leads"
on public.leads for update
to authenticated
using (private.is_organization_member(organization_id))
with check (private.is_organization_member(organization_id));

drop policy if exists "Members can delete leads" on public.leads;
create policy "Members can delete leads"
on public.leads for delete
to authenticated
using (private.is_organization_member(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-attachments',
  'lead-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can view lead attachments" on storage.objects;
create policy "Members can view lead attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'lead-attachments'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
);

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant select on public.organizations, public.organization_members to authenticated;
grant select, insert, update, delete on public.business_records, public.leads to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_records'
  ) then
    alter publication supabase_realtime add table public.business_records;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;
