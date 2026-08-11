-- Secure, customer-scoped Realtime access for short-lived Customer Hub tokens.
create or replace function private.is_valid_customer_portal_access(
  target_organization_id uuid,
  target_customer_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_portal_links link
    where link.id::text = auth.jwt() ->> 'portal_link_id'
      and link.organization_id = target_organization_id
      and link.customer_id = target_customer_id
      and link.revoked_at is null
      and link.expires_at > now()
  );
$$;

revoke all on function private.is_valid_customer_portal_access(uuid, text) from public;
grant execute on function private.is_valid_customer_portal_access(uuid, text) to authenticated;

drop policy if exists "Customer portal can receive its own realtime records"
  on public.business_records;

create policy "Customer portal can receive its own realtime records"
on public.business_records
for select
to authenticated
using (
  (auth.jwt() ->> 'portal_customer_id') is not null
  and organization_id::text = auth.jwt() ->> 'portal_organization_id'
  and record_type in ('customer', 'estimate', 'invoice', 'appointment', 'job')
  and (
    (record_type = 'customer' and record_id = auth.jwt() ->> 'portal_customer_id')
    or payload ->> 'customerId' = auth.jwt() ->> 'portal_customer_id'
  )
  and private.is_valid_customer_portal_access(
    organization_id,
    auth.jwt() ->> 'portal_customer_id'
  )
);

grant select on table public.business_records to authenticated;
alter table public.business_records replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_records'
  ) then
    alter publication supabase_realtime add table public.business_records;
  end if;
end
$$;
