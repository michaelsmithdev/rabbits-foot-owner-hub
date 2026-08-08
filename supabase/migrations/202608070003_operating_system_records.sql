-- Additive Owner Hub v2.2 record types. Existing business records remain untouched.
alter table public.business_records
  drop constraint if exists business_records_record_type_check;

alter table public.business_records
  add constraint business_records_record_type_check
  check (
    record_type in (
      'customer',
      'estimate',
      'invoice',
      'settings',
      'photo',
      'walkthrough',
      'pricebook',
      'job'
    )
  );
