/*
  # AI Campaign Launches Log

  1. New Table
    - `ai_campaign_launches`
      - Tracks all campaigns launched by Ghoste AI
      - Logs campaign ID, name, budget, goal, link
      - Marks ads_status for AI internal tracking
  
  2. Purpose
    - Confirmation logging after successful launch
    - AI can query to see what campaigns it has launched
    - Audit trail for AI-initiated campaigns
*/

CREATE TABLE IF NOT EXISTS public.ai_campaign_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Campaign details
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  daily_budget_cents int NOT NULL,
  goal text NOT NULL,
  
  -- Link/destination
  link_url text,
  smart_link_id uuid REFERENCES smart_links(id) ON DELETE SET NULL,
  
  -- Status (AI internal)
  ads_status text DEFAULT 'RUNNING',
  
  -- Timestamps
  launched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_campaign_launches_user
  ON ai_campaign_launches(user_id, launched_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_campaign_launches_campaign
  ON ai_campaign_launches(campaign_id);

-- Enable RLS
ALTER TABLE ai_campaign_launches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own campaign launches"
  ON ai_campaign_launches FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert campaign launches"
  ON ai_campaign_launches FOR INSERT TO service_role
  WITH CHECK (true);

COMMENT ON TABLE ai_campaign_launches IS 'Log of all campaigns launched by Ghoste AI. Used for confirmation and internal tracking.';
COMMENT ON COLUMN ai_campaign_launches.ads_status IS 'AI internal status marker. Not synced with Meta.';
