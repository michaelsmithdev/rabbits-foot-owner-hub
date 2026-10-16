-- Add private, workspace-synced materials and gas expense records.
alter table public.business_records
  drop constraint if exists business_records_record_type_check;

alter table public.business_records
  add constraint business_records_record_type_check
  check (
    record_type in (
      'customer', 'estimate', 'invoice', 'settings', 'photo',
      'walkthrough', 'pricebook', 'job', 'appointment', 'communication',
      'expense'
    )
  );
