/*
  # Add Meta Sync Tracking Fields

  1. New Columns
    - `last_meta_sync_at` - Timestamp of last successful Meta API sync
    - `lifetime_budget_cents` - Lifetime budget in cents (complement to daily_budget_cents)

  2. Purpose
    - Track sync status with Meta for campaign controls (toggle, duplicate, budget updates)
    - Support both daily and lifetime budget types

  3. Security
    - Inherits existing RLS policies from ad_campaigns table
*/

-- Add last_meta_sync_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'last_meta_sync_at'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN last_meta_sync_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add lifetime_budget_cents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'lifetime_budget_cents'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN lifetime_budget_cents INTEGER;
  END IF;
END $$;

-- Create index on last_meta_sync_at for monitoring queries
CREATE INDEX IF NOT EXISTS ad_campaigns_last_meta_sync_at_idx
  ON public.ad_campaigns (last_meta_sync_at DESC)
  WHERE last_meta_sync_at IS NOT NULL;

COMMENT ON COLUMN public.ad_campaigns.last_meta_sync_at IS 'Timestamp of last successful Meta API sync';
COMMENT ON COLUMN public.ad_campaigns.lifetime_budget_cents IS 'Lifetime budget in cents for lifetime budget campaigns';
