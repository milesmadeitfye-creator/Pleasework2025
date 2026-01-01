/*
  # Campaign Bundles and Template Keys

  ## Problem
  - AdsPlanFromGoals creates only 1 campaign when user has multiple active goals
  - No way to track which campaigns belong together (bundle concept)
  - No template_key tracking for objective mappings

  ## Solution
  Add bundle tracking and template fields to both campaign_drafts and ad_campaigns.

  ## Changes to campaign_drafts
  - bundle_id (uuid) - Groups related campaigns created together
  - bundle_index (int) - Position within bundle (0..n-1)
  - bundle_total (int) - Total campaigns in bundle
  - template_key (text) - Template key from goal registry
  - goal_key (text) - Overall goal key
  - idempotency_key (text unique) - Prevents duplicate creates on retry

  ## Changes to ad_campaigns
  - Same bundle fields for tracking published campaigns
  - template_key and goal_key for traceability

  ## Notes
  - Uses IF NOT EXISTS for safety
  - Allows NULL for existing rows
  - Idempotency key format: {userId}:{bundle_id}:{index}:{template_key}
*/

-- Add bundle fields to campaign_drafts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'bundle_id'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN bundle_id uuid NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'bundle_index'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN bundle_index integer NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'bundle_total'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN bundle_total integer NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'template_key'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN template_key text NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'goal_key'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN goal_key text NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaign_drafts' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.campaign_drafts ADD COLUMN idempotency_key text NULL UNIQUE;
  END IF;
END $$;

-- Add bundle fields to ad_campaigns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'bundle_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN bundle_id uuid NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'bundle_index'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN bundle_index integer NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'bundle_total'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN bundle_total integer NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'template_key'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN template_key text NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'goal_key'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN goal_key text NULL;
  END IF;
END $$;

-- Create indexes for bundle queries
CREATE INDEX IF NOT EXISTS idx_campaign_drafts_bundle_id
  ON campaign_drafts(bundle_id);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_idempotency_key
  ON campaign_drafts(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_bundle_id
  ON ad_campaigns(bundle_id);

-- Comments
COMMENT ON COLUMN campaign_drafts.bundle_id IS 'Groups related campaigns created together in one user action';
COMMENT ON COLUMN campaign_drafts.bundle_index IS 'Position within bundle (0..n-1)';
COMMENT ON COLUMN campaign_drafts.bundle_total IS 'Total number of campaigns in this bundle';
COMMENT ON COLUMN campaign_drafts.template_key IS 'Template key from goal registry (e.g., presave_conversions)';
COMMENT ON COLUMN campaign_drafts.goal_key IS 'Overall goal key (e.g., presave, streams)';
COMMENT ON COLUMN campaign_drafts.idempotency_key IS 'Prevents duplicate creates: {userId}:{bundle_id}:{index}:{template_key}';
