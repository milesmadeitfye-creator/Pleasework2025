/*
  # Campaign Drafts for Run Ads

  ## Problem
  When user says "run ads", we need to stage the campaign before launching.
  No centralized place to store draft campaigns.

  ## Solution
  Create `campaign_drafts` table to hold ad campaigns before approval/launch.

  ## Tables

  ### campaign_drafts
  Stores draft Meta ad campaigns created from "run ads" command.

  Columns:
  - `id` - UUID primary key
  - `user_id` - Owner (FK to auth.users)
  - `conversation_id` - Related chat conversation (optional)
  - `goal` - Campaign goal (song_promo, traffic, etc)
  - `budget_daily` - Daily budget in USD
  - `duration_days` - Campaign duration
  - `destination_url` - Where ads should link to
  - `smart_link_id` - If using smart link (FK to smart_links)
  - `creative_media_asset_id` - Media asset for creative (FK to media_assets)
  - `creative_url` - Meta-ready URL for creative
  - `ad_account_id` - Meta ad account ID
  - `page_id` - Meta page ID
  - `pixel_id` - Meta pixel ID (optional)
  - `status` - draft|approved|launched|failed
  - `meta_campaign_id` - Meta campaign ID (after creation)
  - `meta_adset_id` - Meta adset ID (after creation)
  - `meta_ad_id` - Meta ad ID (after creation)
  - `error_message` - Error if failed
  - `approved_at` - Timestamp when approved
  - `launched_at` - Timestamp when launched
  - `created_at` - Creation timestamp
  - `updated_at` - Last update timestamp

  ## Security
  - RLS enabled
  - Users can view/insert/update their own drafts
  - Service role has full access

  ## Usage
  1. User says "run ads"
  2. Create campaign_drafts row (status='draft')
  3. Call Meta API to create paused campaign
  4. Update row with meta_campaign_id
  5. Ask user: "Approve to start?"
  6. Update status='launched' when approved
*/

-- Create campaign_drafts table
CREATE TABLE IF NOT EXISTS public.campaign_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NULL,
  
  -- Campaign config
  goal TEXT NOT NULL DEFAULT 'song_promo',
  budget_daily NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  duration_days INTEGER NOT NULL DEFAULT 7,
  
  -- Destination
  destination_url TEXT NOT NULL,
  smart_link_id UUID NULL REFERENCES smart_links(id) ON DELETE SET NULL,
  
  -- Creative
  creative_media_asset_id UUID NULL REFERENCES media_assets(id) ON DELETE SET NULL,
  creative_url TEXT NULL,
  
  -- Meta config (snapshot at draft time)
  ad_account_id TEXT NULL,
  page_id TEXT NULL,
  pixel_id TEXT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'launched', 'failed', 'paused')),
  
  -- Meta IDs (filled after creation)
  meta_campaign_id TEXT NULL,
  meta_adset_id TEXT NULL,
  meta_ad_id TEXT NULL,
  
  -- Error tracking
  error_message TEXT NULL,
  
  -- Timestamps
  approved_at TIMESTAMPTZ NULL,
  launched_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_drafts_user 
  ON campaign_drafts(user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_conversation 
  ON campaign_drafts(conversation_id) 
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_status 
  ON campaign_drafts(status, user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_smart_link 
  ON campaign_drafts(smart_link_id) 
  WHERE smart_link_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_campaign_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_drafts_updated_at
  BEFORE UPDATE ON public.campaign_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_campaign_drafts_updated_at();

-- Enable RLS
ALTER TABLE public.campaign_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own drafts
CREATE POLICY "Users can view own campaign drafts"
  ON public.campaign_drafts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own drafts
CREATE POLICY "Users can insert own campaign drafts"
  ON public.campaign_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own drafts
CREATE POLICY "Users can update own campaign drafts"
  ON public.campaign_drafts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own drafts
CREATE POLICY "Users can delete own campaign drafts"
  ON public.campaign_drafts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to campaign drafts"
  ON public.campaign_drafts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper function: Get latest draft for user
CREATE OR REPLACE FUNCTION public.get_latest_campaign_draft(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  goal TEXT,
  budget_daily NUMERIC,
  duration_days INTEGER,
  destination_url TEXT,
  status TEXT,
  meta_campaign_id TEXT,
  created_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    id,
    goal,
    budget_daily,
    duration_days,
    destination_url,
    status,
    meta_campaign_id,
    created_at
  FROM public.campaign_drafts
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_latest_campaign_draft IS 'Get most recent campaign draft for user';

-- Table comments
COMMENT ON TABLE public.campaign_drafts IS 'Draft Meta ad campaigns created from "run ads" command';
COMMENT ON COLUMN public.campaign_drafts.status IS 'draft=created, approved=user approved, launched=live in Meta, failed=creation failed, paused=paused in Meta';
COMMENT ON COLUMN public.campaign_drafts.creative_url IS 'Meta-ready URL from media-meta-ready function';
