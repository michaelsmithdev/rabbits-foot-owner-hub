alter table public.business_records
  drop constraint if exists business_records_record_type_check;

alter table public.business_records
  add constraint business_records_record_type_check
  check (record_type in ('customer', 'estimate', 'invoice', 'settings', 'photo'));

grant select, insert, update on table public.leads to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-photos',
  'business-photos',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can view business photos" on storage.objects;
create policy "Members can view business photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-photos'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Members can upload business photos" on storage.objects;
create policy "Members can upload business photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'business-photos'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Members can update business photos" on storage.objects;
create policy "Members can update business photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'business-photos'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'business-photos'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Members can delete business photos" on storage.objects;
create policy "Members can delete business photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'business-photos'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid)
);
