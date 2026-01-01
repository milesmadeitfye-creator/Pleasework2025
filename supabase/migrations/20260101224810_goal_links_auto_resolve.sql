/*
  # Auto-Resolve Goal Links System

  1. Schema Changes
    - Add `resolved_links` jsonb column to `user_ads_modes`
      - Stores auto-resolved URLs for goals (smart links, presave, Instagram, etc.)
      - Structure: {
          spotify_track_url, spotify_track_id,
          smart_link_url, presave_link_url,
          instagram_profile_url, tiktok_sound_url,
          facebook_sound_url, lead_form_url,
          resolved_at, source
        }

    - Create `track_sound_links` table for reusable sound URL mappings
      - Maps Spotify track IDs to platform sound URLs
      - Allows reuse across campaigns

  2. Security
    - RLS enabled on all tables
    - Users can only access their own data

  3. Purpose
    - Enable one-click auto-resolution of required campaign URLs
    - Eliminate manual URL pasting for ads workflows
    - Persist resolved links for reuse
*/

-- Add resolved_links column to user_ads_modes if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_ads_modes' AND column_name = 'resolved_links'
  ) THEN
    ALTER TABLE user_ads_modes ADD COLUMN resolved_links jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create track_sound_links table for reusable sound URL mappings
CREATE TABLE IF NOT EXISTS track_sound_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_track_id text NOT NULL,
  spotify_track_url text,
  track_title text,
  track_artist text,
  tiktok_sound_url text,
  facebook_sound_url text,
  instagram_sound_url text,
  source jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Unique constraint: one entry per user per track
  UNIQUE(user_id, spotify_track_id)
);

-- Enable RLS
ALTER TABLE track_sound_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies for track_sound_links
CREATE POLICY "Users can read own sound links"
  ON track_sound_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sound links"
  ON track_sound_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sound links"
  ON track_sound_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sound links"
  ON track_sound_links FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_track_sound_links_user_track
  ON track_sound_links(user_id, spotify_track_id);

-- Drop and recreate get_user_ads_mode_settings to include resolved_links
DROP FUNCTION IF EXISTS get_user_ads_mode_settings(uuid);

CREATE FUNCTION get_user_ads_mode_settings(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  ads_mode text,
  pulse_settings jsonb,
  momentum_settings jsonb,
  goal_settings jsonb,
  resolved_links jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
    COALESCE(uam.goal_settings, '{}'::jsonb) as goal_settings,
    COALESCE(uam.resolved_links, '{}'::jsonb) as resolved_links
  FROM user_ads_modes uam
  WHERE uam.user_id = p_user_id;

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
      '{}'::jsonb,
      '{}'::jsonb;
  END IF;
END;
$$;

-- Drop and recreate upsert function to include resolved_links
DROP FUNCTION IF EXISTS upsert_user_ads_mode_settings(uuid, text, jsonb, jsonb, jsonb);

CREATE FUNCTION upsert_user_ads_mode_settings(
  p_user_id uuid,
  p_ads_mode text DEFAULT NULL,
  p_pulse_settings jsonb DEFAULT NULL,
  p_momentum_settings jsonb DEFAULT NULL,
  p_goal_settings jsonb DEFAULT NULL,
  p_resolved_links jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only update own settings';
  END IF;

  INSERT INTO user_ads_modes (
    user_id,
    ads_mode,
    pulse_settings,
    momentum_settings,
    goal_settings,
    resolved_links,
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
    COALESCE(p_resolved_links, '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    ads_mode = COALESCE(p_ads_mode, user_ads_modes.ads_mode),
    pulse_settings = COALESCE(p_pulse_settings, user_ads_modes.pulse_settings),
    momentum_settings = COALESCE(p_momentum_settings, user_ads_modes.momentum_settings),
    goal_settings = COALESCE(p_goal_settings, user_ads_modes.goal_settings),
    resolved_links = COALESCE(p_resolved_links, user_ads_modes.resolved_links),
    updated_at = now();
END;
$$;
