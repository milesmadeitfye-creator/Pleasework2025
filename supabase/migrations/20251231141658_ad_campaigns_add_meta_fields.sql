/*
  # Add Meta and Campaign Fields to ad_campaigns

  1. Changes
    - Add fields needed for full campaign tracking:
      - draft_id, ad_goal, campaign_type, automation_mode
      - smart_link_id, smart_link_slug, destination_url
      - budget fields
      - Meta IDs (campaign, adset, ad)
      - creative_ids array
      - AI fields (reasoning, confidence, guardrails)
      - last_error

  2. Notes
    - Uses IF NOT EXISTS for safety
    - Preserves existing data
    - Sets sensible defaults
*/

-- Add draft_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'draft_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN draft_id uuid;
  END IF;
END $$;

-- Add ad_goal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'ad_goal'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN ad_goal text;
  END IF;
END $$;

-- Add campaign_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'campaign_type'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN campaign_type text;
  END IF;
END $$;

-- Add automation_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'automation_mode'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN automation_mode text DEFAULT 'assisted';
  END IF;
END $$;

-- Add smart_link_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'smart_link_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN smart_link_id uuid;
  END IF;
END $$;

-- Add smart_link_slug
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'smart_link_slug'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN smart_link_slug text;
  END IF;
END $$;

-- Add destination_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'destination_url'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN destination_url text;
  END IF;
END $$;

-- Add daily_budget_cents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'daily_budget_cents'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN daily_budget_cents integer;
  END IF;
END $$;

-- Add total_budget_cents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'total_budget_cents'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN total_budget_cents integer;
  END IF;
END $$;

-- Add creative_ids array
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'creative_ids'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN creative_ids text[];
  END IF;
END $$;

-- Add meta_campaign_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_campaign_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_campaign_id text;
  END IF;
END $$;

-- Add meta_adset_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_adset_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_adset_id text;
  END IF;
END $$;

-- Add meta_ad_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_ad_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_ad_id text;
  END IF;
END $$;

-- Add last_error
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN last_error text;
  END IF;
END $$;

-- Add reasoning
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'reasoning'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN reasoning text;
  END IF;
END $$;

-- Add confidence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN confidence numeric;
  END IF;
END $$;

-- Add guardrails_applied
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'guardrails_applied'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN guardrails_applied jsonb;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS ad_campaigns_user_id_created_at_idx ON public.ad_campaigns (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_status_idx ON public.ad_campaigns (status);
CREATE INDEX IF NOT EXISTS ad_campaigns_meta_campaign_id_idx ON public.ad_campaigns (meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;

-- Update comment
COMMENT ON TABLE public.ad_campaigns IS 'Canonical ad campaigns table. Source of truth for Studio UI and Meta sync.';