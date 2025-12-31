/*
  # Ad Campaigns Base Table

  ## Problem
  The `ad_campaigns` table is referenced in code but not created in migrations.
  This is the canonical source of truth for ad campaigns shown in Studio UI.

  ## Solution
  Create the base `ad_campaigns` table with core fields.
  Later migrations (20251231141658_ad_campaigns_add_meta_fields.sql) add additional columns.

  ## Tables
  - `ad_campaigns` - Canonical ad campaigns table

  ## Columns
  - `id` - UUID primary key
  - `user_id` - Owner (FK to auth.users)
  - `name` - Campaign name
  - `status` - Campaign status (draft, publishing, published, paused, failed)
  - `created_at` - Creation timestamp
  - `updated_at` - Last update timestamp

  ## Security
  - RLS enabled
  - Users can view/insert/update their own campaigns
  - Service role has full access
*/

-- Create ad_campaigns table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'paused', 'failed', 'active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ad_campaigns_user_id_idx ON public.ad_campaigns (user_id);
CREATE INDEX IF NOT EXISTS ad_campaigns_status_idx ON public.ad_campaigns (status);
CREATE INDEX IF NOT EXISTS ad_campaigns_created_at_idx ON public.ad_campaigns (created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_ad_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ad_campaigns_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ad_campaigns_updated_at();

-- Enable RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own campaigns
CREATE POLICY "Users can view own ad campaigns"
  ON public.ad_campaigns
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own campaigns
CREATE POLICY "Users can insert own ad campaigns"
  ON public.ad_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own campaigns
CREATE POLICY "Users can update own ad campaigns"
  ON public.ad_campaigns
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own campaigns
CREATE POLICY "Users can delete own ad campaigns"
  ON public.ad_campaigns
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to ad campaigns"
  ON public.ad_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Table comment
COMMENT ON TABLE public.ad_campaigns IS 'Canonical ad campaigns table. Source of truth for Studio UI and Meta sync.';
