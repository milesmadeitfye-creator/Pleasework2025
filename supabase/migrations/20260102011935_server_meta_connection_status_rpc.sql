/*
  # Server-side Meta Connection Status RPC

  1. New Function
    - `get_meta_connection_status_for_user(p_user_id uuid)`
    - Returns same structure as client RPC but accepts user_id parameter
    - SECURITY DEFINER to query meta_credentials regardless of RLS
    - For use by Netlify functions running with service_role

  2. Security
    - REVOKE ALL from PUBLIC
    - GRANT EXECUTE to service_role only
    - Client code continues using get_meta_connection_status() (no args)

  3. Purpose
    - Fix META_NOT_CONNECTED errors in ads-publish
    - Server-side functions can now check Meta status without auth.uid() context
*/

-- Create server-side RPC that accepts user_id parameter
CREATE OR REPLACE FUNCTION public.get_meta_connection_status_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mc RECORD;
  auth_connected boolean := false;
  assets_configured boolean := false;
  missing text[] := ARRAY[]::text[];
BEGIN
  -- Query meta_credentials for the specified user
  SELECT *
  INTO mc
  FROM public.meta_credentials
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  -- Check if access token exists and is not empty
  auth_connected := (mc.access_token IS NOT NULL AND length(mc.access_token) > 0);

  -- Check required assets and build missing list
  IF mc.ad_account_id IS NULL OR mc.ad_account_id = '' THEN
    missing := array_append(missing, 'ad_account_id');
  END IF;

  IF mc.page_id IS NULL OR mc.page_id = '' THEN
    missing := array_append(missing, 'page_id');
  END IF;

  IF mc.pixel_id IS NULL OR mc.pixel_id = '' THEN
    missing := array_append(missing, 'pixel_id');
  END IF;

  IF mc.instagram_actor_id IS NULL OR mc.instagram_actor_id = '' THEN
    missing := array_append(missing, 'instagram_actor_id');
  END IF;

  -- Assets configured = no missing assets AND auth connected
  assets_configured := (array_length(missing, 1) IS NULL) AND auth_connected;

  -- Return same structure as client RPC
  RETURN jsonb_build_object(
    'auth_connected', auth_connected,
    'assets_configured', assets_configured,
    'ad_account_id', mc.ad_account_id,
    'page_id', mc.page_id,
    'pixel_id', mc.pixel_id,
    'instagram_actor_id', mc.instagram_actor_id,
    'missing_assets', COALESCE(missing, ARRAY[]::text[]),
    'source', 'meta_credentials'
  );
END;
$$;

-- Security: Revoke all public access, grant only to service_role
REVOKE ALL ON FUNCTION public.get_meta_connection_status_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meta_connection_status_for_user(uuid) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_meta_connection_status_for_user(uuid) IS
'Server-side Meta connection status check. Used by Netlify functions with service_role. Client code should use get_meta_connection_status() without arguments.';
