/*
  # AI Get Setup Status RPC

  Creates a SECURITY DEFINER function that returns canonical setup status for Ghoste AI.
  This is the single source of truth for AI decisions about Meta connections and Smart Links.

  1. Function
    - `ai_get_setup_status(p_user_id uuid)` - Returns complete setup status as JSON
    - SECURITY DEFINER - Runs with creator's privileges, bypassing RLS
    - Only callable by authenticated users for their own data

  2. Returns
    - meta.has_meta: boolean - Whether user has Meta connected
    - meta.source_table: text - Which table was used to determine connection
    - meta.ad_accounts: array - Connected ad accounts
    - meta.pages: array - Connected Facebook pages
    - meta.pixels: array - Connected Meta pixels
    - meta.instagram_accounts: array - Connected Instagram accounts
    - smart_links_count: integer - Total smart links for user
    - smart_links_preview: array - First 5 smart links with details
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.ai_get_setup_status(uuid);

-- Create the RPC function
CREATE OR REPLACE FUNCTION public.ai_get_setup_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_has_meta boolean := false;
  v_source_table text := null;
  v_ad_accounts jsonb := '[]'::jsonb;
  v_pages jsonb := '[]'::jsonb;
  v_pixels jsonb := '[]'::jsonb;
  v_instagram_accounts jsonb := '[]'::jsonb;
  v_smart_links_count integer := 0;
  v_smart_links_preview jsonb := '[]'::jsonb;
BEGIN
  -- Check Meta connection via meta_credentials (primary source)
  SELECT EXISTS (
    SELECT 1
    FROM meta_credentials
    WHERE user_id = p_user_id
      AND access_token IS NOT NULL
      AND access_token <> ''
  ) INTO v_has_meta;

  IF v_has_meta THEN
    v_source_table := 'meta_credentials';
  ELSE
    -- Fallback: Check user_integrations table
    SELECT EXISTS (
      SELECT 1
      FROM user_integrations
      WHERE user_id = p_user_id
        AND platform = 'meta'
        AND connected = true
    ) INTO v_has_meta;

    IF v_has_meta THEN
      v_source_table := 'user_integrations';
    END IF;
  END IF;

  -- If Meta is connected, gather assets
  IF v_has_meta THEN
    -- Get ad accounts
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'account_id', COALESCE(ad_account_id, account_id),
        'name', name,
        'currency', currency
      )
    ), '[]'::jsonb)
    INTO v_ad_accounts
    FROM meta_ad_accounts
    WHERE user_id = p_user_id;

    -- Get pages
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', meta_page_id,
        'name', name,
        'category', category
      )
    ), '[]'::jsonb)
    INTO v_pages
    FROM meta_pages
    WHERE user_id = p_user_id;

    -- Get pixels
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', meta_pixel_id,
        'name', name,
        'is_available', is_available
      )
    ), '[]'::jsonb)
    INTO v_pixels
    FROM meta_pixels
    WHERE user_id = p_user_id
      AND is_available = true;

    -- Get Instagram accounts
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', meta_instagram_id,
        'username', username,
        'profile_picture_url', profile_picture_url
      )
    ), '[]'::jsonb)
    INTO v_instagram_accounts
    FROM meta_instagram_accounts
    WHERE user_id = p_user_id;
  END IF;

  -- Get smart links count
  SELECT COUNT(*)
  INTO v_smart_links_count
  FROM smart_links
  WHERE user_id = p_user_id;

  -- Get smart links preview (first 5, most recent)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'slug', slug,
      'destination_url', COALESCE(
        spotify_url,
        apple_music_url,
        youtube_url,
        youtube_music_url,
        tidal_url,
        soundcloud_url,
        deezer_url,
        amazon_music_url,
        'https://ghoste.one/s/' || slug
      ),
      'created_at', created_at
    )
  ), '[]'::jsonb)
  INTO v_smart_links_preview
  FROM (
    SELECT id, title, slug, created_at,
           spotify_url, apple_music_url, youtube_url, youtube_music_url,
           tidal_url, soundcloud_url, deezer_url, amazon_music_url
    FROM smart_links
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 5
  ) recent_links;

  -- Build result
  v_result := jsonb_build_object(
    'meta', jsonb_build_object(
      'has_meta', v_has_meta,
      'source_table', v_source_table,
      'ad_accounts', v_ad_accounts,
      'pages', v_pages,
      'pixels', v_pixels,
      'instagram_accounts', v_instagram_accounts
    ),
    'smart_links_count', v_smart_links_count,
    'smart_links_preview', v_smart_links_preview
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.ai_get_setup_status(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.ai_get_setup_status(uuid) IS 'Returns canonical setup status for Ghoste AI. SECURITY DEFINER bypasses RLS for consistent results.';
