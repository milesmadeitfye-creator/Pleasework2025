/*
  # Ad Creatives Universal Campaign Support

  Enhances ad_creatives table to support ALL campaign styles (Streams, Link Clicks,
  Conversions, etc.) and enable draft-based workflow where creatives are stored
  immediately upon upload.

  ## Changes

  1. Add draft_id reference for draft-based persistence
  2. Add campaign_id reference for published campaigns
  3. Add headline, primary_text, description, cta for ad copy
  4. Add destination_url for tracking
  5. Add storage_bucket field
  6. Add thumbnail_url for video previews
  7. Add platform and updated_at tracking
  8. Add indexes for efficient queries
  9. Add trigger to update updated_at

  ## Key Features

  - Creatives linked to drafts OR campaigns (draft_id/campaign_id nullable)
  - Storage-first: storage_path required, no blobs in DB
  - Universal: works for all campaign styles/objectives
  - Ad copy stored alongside creative for atomic publishing
*/

-- Add missing columns to ad_creatives
ALTER TABLE public.ad_creatives 
  ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES public.campaign_drafts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS primary_text text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS cta text,
  ADD COLUMN IF NOT EXISTS destination_url text,
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'ad-assets',
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure created_at exists (should already be there)
ALTER TABLE public.ad_creatives 
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_draft 
  ON public.ad_creatives(owner_user_id, draft_id) 
  WHERE draft_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_campaign 
  ON public.ad_creatives(owner_user_id, campaign_id) 
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_created_at 
  ON public.ad_creatives(created_at DESC);

-- Create trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION public.update_ad_creatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ad_creatives_updated_at ON public.ad_creatives;

CREATE TRIGGER trigger_update_ad_creatives_updated_at
  BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ad_creatives_updated_at();

-- Add comment
COMMENT ON TABLE public.ad_creatives IS 'Universal creative storage for all campaign styles. Creatives are uploaded to Storage and metadata stored here. Supports both draft (pre-publish) and campaign (published) workflows. NEVER store file blobs in this table.';

COMMENT ON COLUMN public.ad_creatives.draft_id IS 'Link to campaign_drafts for draft workflow. Creatives added during wizard save here.';
COMMENT ON COLUMN public.ad_creatives.campaign_id IS 'Link to published campaign. Set when draft is launched.';
COMMENT ON COLUMN public.ad_creatives.storage_path IS 'Path in Supabase Storage (e.g., user_id/creative_id.mp4). REQUIRED.';
COMMENT ON COLUMN public.ad_creatives.storage_bucket IS 'Supabase Storage bucket name. Default: ad-assets (public).';
COMMENT ON COLUMN public.ad_creatives.public_url IS 'Full public URL that Meta can fetch from. Generated from storage_path.';
COMMENT ON COLUMN public.ad_creatives.file_size_bytes IS 'File size in bytes. NO ARTIFICIAL LIMITS - videos can be 200MB+.';
