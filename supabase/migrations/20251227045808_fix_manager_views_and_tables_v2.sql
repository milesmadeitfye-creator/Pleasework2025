/*
  # Fix Manager Views and Tables V2

  1. Update View: smartlink_events with event_type column
    - PRESERVES all existing columns from link_click_events
    - ADDS event_type = 'click' for UI filtering compatibility
    - Grants select to anon and authenticated

  2. New Table: ads_autopilot_rules
    - Minimal viable schema to stop 404 errors
    - RLS enabled with user_id policies
    - Grants to authenticated users only
    - Includes updated_at trigger

  3. Security
    - RLS enabled on ads_autopilot_rules
    - Policies check auth.uid() = user_id
    - View inherits security from source tables
*/

BEGIN;

-- 1) Fix smartlink_events view - PRESERVE all existing columns + add event_type
CREATE OR REPLACE VIEW public.smartlink_events AS
  SELECT
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
    link_id AS smart_link_id,
    link_id AS smartlink_id,
    'click'::text AS event_type
  FROM public.link_click_events lce
  WHERE lce.link_type = 'smart_link';

-- Grant select on view
GRANT SELECT ON public.smartlink_events TO anon, authenticated;

-- 2) Create ads_autopilot_rules table if missing (frontend queries it)
CREATE TABLE IF NOT EXISTS public.ads_autopilot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS ads_autopilot_rules_user_id_idx
  ON public.ads_autopilot_rules(user_id);

-- Updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Updated_at trigger
DROP TRIGGER IF EXISTS ads_autopilot_rules_set_updated_at ON public.ads_autopilot_rules;
CREATE TRIGGER ads_autopilot_rules_set_updated_at
  BEFORE UPDATE ON public.ads_autopilot_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.ads_autopilot_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies (idempotent)
DROP POLICY IF EXISTS "ads_autopilot_rules_select_own" ON public.ads_autopilot_rules;
CREATE POLICY "ads_autopilot_rules_select_own"
  ON public.ads_autopilot_rules
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ads_autopilot_rules_insert_own" ON public.ads_autopilot_rules;
CREATE POLICY "ads_autopilot_rules_insert_own"
  ON public.ads_autopilot_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ads_autopilot_rules_update_own" ON public.ads_autopilot_rules;
CREATE POLICY "ads_autopilot_rules_update_own"
  ON public.ads_autopilot_rules
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_autopilot_rules TO authenticated;

COMMIT;
