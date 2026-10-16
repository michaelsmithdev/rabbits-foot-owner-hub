-- Content Autopilot foundation.
-- Provider credentials remain service-role only; browser roles never receive
-- grants or policies for content_social_secrets.

create table if not exists public.content_social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  external_account_id text,
  external_resource_id text,
  display_name text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending', 'connected', 'token_expired', 'error')),
  scopes text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);
alter table public.content_social_connections drop constraint if exists content_social_connections_provider_check;
alter table public.content_social_connections add constraint content_social_connections_provider_check
check (provider in ('facebook', 'google_business', 'youtube'));

alter table public.usage_events drop constraint if exists usage_events_event_type_check;
alter table public.usage_events add constraint usage_events_event_type_check
check (event_type in ('ai_estimate', 'ai_transcription', 'ai_content', 'photo_upload', 'video_upload', 'social_publish', 'sms', 'email'));

create table if not exists public.content_social_secrets (
  connection_id uuid primary key references public.content_social_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_oauth_states (
  token_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  redirect_origin text,
  code_verifier_ciphertext text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.content_oauth_states drop constraint if exists content_oauth_states_provider_check;
alter table public.content_oauth_states add constraint content_oauth_states_provider_check
check (provider in ('facebook', 'google_business', 'youtube'));

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  video_storage_key text not null,
  thumbnail_storage_key text,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  duration_seconds numeric,
  width integer,
  height integer,
  aspect_ratio text,
  upload_status text not null default 'uploading'
    check (upload_status in ('uploading', 'uploaded', 'failed')),
  linked_customer_id text,
  linked_estimate_id text,
  linked_invoice_id text,
  linked_job_id text,
  job_context jsonb not null default '{}'::jsonb,
  master_caption text not null default '',
  content_type text not null default 'other',
  creation_mode text not null default 'manual'
    check (creation_mode in ('manual', 'ai_assisted', 'ai_draft', 'autopilot')),
  autonomy_level smallint not null default 0 check (autonomy_level between 0 and 4),
  video_analysis jsonb,
  privacy_warnings jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'publishing', 'partially_published', 'published', 'failed', 'canceled', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_org_created_idx on public.content_items(organization_id, created_at desc);
create index if not exists content_items_job_idx on public.content_items(organization_id, linked_job_id);

create table if not exists public.content_platform_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  provider text not null,
  enabled boolean not null default true,
  title text not null default '',
  caption text not null default '',
  description text not null default '',
  hashtags text[] not null default '{}',
  tags text[] not null default '{}',
  call_to_action text,
  call_to_action_url text,
  provider_metadata jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  provider_url text,
  status text not null default 'draft'
    check (status in ('draft', 'uploading', 'queued', 'processing', 'scheduled', 'publishing', 'published', 'failed', 'retrying', 'canceled', 'needs_review')),
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_item_id, provider)
);
alter table public.content_platform_posts drop constraint if exists content_platform_posts_provider_check;
alter table public.content_platform_posts add constraint content_platform_posts_provider_check
check (provider in ('facebook', 'google_business', 'youtube'));
create index if not exists content_platform_posts_org_status_idx on public.content_platform_posts(organization_id, status, scheduled_at);

create table if not exists public.content_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_post_id uuid not null references public.content_platform_posts(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'scheduled', 'publishing', 'published', 'failed', 'retrying', 'canceled', 'needs_review')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 12),
  idempotency_key text not null unique,
  provider_session_id text,
  progress smallint not null default 0 check (progress between 0 and 100),
  scheduled_at timestamptz,
  next_attempt_at timestamptz,
  leased_until timestamptz,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  provider_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_publish_jobs_ready_idx on public.content_publish_jobs(status, next_attempt_at, scheduled_at);
create index if not exists content_publish_jobs_post_idx on public.content_publish_jobs(platform_post_id, created_at desc);

create table if not exists public.content_ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  platform text,
  model text not null,
  prompt_version text not null,
  request_type text not null default 'platform_copy',
  generated_output jsonb not null,
  input_units integer,
  output_units integer,
  approximate_cost numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.content_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ai_generation_id uuid not null references public.content_ai_generations(id) on delete cascade,
  platform text,
  original_output jsonb not null,
  final_output jsonb,
  rating smallint check (rating in (-1, 1)),
  feedback_reason text,
  edit_diff jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.content_brand_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_name text not null default '',
  business_description text not null default '',
  service_area text not null default '',
  website text not null default '',
  phone text not null default '',
  default_cta text not null default '',
  primary_services text[] not null default '{}',
  writing_style text not null default 'Professional, direct, local, and conversational.',
  emoji_preference text not null default 'minimal',
  hashtag_preference text not null default '2-4 relevant hashtags',
  phrases_to_avoid text[] not null default '{}',
  youtube_category_id text not null default '26',
  platform_preferences jsonb not null default '{}'::jsonb,
  autonomy_level smallint not null default 0 check (autonomy_level between 0 and 4),
  timezone text not null default 'America/New_York',
  content_goals jsonb not null default '{"facebook":3,"google_business":2,"youtube":2}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_brand_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null,
  source text not null check (source in ('owner', 'learned')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  accepted boolean,
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (organization_id, preference_key, source)
);

create table if not exists public.content_embeddings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  model text not null,
  embedding double precision[] not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.content_post_metrics (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_post_id uuid not null references public.content_platform_posts(id) on delete cascade,
  metric text not null,
  value numeric not null,
  captured_at timestamptz not null default now(),
  unique (platform_post_id, metric, captured_at)
);

