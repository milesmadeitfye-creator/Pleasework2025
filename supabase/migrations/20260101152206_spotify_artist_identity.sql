/*
  # Spotify Artist Identity System

  1. New Tables
    - `spotify_credentials`
      - `user_id` (uuid, primary key, references auth.users)
      - `access_token` (text, encrypted)
      - `refresh_token` (text, encrypted)
      - `token_expires_at` (timestamptz)
      - `scope` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `artist_identities`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `spotify_artist_id` (text, nullable)
      - `spotify_artist_name` (text, nullable)
      - `spotify_artist_image` (text, nullable)
      - `songstats_artist_id` (text, nullable)
      - `songstats_artist_name` (text, nullable)
      - `is_primary` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - spotify_credentials: Only accessible via service role (no user policies)
    - artist_identities: Users can read/write their own records

  3. Functions
    - `get_primary_artist_identity()`: Returns primary artist identity for current user
    - `has_spotify_connected()`: Check if user has valid Spotify credentials
*/

-- Create spotify_credentials table (service role only access)
CREATE TABLE IF NOT EXISTS public.spotify_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.spotify_credentials ENABLE ROW LEVEL SECURITY;

-- No user policies for spotify_credentials - service role only
-- This ensures tokens are never exposed to client

-- Create artist_identities table
CREATE TABLE IF NOT EXISTS public.artist_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_artist_id text,
  spotify_artist_name text,
  spotify_artist_image text,
  songstats_artist_id text,
  songstats_artist_name text,
  is_primary boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, spotify_artist_id)
);

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_artist_identities_user_primary
  ON public.artist_identities(user_id, is_primary);

ALTER TABLE public.artist_identities ENABLE ROW LEVEL SECURITY;

-- RLS policies for artist_identities
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artist_identities' 
    AND policyname = 'Users can read own artist identities'
  ) THEN
    CREATE POLICY "Users can read own artist identities"
      ON public.artist_identities
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artist_identities' 
    AND policyname = 'Users can insert own artist identities'
  ) THEN
    CREATE POLICY "Users can insert own artist identities"
      ON public.artist_identities
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artist_identities' 
    AND policyname = 'Users can update own artist identities'
  ) THEN
    CREATE POLICY "Users can update own artist identities"
      ON public.artist_identities
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'artist_identities' 
    AND policyname = 'Users can delete own artist identities'
  ) THEN
    CREATE POLICY "Users can delete own artist identities"
      ON public.artist_identities
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Drop existing function if it exists with wrong signature
DROP FUNCTION IF EXISTS public.get_primary_artist_identity();

-- RPC function to get primary artist identity
CREATE FUNCTION public.get_primary_artist_identity()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  spotify_artist_id text,
  spotify_artist_name text,
  spotify_artist_image text,
  songstats_artist_id text,
  songstats_artist_name text,
  is_primary boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ai.id,
    ai.user_id,
    ai.spotify_artist_id,
    ai.spotify_artist_name,
    ai.spotify_artist_image,
    ai.songstats_artist_id,
    ai.songstats_artist_name,
    ai.is_primary,
    ai.created_at,
    ai.updated_at
  FROM public.artist_identities ai
  WHERE ai.user_id = auth.uid()
    AND ai.is_primary = true
  LIMIT 1;
END;
$$;

-- Function to check if Spotify is connected
CREATE OR REPLACE FUNCTION public.has_spotify_connected()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.spotify_credentials
    WHERE user_id = auth.uid()
      AND token_expires_at > now()
  ) INTO token_exists;

  RETURN token_exists;
END;
$$;

-- Trigger to update updated_at on artist_identities
CREATE OR REPLACE FUNCTION public.update_artist_identity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_artist_identities_updated_at ON public.artist_identities;
CREATE TRIGGER update_artist_identities_updated_at
  BEFORE UPDATE ON public.artist_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_artist_identity_timestamp();

-- Trigger to update updated_at on spotify_credentials
CREATE OR REPLACE FUNCTION public.update_spotify_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_spotify_credentials_updated_at ON public.spotify_credentials;
CREATE TRIGGER update_spotify_credentials_updated_at
  BEFORE UPDATE ON public.spotify_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_spotify_credentials_timestamp();
