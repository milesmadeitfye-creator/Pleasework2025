/*
  # Goals Ads Upgrades: Assets Storage + Audiences Enhancement

  Adds goal assets storage and enhances meta_audiences table

  ## Changes

  1. **user_ads_modes enhancements**
     - Add `goal_assets` JSONB for storing selected assets per goal
     - Add `budget_config` JSONB for total budget + allocations

  2. **meta_audiences enhancements**
     - Add missing columns for lookalike support
     - Add helper columns for better tracking

  3. **Helper functions**
     - get_goal_assets() - Retrieve assets for a goal
     - set_goal_assets() - Store assets for a goal
*/

-- Add columns to user_ads_modes
ALTER TABLE public.user_ads_modes
  ADD COLUMN IF NOT EXISTS goal_assets jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS budget_config jsonb DEFAULT '{}'::jsonb;

-- Add columns to meta_audiences
ALTER TABLE public.meta_audiences
  ADD COLUMN IF NOT EXISTS size_estimate integer,
  ADD COLUMN IF NOT EXISTS lookalike_spec jsonb,
  ADD COLUMN IF NOT EXISTS parent_audience_id uuid,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Add foreign key for parent_audience_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'meta_audiences_parent_fkey'
    AND table_name = 'meta_audiences'
  ) THEN
    ALTER TABLE public.meta_audiences
      ADD CONSTRAINT meta_audiences_parent_fkey
      FOREIGN KEY (parent_audience_id)
      REFERENCES public.meta_audiences(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_meta_audiences_parent
  ON public.meta_audiences(parent_audience_id)
  WHERE parent_audience_id IS NOT NULL;

-- Helper function: Get goal assets
CREATE OR REPLACE FUNCTION public.get_goal_assets(
  p_user_id uuid,
  p_goal_key text
)
RETURNS jsonb AS $$
DECLARE
  v_assets jsonb;
BEGIN
  SELECT goal_assets->p_goal_key INTO v_assets
  FROM public.user_ads_modes
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_assets, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Set goal assets
CREATE OR REPLACE FUNCTION public.set_goal_assets(
  p_user_id uuid,
  p_goal_key text,
  p_assets jsonb
)
RETURNS boolean AS $$
BEGIN
  -- Ensure user_ads_modes row exists
  INSERT INTO public.user_ads_modes (user_id, goal_assets)
  VALUES (p_user_id, jsonb_build_object(p_goal_key, p_assets))
  ON CONFLICT (user_id) DO UPDATE
  SET goal_assets = jsonb_set(
    COALESCE(user_ads_modes.goal_assets, '{}'::jsonb),
    ARRAY[p_goal_key],
    p_assets
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_goal_assets(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_goal_assets(uuid, text, jsonb) TO authenticated;

-- Add comments
COMMENT ON COLUMN public.user_ads_modes.goal_assets IS 'Per-goal assets storage. Structure: { [goal_key]: { smartlink_url, smartlink_id, presave_url, presave_id, oneclick_url, oneclick_id, sound_urls: { tiktok, facebook }, profile_urls: { instagram, facebook, tiktok } } }';
COMMENT ON COLUMN public.user_ads_modes.budget_config IS 'Budget configuration. Structure: { total_budget: number, timeframe_days: number, daily_budget: number, learning_share: number, scaling_share: number, per_goal_budgets: { [goal_key]: { daily_budget, priority } } }';
COMMENT ON COLUMN public.meta_audiences.lookalike_spec IS 'For lookalike audiences, stores spec: { percent: 1, country: "US", source_audience_id: "..." }';
COMMENT ON COLUMN public.meta_audiences.parent_audience_id IS 'For lookalike audiences, references the seed custom audience ID in this table';
COMMENT ON COLUMN public.meta_audiences.size_estimate IS 'Estimated audience size from Meta API';
