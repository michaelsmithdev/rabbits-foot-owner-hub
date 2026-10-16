-- Production email delivery health, idempotency, and verified webhook support.
-- Additive only: existing customer records and email addresses are preserved.

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,
  document_id text,
  email_type text not null check (
    email_type in ('estimate', 'invoice', 'customer_message', 'receipt', 'system_notification')
  ),
  recipient text not null check (
    recipient = lower(trim(recipient))
    and char_length(recipient) between 6 and 254
  ),
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed')
  ),
  provider_message_id text,
  idempotency_key text not null,
  error_code text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  bounced_at timestamptz,
  unique (organization_id, idempotency_key)
);

create unique index if not exists email_delivery_logs_provider_message_idx
  on public.email_delivery_logs(provider_message_id)
  where provider_message_id is not null;

create index if not exists email_delivery_logs_customer_created_idx
  on public.email_delivery_logs(organization_id, customer_id, created_at desc);

create index if not exists email_delivery_logs_recipient_created_idx
  on public.email_delivery_logs(organization_id, recipient, created_at desc);

create table if not exists public.customer_email_health (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id text not null,
  email text not null check (
    email = lower(trim(email))
    and char_length(email) between 6 and 254
  ),
  status text not null default 'unknown' check (
    status in ('unknown', 'valid', 'delivered', 'bounced', 'complained', 'suppressed')
  ),
  last_email_sent_at timestamptz,
  last_email_delivered_at timestamptz,
  last_email_bounced_at timestamptz,
  email_bounce_count integer not null default 0 check (email_bounce_count >= 0),
  email_send_count integer not null default 0 check (email_send_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, customer_id, email)
);

create index if not exists customer_email_health_status_idx
  on public.customer_email_health(organization_id, status, updated_at desc);

create table if not exists public.email_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.sync_customer_email_health_from_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.customer_email_health(
      organization_id, customer_id, email, status, updated_at
    ) values (
      new.organization_id, new.customer_id, new.recipient, 'unknown', now()
    )
    on conflict (organization_id, customer_id, email)
    do update set updated_at = excluded.updated_at;
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'sent' then
    update public.customer_email_health set
      status = case when status in ('bounced', 'complained', 'suppressed') then status else 'valid' end,
      email_send_count = email_send_count + 1,
      last_email_sent_at = now(),
      updated_at = now()
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and email = new.recipient;
  elsif new.status = 'delivered' then
    update public.customer_email_health set
      status = 'delivered',
      last_email_delivered_at = coalesce(new.delivered_at, now()),
      updated_at = now()
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and email = new.recipient;
  elsif new.status in ('bounced', 'complained', 'suppressed') then
    update public.customer_email_health set
      status = new.status,
      email_bounce_count = email_bounce_count + 1,
      last_email_bounced_at = coalesce(new.bounced_at, now()),
      updated_at = now()
    where organization_id = new.organization_id
      and customer_id = new.customer_id
      and email = new.recipient;
  end if;

  return new;
end;
$$;

drop trigger if exists email_delivery_logs_sync_health on public.email_delivery_logs;
create trigger email_delivery_logs_sync_health
after insert or update of status on public.email_delivery_logs
for each row execute function public.sync_customer_email_health_from_log();

alter table public.email_delivery_logs enable row level security;
alter table public.customer_email_health enable row level security;
alter table public.email_webhook_events enable row level security;

drop policy if exists "Members can view email delivery logs" on public.email_delivery_logs;
create policy "Members can view email delivery logs"
on public.email_delivery_logs for select
to authenticated
using (private.is_organization_member(organization_id));

drop policy if exists "Members can view customer email health" on public.customer_email_health;
create policy "Members can view customer email health"
on public.customer_email_health for select
to authenticated
using (private.is_organization_member(organization_id));

grant select on public.email_delivery_logs, public.customer_email_health to authenticated;
grant select, insert, update on public.email_delivery_logs, public.customer_email_health to service_role;
grant select, insert on public.email_webhook_events to service_role;

comment on table public.email_delivery_logs is
  'Minimal transactional email metadata. Message bodies and credentials are intentionally excluded.';
comment on table public.customer_email_health is
  'Non-destructive delivery health for a customer email address. Customer email fields remain unchanged.';
