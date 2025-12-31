/*
  # Meta Connection RPC - Read Asset Names from Credentials

  Fixes the RPC to read ad_account_name and page_name from meta_credentials
  instead of separate tables. The wizard saves these names to meta_credentials,
  but the RPC wasn't reading them.

  ## Changes

  1. Read ad_account_name and page_name from meta_credentials primary SELECT
  2. Remove separate table lookups for names (kept as fallback if needed)
  3. Use COALESCE to prefer meta_credentials names, fallback to separate tables
*/

-- Drop existing function
DROP FUNCTION IF EXISTS public.get_meta_connection_status();

-- Create updated RPC that reads names from meta_credentials
CREATE OR REPLACE FUNCTION public.get_meta_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;

  -- Auth layer
  v_auth_connected boolean := false;
  v_has_token boolean := false;
  v_token_valid boolean := false;
  v_expires_at timestamptz := null;

  -- Assets layer
  v_assets_configured boolean := false;
  v_missing_assets text[] := ARRAY[]::text[];

  -- Asset values (read from meta_credentials)
  v_ad_account_id text := null;
  v_ad_account_name text := null;
  v_page_id text := null;
  v_page_name text := null;
  v_instagram_actor_id text := null;
  v_instagram_count integer := 0;
  v_pixel_id text := null;

  -- Fallback names from separate tables
  v_ad_account_name_fallback text := null;
  v_page_name_fallback text := null;

  v_last_updated timestamptz := null;
BEGIN
  -- Get current user ID from auth context
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Not authenticated',
      'auth_connected', false,
      'assets_configured', false
    );
  END IF;

  -- Check Meta credentials (read names from this table)
  SELECT
    access_token IS NOT NULL AND access_token <> '',
    ad_account_id,
    ad_account_name,
    page_id,
    COALESCE(page_name, facebook_page_name),
    instagram_actor_id,
    pixel_id,
    expires_at,
    updated_at
  INTO
    v_has_token,
    v_ad_account_id,
    v_ad_account_name,
    v_page_id,
    v_page_name,
    v_instagram_actor_id,
    v_pixel_id,
    v_expires_at,
    v_last_updated
  FROM meta_credentials
  WHERE user_id = v_user_id;

  -- If no record found, user has never connected Meta
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'auth_connected', false,
      'assets_configured', false,
      'has_token', false,
      'missing_assets', ARRAY['meta_oauth']::text[]
    );
  END IF;

  -- AUTH LAYER: Check if token is valid (not expired)
  IF v_has_token AND v_expires_at IS NOT NULL THEN
    v_token_valid := v_expires_at > NOW();
  ELSIF v_has_token THEN
    -- If no expiry date, assume valid for now
    v_token_valid := true;
  END IF;

  -- Auth connected = has valid token (regardless of assets)
  v_auth_connected := v_has_token AND v_token_valid;

  -- ASSETS LAYER: Check required assets
  -- Required: ad_account_id, page_id
  -- Optional but recommended: instagram_actor_id, pixel_id

  IF v_ad_account_id IS NULL OR v_ad_account_id = '' THEN
    v_missing_assets := array_append(v_missing_assets, 'ad_account_id');
  END IF;

  IF v_page_id IS NULL OR v_page_id = '' THEN
    v_missing_assets := array_append(v_missing_assets, 'page_id');
  END IF;

  -- Assets configured = has required assets
  v_assets_configured := (
    v_auth_connected AND
    v_ad_account_id IS NOT NULL AND v_ad_account_id <> '' AND
    v_page_id IS NOT NULL AND v_page_id <> ''
  );

  -- Fallback: Get names from separate tables if not in meta_credentials
  IF v_auth_connected AND v_ad_account_id IS NOT NULL AND (v_ad_account_name IS NULL OR v_ad_account_name = '') THEN
    SELECT name
    INTO v_ad_account_name_fallback
    FROM meta_ad_accounts
    WHERE user_id = v_user_id
      AND (ad_account_id = v_ad_account_id OR account_id = v_ad_account_id)
    LIMIT 1;

    v_ad_account_name := COALESCE(v_ad_account_name, v_ad_account_name_fallback);
  END IF;

  IF v_auth_connected AND v_page_id IS NOT NULL AND (v_page_name IS NULL OR v_page_name = '') THEN
    SELECT name
    INTO v_page_name_fallback
    FROM meta_pages
    WHERE user_id = v_user_id
      AND meta_page_id = v_page_id
    LIMIT 1;

    v_page_name := COALESCE(v_page_name, v_page_name_fallback);
  END IF;

  -- Count Instagram accounts if connected
  IF v_auth_connected THEN
    SELECT COUNT(*)
    INTO v_instagram_count
    FROM meta_instagram_accounts
    WHERE user_id = v_user_id;
  END IF;

  -- Build result with both layers
  v_result := jsonb_build_object(
    'ok', true,

    -- Auth layer
    'auth_connected', v_auth_connected,
    'has_token', v_has_token,
    'token_valid', v_token_valid,

    -- Assets layer
    'assets_configured', v_assets_configured,
    'missing_assets', v_missing_assets,

    -- Asset details (names now from meta_credentials)
    'ad_account_id', v_ad_account_id,
    'ad_account_name', v_ad_account_name,
    'page_id', v_page_id,
    'page_name', v_page_name,
    'instagram_actor_id', v_instagram_actor_id,
    'instagram_account_count', v_instagram_count,
    'pixel_id', v_pixel_id,

    -- Legacy field for backward compatibility
    'is_connected', v_auth_connected,

    'last_updated', v_last_updated
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_meta_connection_status() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_meta_connection_status() IS 'Returns Meta connection status with auth vs assets split. Reads asset names from meta_credentials. SECURITY DEFINER bypasses RLS.';
