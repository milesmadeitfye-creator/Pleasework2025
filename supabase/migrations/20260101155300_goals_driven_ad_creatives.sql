/*
  # Goals-Driven Ad Creatives System

  Enables Goals system to drive ad creation using ad_creatives table.

  ## Changes

  1. **ad_creatives enhancements**
     - Add `goal_key` column to tag creatives by goal
     - Add `template_key` column for template mapping
     - Add indexes for efficient goal-based queries

  2. **Key Features**
     - Each creative tagged with a specific goal (streams, presave, etc.)
     - Orchestrator groups creatives by goal_key
     - Destination URLs auto-filled from goal assets
     - Supports backfill of existing creatives

  ## Usage

  When uploading creatives:
  1. User selects active goal from Profile
  2. Creative is tagged with goal_key on upload
  3. Orchestrator creates campaigns using goal-tagged creatives

  ## Security

  - RLS policies already protect ad_creatives via owner_user_id
  - goal_key is optional (nullable) to support existing creatives
*/

-- Add goal_key and template_key to ad_creatives
ALTER TABLE public.ad_creatives
  ADD COLUMN IF NOT EXISTS goal_key text,
  ADD COLUMN IF NOT EXISTS template_key text;

-- Create index for efficient goal-based queries
CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_goal
  ON public.ad_creatives(owner_user_id, goal_key)
  WHERE goal_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ad_creatives_user_status_goal
  ON public.ad_creatives(owner_user_id, status, goal_key)
  WHERE status = 'ready' AND goal_key IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.ad_creatives.goal_key IS 'Overall goal this creative serves (e.g., streams, presave, build_audience, followers, virality, fan_segmentation). Used by orchestrator to group creatives by goal. NULL for legacy creatives.';
COMMENT ON COLUMN public.ad_creatives.template_key IS 'Ad template this creative is designed for (optional). Used for template-specific creative requirements.';

-- Create helper function to get creatives by goal
CREATE OR REPLACE FUNCTION public.get_creatives_by_goal(
  p_user_id uuid,
  p_goal_key text,
  p_status text DEFAULT 'ready'
)
RETURNS TABLE (
  id uuid,
  creative_type text,
  public_url text,
  storage_path text,
  destination_url text,
  headline text,
  primary_text text,
  description text,
  cta text,
  file_size_bytes bigint,
  template_key text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.creative_type,
    ac.public_url,
    ac.storage_path,
    ac.destination_url,
    ac.headline,
    ac.primary_text,
    ac.description,
    ac.cta,
    ac.file_size_bytes,
    ac.template_key,
    ac.created_at
  FROM public.ad_creatives ac
  WHERE ac.owner_user_id = p_user_id
    AND ac.goal_key = p_goal_key
    AND ac.status = p_status
  ORDER BY ac.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_creatives_by_goal(uuid, text, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_creatives_by_goal IS 'Fetch creatives for a specific goal. Used by orchestrator to group creatives by goal_key.';