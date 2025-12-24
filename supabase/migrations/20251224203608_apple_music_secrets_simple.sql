/*
  # Simplified App Secrets for Apple Music

  1. Schema Changes
    - Drop existing app_secrets (if composite key)
    - Create simple key/value table
    - Primary key on `key` only

  2. Security
    - RLS enabled
    - Service-role only access
    - Private key never exposed to client
    - JWT signing server-side only

  3. Apple Music Credentials
    - APPLE_MUSIC_TEAM_ID: Your Apple Developer Team ID
    - APPLE_MUSIC_KEY_ID: Your MusicKit API Key ID
    - APPLE_MUSIC_PRIVATE_KEY_P8: Your .p8 private key content
*/

-- Drop existing table if using composite key
DROP TABLE IF EXISTS public.app_secrets CASCADE;

-- Create simple key/value secrets table
CREATE TABLE public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Revoke all access from anon and authenticated
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

-- NOTE: Apple Music credentials must be inserted manually after rotating keys.
-- Use Supabase SQL Editor or psql to run:
--
-- INSERT INTO public.app_secrets (key, value) VALUES
--   ('APPLE_MUSIC_TEAM_ID', 'your_team_id_here'),
--   ('APPLE_MUSIC_KEY_ID', 'your_key_id_here'),
--   ('APPLE_MUSIC_PRIVATE_KEY_P8', 'your_p8_private_key_content_here')
-- ON CONFLICT (key) DO UPDATE
-- SET value = EXCLUDED.value, updated_at = now();
--
-- SECURITY WARNING: NEVER commit actual secrets to source control.
-- NEVER print or log the private key content.
-- Token signing happens server-side only via apple-music-token function.

-- Create index
CREATE INDEX IF NOT EXISTS idx_app_secrets_key ON public.app_secrets(key);

COMMENT ON TABLE public.app_secrets IS 'Simple key/value secrets storage. Service-role access only.';