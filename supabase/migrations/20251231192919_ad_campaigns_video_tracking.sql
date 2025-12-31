/*
  # Add Video Ad Tracking Fields

  1. New Columns
    - `meta_video_id` - Meta video ID after upload
    - `meta_thumbnail_url` - Thumbnail URL used for video ad
    - `meta_video_status` - Video processing status (uploading, processing, ready, error)
    - `meta_video_progress` - Video processing progress percentage
    - `creative_type` - Type of creative (image, video, carousel)

  2. Purpose
    - Track video upload and processing status
    - Store thumbnail for video ads
    - Support retry logic for video processing
    - Distinguish between image and video creatives

  3. Security
    - Inherits existing RLS policies from ad_campaigns table
*/

-- Add meta_video_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_video_id'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_video_id TEXT;
  END IF;
END $$;

-- Add meta_thumbnail_url
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_thumbnail_url'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_thumbnail_url TEXT;
  END IF;
END $$;

-- Add meta_video_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_video_status'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_video_status TEXT;
  END IF;
END $$;

-- Add meta_video_progress
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'meta_video_progress'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN meta_video_progress INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add creative_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ad_campaigns' AND column_name = 'creative_type'
  ) THEN
    ALTER TABLE public.ad_campaigns ADD COLUMN creative_type TEXT DEFAULT 'image';
  END IF;
END $$;

-- Create index on meta_video_id for lookups
CREATE INDEX IF NOT EXISTS ad_campaigns_meta_video_id_idx
  ON public.ad_campaigns (meta_video_id)
  WHERE meta_video_id IS NOT NULL;

-- Create index on meta_video_status for monitoring
CREATE INDEX IF NOT EXISTS ad_campaigns_meta_video_status_idx
  ON public.ad_campaigns (meta_video_status)
  WHERE meta_video_status IS NOT NULL;

COMMENT ON COLUMN public.ad_campaigns.meta_video_id IS 'Meta video ID after upload to Meta platform';
COMMENT ON COLUMN public.ad_campaigns.meta_thumbnail_url IS 'Thumbnail URL used for video ad creative';
COMMENT ON COLUMN public.ad_campaigns.meta_video_status IS 'Video processing status: uploading, processing, ready, error';
COMMENT ON COLUMN public.ad_campaigns.meta_video_progress IS 'Video processing progress percentage (0-100)';
COMMENT ON COLUMN public.ad_campaigns.creative_type IS 'Type of creative: image, video, carousel';
