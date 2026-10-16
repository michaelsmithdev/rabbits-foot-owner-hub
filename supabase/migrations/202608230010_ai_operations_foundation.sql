-- Additive AI Operations record types. Existing records and policies remain intact.
alter table public.business_records
  drop constraint if exists business_records_record_type_check;

alter table public.business_records
  add constraint business_records_record_type_check
  check (
    record_type in (
      'customer', 'estimate', 'invoice', 'settings', 'photo',
      'walkthrough', 'pricebook', 'job', 'appointment', 'communication',
      'expense', 'business_event', 'ai_action', 'ai_audit',
      'automation_settings'
    )
  );

comment on constraint business_records_record_type_check on public.business_records is
  'Owner Hub shared web/mobile records, including controlled AI operations and audit history.';
