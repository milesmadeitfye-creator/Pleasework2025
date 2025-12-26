/*
  # Meta Campaign Templates - 4 Core Campaign Types

  1. New Tables
    - `campaign_templates` - Define Smart Link, One-Click, Follower Growth, Fan Capture
    - `ghoste_campaigns` - User campaigns linked to Meta campaigns
    - `campaign_score_history` - Track scores over time per campaign
  
  2. Campaign Types
    - smart_link_probe: Drive traffic to smart links
    - one_click_sound: Promote specific platform (Spotify/Apple/etc)
    - follower_growth: Grow social following
    - fan_capture: Collect emails/SMS
  
  3. Integration Points
    - Links to teacher_scores via entity_id
    - Links to Meta campaigns via meta_campaign_id
    - Tracks AI decisions and actions
  
  4. Security
    - RLS: owner can read/write their campaigns
    - Templates are public reference data
*/

-- Create campaign_type enum
DO $$ BEGIN
  CREATE TYPE campaign_type AS ENUM (
    'smart_link_probe',
    'one_click_sound',
    'follower_growth',
    'fan_capture'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create campaign_status enum
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'draft',
    'pending_review',
    'active',
    'paused',
    'completed',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create campaign templates (reference data)
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type campaign_type NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  meta_objective text NOT NULL DEFAULT 'SALES',
  optimization_goal text NOT NULL,
  allowed_destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_cap_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create ghoste campaigns table
CREATE TABLE IF NOT EXISTS public.ghoste_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_type campaign_type NOT NULL,
  campaign_name text NOT NULL,
  status campaign_status NOT NULL DEFAULT 'draft',
  
  -- Meta integration
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  
  -- Destinations
  destination_url text,
  destination_platform text,
  
  -- Ghoste entities
  smart_link_id uuid,
  one_click_link_id uuid,
  
  -- Budget & schedule
  daily_budget_cents int NOT NULL,
  total_budget_cents int,
  start_date timestamptz,
  end_date timestamptz,
  
  -- Performance
  total_spend_cents int NOT NULL DEFAULT 0,
  total_clicks int NOT NULL DEFAULT 0,
  total_conversions int NOT NULL DEFAULT 0,
  
  -- Latest score (cached for quick access)
  latest_score int,
  latest_grade text,
  latest_confidence text,
  score_updated_at timestamptz,
  
  -- AI automation
  automation_enabled boolean NOT NULL DEFAULT false,
  max_daily_budget_cents int,
  ai_mode text DEFAULT 'manual',
  
  -- Metadata
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT ghoste_campaigns_status_check CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'failed')),
  CONSTRAINT ghoste_campaigns_daily_budget_positive CHECK (daily_budget_cents > 0),
  CONSTRAINT ghoste_campaigns_ai_mode_check CHECK (ai_mode IN ('manual', 'guided', 'autonomous'))
);

-- Create campaign score history
CREATE TABLE IF NOT EXISTS public.campaign_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  score int NOT NULL,
  grade text NOT NULL,
  confidence text NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT campaign_score_history_score_range CHECK (score >= 1 AND score <= 100)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ghoste_campaigns_owner_type
  ON ghoste_campaigns(owner_user_id, campaign_type, status);

CREATE INDEX IF NOT EXISTS idx_ghoste_campaigns_meta_ids
  ON ghoste_campaigns(meta_campaign_id, meta_adset_id);

CREATE INDEX IF NOT EXISTS idx_ghoste_campaigns_smart_link
  ON ghoste_campaigns(smart_link_id) WHERE smart_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ghoste_campaigns_score
  ON ghoste_campaigns(latest_score, latest_grade);

CREATE INDEX IF NOT EXISTS idx_campaign_score_history_campaign
  ON campaign_score_history(campaign_id, created_at DESC);

-- Enable RLS
ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghoste_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_score_history ENABLE ROW LEVEL SECURITY;

-- Policies: campaign_templates (public read)
CREATE POLICY "Templates are publicly readable"
  ON campaign_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Policies: ghoste_campaigns (owner CRUD)
CREATE POLICY "Users can read own campaigns"
  ON ghoste_campaigns
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own campaigns"
  ON ghoste_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own campaigns"
  ON ghoste_campaigns
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete own campaigns"
  ON ghoste_campaigns
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Policies: campaign_score_history (owner read, service role write)
CREATE POLICY "Users can read own campaign score history"
  ON campaign_score_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ghoste_campaigns
      WHERE ghoste_campaigns.id = campaign_score_history.campaign_id
      AND ghoste_campaigns.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert campaign scores"
  ON campaign_score_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Seed campaign templates
