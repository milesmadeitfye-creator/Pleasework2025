/*
  # Run Ads One-Click Flow Infrastructure

  1. New Tables
    - `ad_creatives` - Store uploaded videos/images with AI analysis
    - `ad_campaigns_queue` - Track campaign build jobs
    - `ai_creative_analysis` - Store AI analysis results
    - `campaign_launch_log` - Track launch history
  
  2. User Flow
    - Upload creatives → AI analyzes → User sets goal + budget → AI builds campaign → Launch
    - All Meta complexity hidden from user
  
  3. AI Processing
    - Hook strength analysis
    - Caption generation
    - Platform fit scoring
    - Energy level detection
  
  4. Safety
    - Budget caps enforced
    - Mode-based restrictions (assist/guided/autonomous)
    - Kill switch available
    - All actions logged
  
  5. Security
    - RLS: owner can CRUD their creatives
    - Service role can process queue
*/

-- Create creative_type enum
DO $$ BEGIN
  CREATE TYPE creative_type AS ENUM ('video', 'image');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create ad_goal enum
DO $$ BEGIN
  CREATE TYPE ad_goal AS ENUM (
    'promote_song',
    'grow_followers',
    'capture_fans'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create automation_mode enum
DO $$ BEGIN
  CREATE TYPE automation_mode AS ENUM (
    'assist',
    'guided',
    'autonomous'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create queue_status enum
DO $$ BEGIN
  CREATE TYPE queue_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ad creatives table
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creative_type creative_type NOT NULL,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  
  -- User-provided metadata
  caption text,
  caption_generated boolean DEFAULT false,
  
  -- AI analysis results
  hook_strength int,
  hook_style text,
  energy_level text,
  platform_fit jsonb DEFAULT '{}'::jsonb,
  pacing_score int,
  visual_quality int,
  
  -- Technical metadata
  duration_seconds float,
  file_size_bytes bigint,
  mime_type text,
  width int,
  height int,
  
  -- Analysis status
  analyzed_at timestamptz,
  analysis_complete boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT ad_creatives_hook_strength_range CHECK (hook_strength >= 1 AND hook_strength <= 100),
  CONSTRAINT ad_creatives_pacing_range CHECK (pacing_score >= 1 AND pacing_score <= 100),
  CONSTRAINT ad_creatives_quality_range CHECK (visual_quality >= 1 AND visual_quality <= 100)
);

-- Ad campaigns queue (build jobs)
CREATE TABLE IF NOT EXISTS public.ad_campaigns_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- User selections
  ad_goal ad_goal NOT NULL,
  daily_budget_cents int NOT NULL,
  automation_mode automation_mode NOT NULL DEFAULT 'assist',
  total_budget_cents int,
  
  -- Creatives
  creative_ids uuid[] NOT NULL,
  
  -- AI decisions
  selected_campaign_type campaign_type,
  selected_destination_url text,
  selected_platform text,
  
  -- Meta campaign IDs (after build)
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_ids text[],
  
  -- Processing
  status queue_status NOT NULL DEFAULT 'pending',
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  error_message text,
  
  -- Result
  campaign_id uuid REFERENCES ghoste_campaigns(id),
  
  -- AI reasoning
  build_reasoning jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT ad_campaigns_queue_budget_positive CHECK (daily_budget_cents > 0)
);

-- AI creative analysis (detailed results)
CREATE TABLE IF NOT EXISTS public.ai_creative_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES ad_creatives(id) ON DELETE CASCADE,
  
  -- Hook analysis
  hook_timestamp_seconds float,
  hook_description text,
  hook_effectiveness_reasons jsonb DEFAULT '[]'::jsonb,
  
  -- Pacing analysis
  pacing_description text,
  scene_changes int,
  visual_flow_score int,
  
  -- Caption suggestions
  suggested_captions jsonb DEFAULT '[]'::jsonb,
  caption_variants int DEFAULT 0,
  
  -- Platform recommendations
  platform_scores jsonb DEFAULT '{}'::jsonb,
  best_platforms text[],
  
  -- Creative recommendations
  optimization_suggestions jsonb DEFAULT '[]'::jsonb,
  
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT ai_creative_analysis_flow_range CHECK (visual_flow_score >= 1 AND visual_flow_score <= 100)
);

