/*
  # Pulse & Momentum Ads Operating Modes System

  1. New Tables
    - `user_ads_modes`
      - `user_id` (uuid, FK to auth.users)
      - `ads_mode` (text: 'pulse' or 'momentum')
      - `pulse_settings` (jsonb: daily_budget, test_lane_pct, rotation_days)
      - `momentum_settings` (jsonb: starting_budget, max_daily_budget, scale_step_pct, cooldown_hours)
      - `goal_settings` (jsonb: per-goal active, priority, budget_hint)
      - `created_at`, `updated_at`

  2. Security
    - Enable RLS on `user_ads_modes`
    - Users can read/write their own mode settings

  3. RPC Functions
    - `get_user_ads_mode_settings(p_user_id uuid)` - Read mode settings
    - `upsert_user_ads_mode_settings(...)` - Write mode settings
*/

-- Create user_ads_modes table
CREATE TABLE IF NOT EXISTS user_ads_modes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ads_mode text NOT NULL DEFAULT 'pulse' CHECK (ads_mode IN ('pulse', 'momentum')),
  pulse_settings jsonb DEFAULT '{
    "daily_budget": 20,
    "test_lane_pct": 30,
    "rotation_days": 7
  }'::jsonb,
  momentum_settings jsonb DEFAULT '{
    "starting_budget": 50,
    "max_daily_budget": 500,
    "scale_step_pct": 20,
    "cooldown_hours": 24
  }'::jsonb,
  goal_settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_ads_modes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own ads mode settings"
  ON user_ads_modes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ads mode settings"
  ON user_ads_modes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ads mode settings"
  ON user_ads_modes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC: Get user ads mode settings
CREATE OR REPLACE FUNCTION get_user_ads_mode_settings(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  ads_mode text,
  pulse_settings jsonb,
  momentum_settings jsonb,
  goal_settings jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return settings if they exist, otherwise return defaults
  RETURN QUERY
  SELECT 
    COALESCE(uam.ads_mode, 'pulse'::text) as ads_mode,
    COALESCE(uam.pulse_settings, '{
      "daily_budget": 20,
      "test_lane_pct": 30,
      "rotation_days": 7
    }'::jsonb) as pulse_settings,
    COALESCE(uam.momentum_settings, '{
      "starting_budget": 50,
      "max_daily_budget": 500,
      "scale_step_pct": 20,
      "cooldown_hours": 24
    }'::jsonb) as momentum_settings,
    COALESCE(uam.goal_settings, '{}'::jsonb) as goal_settings
  FROM user_ads_modes uam
  WHERE uam.user_id = p_user_id;
  
  -- If no row exists, return defaults
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      'pulse'::text,
      '{
        "daily_budget": 20,
        "test_lane_pct": 30,
        "rotation_days": 7
      }'::jsonb,
      '{
        "starting_budget": 50,
        "max_daily_budget": 500,
        "scale_step_pct": 20,
        "cooldown_hours": 24
      }'::jsonb,
      '{}'::jsonb;
  END IF;
END;
$$;

-- RPC: Upsert user ads mode settings
CREATE OR REPLACE FUNCTION upsert_user_ads_mode_settings(
  p_user_id uuid,
  p_ads_mode text DEFAULT NULL,
  p_pulse_settings jsonb DEFAULT NULL,
  p_momentum_settings jsonb DEFAULT NULL,
  p_goal_settings jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is the user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only update own settings';
  END IF;

  INSERT INTO user_ads_modes (
    user_id,
    ads_mode,
    pulse_settings,
    momentum_settings,
    goal_settings,
    updated_at
  )
  VALUES (
    p_user_id,
    COALESCE(p_ads_mode, 'pulse'),
    COALESCE(p_pulse_settings, '{
      "daily_budget": 20,
      "test_lane_pct": 30,
      "rotation_days": 7
    }'::jsonb),
    COALESCE(p_momentum_settings, '{
      "starting_budget": 50,
      "max_daily_budget": 500,
      "scale_step_pct": 20,
      "cooldown_hours": 24
    }'::jsonb),
    COALESCE(p_goal_settings, '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    ads_mode = COALESCE(p_ads_mode, user_ads_modes.ads_mode),
    pulse_settings = COALESCE(p_pulse_settings, user_ads_modes.pulse_settings),
    momentum_settings = COALESCE(p_momentum_settings, user_ads_modes.momentum_settings),
    goal_settings = COALESCE(p_goal_settings, user_ads_modes.goal_settings),
    updated_at = now();
END;
$$;

-- Add campaign_role and goal_key to ad_campaigns table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_campaigns' AND column_name = 'campaign_role'
  ) THEN
    ALTER TABLE ad_campaigns ADD COLUMN campaign_role text DEFAULT 'testing' CHECK (campaign_role IN ('testing', 'scaling'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_campaigns' AND column_name = 'goal_key'
  ) THEN
    ALTER TABLE ad_campaigns ADD COLUMN goal_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_campaigns' AND column_name = 'mode'
  ) THEN
    ALTER TABLE ad_campaigns ADD COLUMN mode text DEFAULT 'pulse' CHECK (mode IN ('pulse', 'momentum'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_campaigns' AND column_name = 'promoted_from_id'
  ) THEN
    ALTER TABLE ad_campaigns ADD COLUMN promoted_from_id uuid REFERENCES ad_campaigns(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_campaigns' AND column_name = 'winner_detected'
  ) THEN
    ALTER TABLE ad_campaigns ADD COLUMN winner_detected boolean DEFAULT false;
  END IF;
END $$;

-- Create index for faster campaign role queries
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_role_goal 
  ON ad_campaigns(user_id, campaign_role, goal_key) 
  WHERE campaign_role IS NOT NULL;