INSERT INTO campaign_templates (campaign_type, display_name, description, meta_objective, optimization_goal, allowed_destinations, required_events, ai_allowed_actions, budget_cap_rules, config)
VALUES
  (
    'smart_link_probe',
    'Smart Link Campaign',
    'Drive traffic to your smart link to test audience engagement across multiple platforms',
    'SALES',
    'LINK_CLICKS',
    '["smart_link"]'::jsonb,
    '["smartlinkclick", "oneclickspotify", "oneclickapple", "oneclickyoutube"]'::jsonb,
    '["scale_up", "maintain", "rotate_creative", "pause"]'::jsonb,
    '{"min_daily_budget_cents": 500, "max_daily_budget_cents": 50000, "max_total_budget_cents": 500000}'::jsonb,
    '{"allow_auto_platform_detect": true, "track_platform_preference": true}'::jsonb
  ),
  (
    'one_click_sound',
    'One-Click Sound Promotion',
    'Promote your track on a specific platform (Spotify, Apple Music, etc.) with direct one-click access',
    'SALES',
    'LINK_CLICKS',
    '["one_click_link"]'::jsonb,
    '["oneclicklink", "oneclickspotify", "oneclickapple", "oneclickyoutube", "oneclickamazon", "oneclicktidal"]'::jsonb,
    '["scale_up", "maintain", "test_variation", "pause"]'::jsonb,
    '{"min_daily_budget_cents": 500, "max_daily_budget_cents": 50000, "enforce_single_platform": true}'::jsonb,
    '{"require_platform_selection": true, "single_platform_per_adset": true}'::jsonb
  ),
  (
    'follower_growth',
    'Follower Growth Campaign',
    'Grow your social media following with warm audience targeting',
    'SALES',
    'LINK_CLICKS',
    '["platform_profile"]'::jsonb,
    '["profile_visit", "follow_action"]'::jsonb,
    '["scale_up", "maintain", "tighten_audience", "pause"]'::jsonb,
    '{"min_daily_budget_cents": 1000, "max_daily_budget_cents": 100000, "warm_audiences_only": true}'::jsonb,
    '{"require_existing_engagement": true, "lookalike_min_source_size": 1000}'::jsonb
  ),
  (
    'fan_capture',
    'Email & SMS Collection',
    'Capture fan contact info (email/SMS) for direct communication and marketing automation',
    'SALES',
    'CONVERSIONS',
    '["capture_page"]'::jsonb,
    '["email_submit", "sms_submit", "capture_complete"]'::jsonb,
    '["scale_up", "maintain", "rotate_creative", "pause"]'::jsonb,
    '{"min_daily_budget_cents": 1000, "max_daily_budget_cents": 50000, "cost_per_lead_target_cents": 500}'::jsonb,
    '{"require_capture_page": true, "track_lead_quality": true}'::jsonb
  )
ON CONFLICT (campaign_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  meta_objective = EXCLUDED.meta_objective,
  optimization_goal = EXCLUDED.optimization_goal,
  allowed_destinations = EXCLUDED.allowed_destinations,
  required_events = EXCLUDED.required_events,
  ai_allowed_actions = EXCLUDED.ai_allowed_actions,
  budget_cap_rules = EXCLUDED.budget_cap_rules,
  config = EXCLUDED.config,
  updated_at = now();

-- Add helpful comments
COMMENT ON TABLE campaign_templates IS 'Reference data for 4 core campaign types with Meta integration specs';
COMMENT ON TABLE ghoste_campaigns IS 'User campaigns linked to Meta campaigns with Teacher Score integration';
COMMENT ON TABLE campaign_score_history IS 'Historical scores for campaign performance tracking';
COMMENT ON COLUMN ghoste_campaigns.latest_score IS 'Cached score from teacher_scores for quick access';
COMMENT ON COLUMN ghoste_campaigns.meta_campaign_id IS 'Meta Ads API campaign ID';
COMMENT ON COLUMN ghoste_campaigns.ai_mode IS 'manual (no automation), guided (suggestions), autonomous (auto-scale within caps)';