-- Campaign launch log (audit trail)
CREATE TABLE IF NOT EXISTS public.campaign_launch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES ghoste_campaigns(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES ad_campaigns_queue(id) ON DELETE CASCADE,
  
  -- Launch details
  launched_at timestamptz NOT NULL DEFAULT now(),
  daily_budget_cents int NOT NULL,
  automation_mode automation_mode NOT NULL,
  ad_goal ad_goal NOT NULL,
  
  -- AI decisions logged
  campaign_type_selected campaign_type NOT NULL,
  reasoning text NOT NULL,
  confidence text NOT NULL,
  
  -- Creatives used
  creative_count int NOT NULL,
  creative_ids uuid[] NOT NULL,
  
  -- Safety checks
  budget_cap_enforced boolean NOT NULL DEFAULT true,
  guardrails_applied jsonb DEFAULT '[]'::jsonb,
  
  -- Meta IDs
  meta_campaign_id text,
  meta_adset_id text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ad_creatives_owner_type
  ON ad_creatives(owner_user_id, creative_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_analyzed
  ON ad_creatives(analysis_complete, analyzed_at) WHERE analysis_complete = true;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_queue_status
  ON ad_campaigns_queue(status, created_at) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_queue_owner
  ON ad_campaigns_queue(owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_log_owner
  ON campaign_launch_log(owner_user_id, launched_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_launch_log_campaign
  ON campaign_launch_log(campaign_id) WHERE campaign_id IS NOT NULL;

-- Enable RLS
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_creative_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_launch_log ENABLE ROW LEVEL SECURITY;

-- Policies: ad_creatives
CREATE POLICY "Users can read own creatives"
  ON ad_creatives
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own creatives"
  ON ad_creatives
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update own creatives"
  ON ad_creatives
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can delete own creatives"
  ON ad_creatives
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Policies: ad_campaigns_queue
CREATE POLICY "Users can read own queue items"
  ON ad_campaigns_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can create own queue items"
  ON ad_campaigns_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Service role can update queue"
  ON ad_campaigns_queue
  FOR UPDATE
  TO service_role
  USING (true);

-- Policies: ai_creative_analysis
CREATE POLICY "Users can read own creative analysis"
  ON ai_creative_analysis
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ad_creatives
      WHERE ad_creatives.id = ai_creative_analysis.creative_id
      AND ad_creatives.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert analysis"
  ON ai_creative_analysis
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policies: campaign_launch_log
CREATE POLICY "Users can read own launch log"
  ON campaign_launch_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Service role can insert launch log"
  ON campaign_launch_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE ad_creatives IS 'User-uploaded videos and images for ad campaigns with AI analysis';
COMMENT ON TABLE ad_campaigns_queue IS 'Queue for automated campaign builds via Run Ads flow';
COMMENT ON TABLE ai_creative_analysis IS 'Detailed AI analysis results for each creative';
COMMENT ON TABLE campaign_launch_log IS 'Audit trail for all campaign launches with AI reasoning';
COMMENT ON COLUMN ad_creatives.hook_strength IS 'AI-scored hook effectiveness (1-100)';
COMMENT ON COLUMN ad_creatives.platform_fit IS 'JSON object: {instagram: 85, facebook: 90, etc}';
COMMENT ON COLUMN ad_campaigns_queue.build_reasoning IS 'AI explanation for campaign type selection and setup';
COMMENT ON COLUMN campaign_launch_log.guardrails_applied IS 'Array of safety checks applied (budget caps, mode restrictions, etc)';