create table if not exists public.content_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  platform_post_id uuid references public.content_platform_posts(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_audit_logs_item_idx on public.content_audit_logs(content_item_id, created_at desc);

-- Claim work atomically so concurrent cron/manual dispatches cannot publish the
-- same provider job twice. A stale publishing lease requires reconciliation;
-- it is never silently republished.
create or replace function public.claim_content_publish_jobs(claim_limit integer default 3)
returns setof public.content_publish_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select jobs.id
    from public.content_publish_jobs jobs
    where jobs.status in ('queued', 'retrying', 'scheduled')
      and coalesce(jobs.next_attempt_at, jobs.scheduled_at, jobs.queued_at) <= now()
      and (jobs.leased_until is null or jobs.leased_until < now())
    order by coalesce(jobs.next_attempt_at, jobs.scheduled_at, jobs.queued_at)
    for update skip locked
    limit greatest(1, least(claim_limit, 10))
  )
  update public.content_publish_jobs jobs
  set status = 'publishing',
      started_at = coalesce(jobs.started_at, now()),
      leased_until = now() + interval '5 minutes',
      attempt_count = jobs.attempt_count + 1,
      updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;
revoke all on function public.claim_content_publish_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_content_publish_jobs(integer) to service_role;

alter table public.content_social_connections enable row level security;
alter table public.content_social_secrets enable row level security;
alter table public.content_oauth_states enable row level security;
alter table public.content_items enable row level security;
alter table public.content_platform_posts enable row level security;
alter table public.content_publish_jobs enable row level security;
alter table public.content_ai_generations enable row level security;
alter table public.content_ai_feedback enable row level security;
alter table public.content_brand_profiles enable row level security;
alter table public.content_brand_preferences enable row level security;
alter table public.content_embeddings enable row level security;
alter table public.content_post_metrics enable row level security;
alter table public.content_audit_logs enable row level security;

drop policy if exists "Members can view content connections" on public.content_social_connections;
create policy "Members can view content connections" on public.content_social_connections
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can view content" on public.content_items;
create policy "Members can view content" on public.content_items
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can create content" on public.content_items;
create policy "Members can create content" on public.content_items
for insert to authenticated with check (private.is_organization_member(organization_id) and created_by = (select auth.uid()));
drop policy if exists "Members can update content" on public.content_items;
create policy "Members can update content" on public.content_items
for update to authenticated using (private.is_organization_member(organization_id)) with check (private.is_organization_member(organization_id));
drop policy if exists "Managers can delete content" on public.content_items;
create policy "Managers can delete content" on public.content_items
for delete to authenticated using (private.can_manage_organization(organization_id));
drop policy if exists "Members can view platform posts" on public.content_platform_posts;
create policy "Members can view platform posts" on public.content_platform_posts
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can view publish jobs" on public.content_publish_jobs;
create policy "Members can view publish jobs" on public.content_publish_jobs
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can view AI generations" on public.content_ai_generations;
create policy "Members can view AI generations" on public.content_ai_generations
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can view AI feedback" on public.content_ai_feedback;
create policy "Members can view AI feedback" on public.content_ai_feedback
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Members can add AI feedback" on public.content_ai_feedback;
create policy "Members can add AI feedback" on public.content_ai_feedback
for insert to authenticated with check (private.is_organization_member(organization_id));
drop policy if exists "Members can manage brand profile" on public.content_brand_profiles;
create policy "Members can manage brand profile" on public.content_brand_profiles
for all to authenticated using (private.is_organization_member(organization_id)) with check (private.is_organization_member(organization_id));
drop policy if exists "Members can view brand preferences" on public.content_brand_preferences;
create policy "Members can view brand preferences" on public.content_brand_preferences
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Managers can manage brand preferences" on public.content_brand_preferences;
create policy "Managers can manage brand preferences" on public.content_brand_preferences
for all to authenticated using (private.can_manage_organization(organization_id)) with check (private.can_manage_organization(organization_id));
drop policy if exists "Members can view content metrics" on public.content_post_metrics;
create policy "Members can view content metrics" on public.content_post_metrics
for select to authenticated using (private.is_organization_member(organization_id));
drop policy if exists "Managers can view content audit" on public.content_audit_logs;
create policy "Managers can view content audit" on public.content_audit_logs
for select to authenticated using (private.can_manage_organization(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-videos',
  'content-videos',
  false,
  2147483648,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/avi', 'video/x-msvideo']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can view content videos" on storage.objects;
create policy "Members can view content videos" on storage.objects for select to authenticated
using (bucket_id = 'content-videos' and private.is_organization_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "Members can upload content videos" on storage.objects;
create policy "Members can upload content videos" on storage.objects for insert to authenticated
with check (bucket_id = 'content-videos' and private.is_organization_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "Managers can delete content videos" on storage.objects;
create policy "Managers can delete content videos" on storage.objects for delete to authenticated
using (bucket_id = 'content-videos' and private.can_manage_organization(((storage.foldername(name))[1])::uuid));

grant select, insert, update, delete on public.content_items to authenticated;
grant select on public.content_social_connections, public.content_platform_posts,
  public.content_publish_jobs, public.content_ai_generations,
  public.content_post_metrics, public.content_audit_logs to authenticated;
grant select, insert on public.content_ai_feedback to authenticated;
grant select, insert, update, delete on public.content_brand_profiles,
  public.content_brand_preferences to authenticated;
grant usage, select on sequence public.content_post_metrics_id_seq to authenticated;
grant select, insert, update, delete on public.content_social_connections,
  public.content_social_secrets, public.content_oauth_states, public.content_items,
  public.content_platform_posts, public.content_publish_jobs, public.content_ai_generations,
  public.content_ai_feedback, public.content_brand_profiles, public.content_brand_preferences,
  public.content_embeddings, public.content_post_metrics, public.content_audit_logs to service_role;
grant usage, select on sequence public.content_post_metrics_id_seq,
  public.content_audit_logs_id_seq to service_role;
