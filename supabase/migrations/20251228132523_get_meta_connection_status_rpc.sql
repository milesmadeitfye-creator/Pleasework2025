/*
  # Meta Connection Status RPC for Profile UI

  Creates a SECURITY DEFINER function that safely returns Meta connection status
  without exposing sensitive credentials or requiring direct table access.

  1. Function
    - `get_meta_connection_status()` - Returns Meta connection status for current user
    - SECURITY DEFINER - Runs with creator's privileges, bypassing RLS
    - Only callable by authenticated users

  2. Returns
    - is_connected: boolean - Whether Meta is connected
    - ad_account_id: text | null - Primary ad account ID (if configured)
    - ad_account_name: text | null - Primary ad account name (if configured)
    - page_id: text | null - Primary Facebook page ID (if configured)
    - page_name: text | null - Primary Facebook page name (if configured)
    - instagram_account_count: integer - Number of connected Instagram accounts
    - pixel_id: text | null - Primary Meta Pixel ID (if configured)
    - has_valid_token: boolean - Whether the access token is valid (not expired)
    - last_updated: timestamptz | null - Last update timestamp
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_meta_connection_status();

-- Create the RPC function
CREATE OR REPLACE FUNCTION public.get_meta_connection_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
  v_is_connected boolean := false;
  v_ad_account_id text := null;
  v_ad_account_name text := null;
  v_page_id text := null;
  v_page_name text := null;
  v_instagram_count integer := 0;
  v_pixel_id text := null;
  v_has_valid_token boolean := false;
  v_last_updated timestamptz := null;
  v_expires_at timestamptz := null;
BEGIN
  -- Get current user ID from auth context
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Check Meta connection via meta_credentials
  SELECT
    access_token IS NOT NULL AND access_token <> '',
    ad_account_id,
    page_id,
    pixel_id,
    expires_at,
    updated_at
  INTO
    v_is_connected,
    v_ad_account_id,
    v_page_id,
    v_pixel_id,
    v_expires_at,
    v_last_updated
  FROM meta_credentials
  WHERE user_id = v_user_id;

  -- If not found in meta_credentials, check if not connected
  IF NOT FOUND THEN
    v_is_connected := false;
  END IF;

  -- Check if token is valid (not expired)
  IF v_is_connected AND v_expires_at IS NOT NULL THEN
    v_has_valid_token := v_expires_at > NOW();
  ELSIF v_is_connected THEN
    -- If no expiry date, assume valid for now
    v_has_valid_token := true;
  END IF;

  -- If connected, get ad account name
  IF v_is_connected AND v_ad_account_id IS NOT NULL THEN
    SELECT name
    INTO v_ad_account_name
    FROM meta_ad_accounts
    WHERE user_id = v_user_id
      AND (ad_account_id = v_ad_account_id OR account_id = v_ad_account_id)
    LIMIT 1;
  END IF;

  -- If connected, get page name
  IF v_is_connected AND v_page_id IS NOT NULL THEN
    SELECT name
    INTO v_page_name
    FROM meta_pages
    WHERE user_id = v_user_id
      AND meta_page_id = v_page_id
    LIMIT 1;
  END IF;

  -- If connected, count Instagram accounts
  IF v_is_connected THEN
    SELECT COUNT(*)
    INTO v_instagram_count
    FROM meta_instagram_accounts
    WHERE user_id = v_user_id;
  END IF;

  -- Build result
  v_result := jsonb_build_object(
    'ok', true,
    'is_connected', v_is_connected,
    'ad_account_id', v_ad_account_id,
    'ad_account_name', v_ad_account_name,
    'page_id', v_page_id,
    'page_name', v_page_name,
    'instagram_account_count', v_instagram_count,
    'pixel_id', v_pixel_id,
    'has_valid_token', v_has_valid_token,
    'last_updated', v_last_updated
  );

  RETURN v_result;
END;
$$;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_meta_connection_status() TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_meta_connection_status() IS 'Returns Meta connection status for Profile UI. SECURITY DEFINER bypasses RLS for safe client access.';
