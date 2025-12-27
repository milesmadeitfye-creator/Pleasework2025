/*
  # AI Setup Status with Profile Fallbacks

  Adds fallback Meta configuration fields to user_profiles and updates ai_get_setup_status
  to use these as fallbacks when direct Meta connections aren't available.

  1. Schema Changes
    - Adds meta_ad_account_id to user_profiles (fallback ad account)
    - Adds meta_page_id to user_profiles (fallback page)
    - Adds meta_pixel_id to user_profiles (fallback pixel)
    - Adds default_ad_destination_url to user_profiles (fallback destination)

  2. Function Updates
    - Updates ai_get_setup_status RPC to check user_profiles for fallbacks
    - Returns resolved assets (direct connection > profile fallbacks)
    - Never shows "Not connected" when fallback assets exist

  3. Security
    - RLS policies remain unchanged (user can only see their own data)
    - SECURITY DEFINER function bypasses RLS for consistent results
*/

-- ========== ENSURE user_profiles TABLE EXISTS ==========
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  bio text,
  website text,
  spotify_artist_id text,
  apple_music_artist_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ========== ADD FALLBACK META FIELDS ==========
DO $$
BEGIN
  -- meta_ad_account_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'meta_ad_account_id'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN meta_ad_account_id text;
  END IF;

  -- meta_page_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'meta_page_id'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN meta_page_id text;
  END IF;

  -- meta_pixel_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'meta_pixel_id'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN meta_pixel_id text;
  END IF;

  -- default_ad_destination_url
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles'
    AND column_name = 'default_ad_destination_url'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN default_ad_destination_url text;
  END IF;
END $$;

-- ========== ENABLE RLS ==========
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ========== UPDATE AI_GET_SETUP_STATUS RPC ==========
DROP FUNCTION IF EXISTS public.ai_get_setup_status(uuid);

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
  v_profile_fallback jsonb;
  v_resolved_ad_account text := null;
  v_resolved_page text := null;
  v_resolved_pixel text := null;
  v_resolved_destination text := null;
BEGIN
  -- Get profile fallback values
  SELECT jsonb_build_object(
    'ad_account_id', meta_ad_account_id,
    'page_id', meta_page_id,
    'pixel_id', meta_pixel_id,
    'destination_url', default_ad_destination_url
  )
  INTO v_profile_fallback
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_profile_fallback IS NULL THEN
    v_profile_fallback := '{}'::jsonb;
  END IF;

  -- Check Meta connection via meta_credentials
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
    -- Fallback: Check user_integrations
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

  -- Gather assets if connected
  IF v_has_meta THEN
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

  -- Resolve ad account (connected > profile fallback)
  IF jsonb_array_length(v_ad_accounts) > 0 THEN
    v_resolved_ad_account := v_ad_accounts->0->>'id';
  ELSIF v_profile_fallback->>'ad_account_id' IS NOT NULL THEN
    v_resolved_ad_account := v_profile_fallback->>'ad_account_id';
    v_ad_accounts := jsonb_build_array(
      jsonb_build_object(
        'id', v_profile_fallback->>'ad_account_id',
        'account_id', v_profile_fallback->>'ad_account_id',
        'name', 'Profile Default',
        'currency', 'USD',
        'source', 'profile_fallback'
      )
    );
  END IF;

  -- Resolve page (connected > profile fallback)
  IF jsonb_array_length(v_pages) > 0 THEN
    v_resolved_page := v_pages->0->>'id';
  ELSIF v_profile_fallback->>'page_id' IS NOT NULL THEN
    v_resolved_page := v_profile_fallback->>'page_id';
    v_pages := jsonb_build_array(
      jsonb_build_object(
        'id', v_profile_fallback->>'page_id',
        'name', 'Profile Default',
        'source', 'profile_fallback'
      )
    );
  END IF;

  -- Resolve pixel (connected > profile fallback)
  IF jsonb_array_length(v_pixels) > 0 THEN
    v_resolved_pixel := v_pixels->0->>'id';
  ELSIF v_profile_fallback->>'pixel_id' IS NOT NULL THEN
    v_resolved_pixel := v_profile_fallback->>'pixel_id';
    v_pixels := jsonb_build_array(
      jsonb_build_object(
        'id', v_profile_fallback->>'pixel_id',
        'name', 'Profile Default',
        'is_available', true,
        'source', 'profile_fallback'
      )
    );
  END IF;

  -- Get smart links
  SELECT COUNT(*)
  INTO v_smart_links_count
  FROM smart_links
  WHERE user_id = p_user_id;

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

  -- Resolve destination URL (profile fallback > smart link)
  IF v_profile_fallback->>'destination_url' IS NOT NULL THEN
    v_resolved_destination := v_profile_fallback->>'destination_url';
  ELSIF jsonb_array_length(v_smart_links_preview) > 0 THEN
    v_resolved_destination := v_smart_links_preview->0->>'destination_url';
  END IF;

  -- Mark has_meta if ANY resolved assets exist
  IF v_resolved_ad_account IS NOT NULL
     OR v_resolved_page IS NOT NULL
     OR v_resolved_pixel IS NOT NULL THEN
    v_has_meta := true;
    IF v_source_table IS NULL THEN
      v_source_table := 'profile_fallback';
    END IF;
  END IF;

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
    'smart_links_preview', v_smart_links_preview,
    'resolved', jsonb_build_object(
      'ad_account_id', v_resolved_ad_account,
      'page_id', v_resolved_page,
      'pixel_id', v_resolved_pixel,
      'destination_url', v_resolved_destination
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_get_setup_status(uuid) TO authenticated;

COMMENT ON FUNCTION public.ai_get_setup_status(uuid) IS 'Returns canonical setup status for Ghoste AI with profile fallbacks. SECURITY DEFINER bypasses RLS. Uses direct connections first then user_profiles fallbacks.';

CREATE INDEX IF NOT EXISTS idx_user_profiles_meta_fields
  ON public.user_profiles(meta_ad_account_id, meta_page_id, meta_pixel_id)
  WHERE meta_ad_account_id IS NOT NULL
     OR meta_page_id IS NOT NULL
     OR meta_pixel_id IS NOT NULL;
