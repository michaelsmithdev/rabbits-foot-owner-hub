-- Commercial launch controls: track verified account-deletion requests.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  requested_email text not null,
  reason text not null default '',
  source text not null default 'in-app',
  status text not null default 'pending' check (status in ('pending', 'verified', 'processing', 'completed', 'canceled', 'rejected')),
  due_at timestamptz not null default (now() + interval '7 days'),
  verified_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_status_due_idx on public.account_deletion_requests(status, due_at);
create index if not exists account_deletion_requests_user_idx on public.account_deletion_requests(user_id, created_at desc);
create unique index if not exists account_deletion_requests_one_open_email_idx
  on public.account_deletion_requests(lower(requested_email))
  where status in ('pending', 'verified', 'processing');
alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users can view their deletion requests" on public.account_deletion_requests;
create policy "Users can view their deletion requests" on public.account_deletion_requests for select to authenticated using (user_id = auth.uid());

grant select on public.account_deletion_requests to authenticated;
grant select, insert, update on public.account_deletion_requests to service_role;
