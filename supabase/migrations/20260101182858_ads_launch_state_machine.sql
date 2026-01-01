/*
  # Ads Launch State Machine

  1. New Fields
    - `lifecycle_state` (text) - Campaign lifecycle: draft | approved | launching | active | paused | scheduled | failed
    - `launch_requested_at` (timestamptz) - When launch was requested
    - `launch_confirmed_at` (timestamptz) - When Meta confirmed active status
    - `last_meta_sync_at` (timestamptz) - Last time we synced with Meta
    - `last_meta_status` (jsonb) - Last known Meta status for campaign/adset/ad
    - `last_launch_error` (text) - Last launch error message
    - `launch_attempts` (integer) - Number of launch attempts

  2. Changes
    - Add lifecycle tracking to ad_campaigns table
    - Create index on lifecycle_state for filtering
    - Add meta_adset_id and meta_ad_id if missing

  3. Purpose
    - Track campaign launch status reliably
    - Enable polling/retry for Meta delays
    - Provide clear error messages for failures
*/

-- Add lifecycle_state fields to ad_campaigns
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'draft'
    CHECK (lifecycle_state IN ('draft', 'approved', 'launching', 'active', 'paused', 'scheduled', 'failed'));

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS launch_requested_at timestamptz;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS launch_confirmed_at timestamptz;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS last_meta_sync_at timestamptz;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS last_meta_status jsonb;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS last_launch_error text;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS launch_attempts integer DEFAULT 0;

-- Ensure Meta ID fields exist
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS meta_adset_id text;

ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS meta_ad_id text;

-- Create index for filtering by lifecycle_state
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_lifecycle_state
  ON ad_campaigns(lifecycle_state);

-- Create index for finding campaigns that need sync
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_launching
  ON ad_campaigns(lifecycle_state, launch_requested_at)
  WHERE lifecycle_state = 'launching';

-- Add lifecycle_state to campaign_drafts (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'campaign_drafts'
  ) THEN
    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'draft'
        CHECK (lifecycle_state IN ('draft', 'approved', 'launching', 'active', 'paused', 'scheduled', 'failed'));

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS launch_requested_at timestamptz;

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS launch_confirmed_at timestamptz;

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS last_meta_sync_at timestamptz;

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS last_meta_status jsonb;

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS last_launch_error text;

    ALTER TABLE campaign_drafts
      ADD COLUMN IF NOT EXISTS launch_attempts integer DEFAULT 0;
  END IF;
END $$;

-- Create launch logs table
CREATE TABLE IF NOT EXISTS meta_launch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL,
  request jsonb,
  response jsonb,
  meta_statuses jsonb,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on launch logs
ALTER TABLE meta_launch_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own launch logs
CREATE POLICY "Users can read own launch logs"
  ON meta_launch_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role can insert launch logs
CREATE POLICY "Service role can insert launch logs"
  ON meta_launch_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index on launch logs
CREATE INDEX IF NOT EXISTS idx_meta_launch_logs_campaign
  ON meta_launch_logs(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_launch_logs_user
  ON meta_launch_logs(user_id, created_at DESC);
