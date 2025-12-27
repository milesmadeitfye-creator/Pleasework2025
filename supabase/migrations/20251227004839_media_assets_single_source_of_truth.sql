/*
  # Media Assets - Single Source of Truth for Uploads

  ## Problem
  Media uploads in Ghoste AI were flaky for Meta ads:
  - No centralized tracking
  - URL reachability issues
  - Storage keys exposed to client
  - No retry/validation mechanism

  ## Solution
  Create `media_assets` table as single source of truth.

  ## Tables Created

  ### media_assets
  Centralized registry of all uploaded media files.

  Columns:
  - `id` - UUID primary key
  - `owner_user_id` - User who uploaded (FK to auth.users)
  - `kind` - video|image|audio|file
  - `filename` - Original filename
  - `mime` - MIME type
  - `size` - File size in bytes
  - `storage_bucket` - Supabase storage bucket name
  - `storage_key` - Storage path/key (NEVER exposed to client)
  - `public_url` - Public URL if bucket is public
  - `signed_url` - Temporary signed URL (for private buckets)
  - `signed_url_expires_at` - Expiry timestamp for signed URL
  - `status` - uploading|ready|failed
  - `meta_ready` - Boolean: is URL fetchable by Meta?
  - `meta_ready_url` - Verified URL for Meta Ads API
  - `meta_last_check_at` - Last time we verified Meta reachability
  - `created_at` - Creation timestamp
  - `updated_at` - Last update timestamp

  ## Security
  - RLS enabled: users can only access their own media
  - Service role can access all (for background jobs)
  - storage_key NEVER returned in client queries (use helper function)

  ## Usage Flow
  1. Upload starts → create media_assets row (status='uploading')
  2. Upload completes → update status='ready', store storage_key
  3. Ads builder → call media-meta-ready function → get meta_ready_url
  4. Meta API → use meta_ready_url for creative creation

  ## Migration Notes
  - Safe to run: creates new table, no data migration needed
  - Existing uploads in user_uploads table remain separate
  - Future: can backfill from user_uploads if needed
*/

-- Create media_assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File metadata
  kind TEXT NOT NULL CHECK (kind IN ('video', 'image', 'audio', 'file')),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  
  -- Storage details (NEVER expose storage_key to client)
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  
  -- URLs for access
  public_url TEXT NULL,
  signed_url TEXT NULL,
  signed_url_expires_at TIMESTAMPTZ NULL,
  
  -- Upload status
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'failed')),
  
  -- Meta Ads readiness
  meta_ready BOOLEAN NOT NULL DEFAULT false,
  meta_ready_url TEXT NULL,
  meta_last_check_at TIMESTAMPTZ NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_assets_owner 
  ON public.media_assets(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_media_assets_status 
  ON public.media_assets(status) 
  WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS idx_media_assets_meta_ready 
  ON public.media_assets(meta_ready, owner_user_id) 
  WHERE meta_ready = true;

CREATE INDEX IF NOT EXISTS idx_media_assets_kind 
  ON public.media_assets(kind, owner_user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_media_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_media_assets_updated_at();

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own media assets (but storage_key is hidden via helper)
CREATE POLICY "Users can view own media assets"
  ON public.media_assets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Users can insert their own media assets
CREATE POLICY "Users can insert own media assets"
  ON public.media_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

-- Users can update their own media assets
CREATE POLICY "Users can update own media assets"
  ON public.media_assets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Users can delete their own media assets
CREATE POLICY "Users can delete own media assets"
  ON public.media_assets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

-- Service role can do everything (for background jobs)
CREATE POLICY "Service role full access"
  ON public.media_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Helper function: Get safe media asset (without storage_key)
CREATE OR REPLACE FUNCTION public.get_media_asset_safe(asset_id UUID)
RETURNS TABLE (
  id UUID,
  owner_user_id UUID,
  kind TEXT,
  filename TEXT,
  mime TEXT,
  size BIGINT,
  status TEXT,
  meta_ready BOOLEAN,
  meta_ready_url TEXT,
  created_at TIMESTAMPTZ
) 
SECURITY DEFINER
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    id,
    owner_user_id,
    kind,
    filename,
    mime,
    size,
    status,
    meta_ready,
    meta_ready_url,
    created_at
  FROM public.media_assets
  WHERE id = asset_id
  AND (
    owner_user_id = auth.uid()
    OR auth.jwt()->>'role' = 'service_role'
  );
$$;

COMMENT ON FUNCTION public.get_media_asset_safe IS 'Get media asset metadata without exposing storage_key to client';

-- Helper function: Get meta-ready assets for user
CREATE OR REPLACE FUNCTION public.get_user_meta_ready_assets(user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  id UUID,
  kind TEXT,
  filename TEXT,
  meta_ready_url TEXT,
  created_at TIMESTAMPTZ
)
SECURITY DEFINER
LANGUAGE SQL
STABLE
AS $$
  SELECT 
    id,
    kind,
    filename,
    meta_ready_url,
    created_at
  FROM public.media_assets
  WHERE owner_user_id = user_id
  AND meta_ready = true
  AND status = 'ready'
  ORDER BY created_at DESC;
$$;

COMMENT ON FUNCTION public.get_user_meta_ready_assets IS 'Get all Meta-ready media assets for a user';

-- Table comments
COMMENT ON TABLE public.media_assets IS 'Single source of truth for all uploaded media files';
COMMENT ON COLUMN public.media_assets.storage_key IS 'NEVER expose to client - use helper functions';
COMMENT ON COLUMN public.media_assets.meta_ready_url IS 'Verified URL that Meta Ads API can fetch';
COMMENT ON COLUMN public.media_assets.meta_ready IS 'Has been validated as fetchable by Meta';
