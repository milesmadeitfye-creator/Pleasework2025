/*
  # Manager Schema Fix - Ghoste AI Requirements

  1. Update View: smartlink_events
    - Add event_type column (literal 'click')
    - Preserves existing columns and structure
    - UI can now filter with event_type=eq.click

  2. New Table: ads_autopilot_rules
    - Minimal viable schema to stop 404 errors
    - RLS enabled with user_id policies
    - Grants to authenticated users only

  3. Security
    - RLS enabled on ads_autopilot_rules
    - Policies check auth.uid() = user_id
    - View inherits security from source tables
*/

begin;

-- Ensure crypto extension for gen_random_uuid
create extension if not exists pgcrypto;

-- Update smartlink_events view to add event_type column
-- Preserves existing columns, adds event_type = 'click'
create or replace view public.smartlink_events as
  select
    id,
    user_id,
    link_type,
    link_slug,
    platform,
    user_agent,
    ip_address,
    created_at,
    owner_user_id,
    link_id,
    referrer,
    slug,
    url,
    metadata,
    link_id as smart_link_id,
    link_id as smartlink_id,
    'click'::text as event_type
  from link_click_events lce
  where link_type = 'smart_link';

-- Ensure grants on view
grant select on public.smartlink_events to anon, authenticated;

-- Create ads_autopilot_rules table if not exists
create table if not exists public.ads_autopilot_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.ads_autopilot_rules enable row level security;

-- Create RLS policies (idempotent)
do $$
begin
  -- SELECT policy
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
    and tablename='ads_autopilot_rules'
    and policyname='ads_autopilot_rules_select_own'
  ) then
    create policy ads_autopilot_rules_select_own
      on public.ads_autopilot_rules
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  -- INSERT policy
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
    and tablename='ads_autopilot_rules'
    and policyname='ads_autopilot_rules_insert_own'
  ) then
    create policy ads_autopilot_rules_insert_own
      on public.ads_autopilot_rules
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  -- UPDATE policy
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
    and tablename='ads_autopilot_rules'
    and policyname='ads_autopilot_rules_update_own'
  ) then
    create policy ads_autopilot_rules_update_own
      on public.ads_autopilot_rules
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  -- DELETE policy
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
    and tablename='ads_autopilot_rules'
    and policyname='ads_autopilot_rules_delete_own'
  ) then
    create policy ads_autopilot_rules_delete_own
      on public.ads_autopilot_rules
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

-- Grant permissions
grant select, insert, update, delete on public.ads_autopilot_rules to authenticated;

commit;
