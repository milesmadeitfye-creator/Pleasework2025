/*
  # Simplified App Secrets for Apple Music

  1. Schema Changes
    - Drop existing app_secrets (if composite key)
    - Create simple key/value table
    - Primary key on `key` only

  2. Security
    - RLS enabled
    - Service-role only access

  3. Apple Music Credentials
    - Insert Team ID, Key ID, Media ID, Private Key
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

-- Insert Apple Music credentials
INSERT INTO public.app_secrets (key, value) VALUES
  ('APPLE_TEAM_ID', 'VLZAPU5PL6'),
  ('APPLE_KEY_ID', '6AJB2CGP8N'),
  ('APPLE_MEDIA_ID', 'media.GhosteoneV1')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Insert private key (multi-line)
INSERT INTO public.app_secrets (key, value)
VALUES (
  'APPLE_PRIVATE_KEY_P8',
  '-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg3NbasAwv167hLUal
1vk0zVQbk+fb9nVgqFw+Dd2V4BqgCgYIKoZIzj0DAQehRANCAAQu2HECgJFhpOSh
cikWZN+ewPF0OgcRQD/W75EhlDRR+9ckzAYbshxRRSzKRNbmhs/WtHxccfvQXIyt
FOLewA8b
-----END PRIVATE KEY-----'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();

-- Create index
CREATE INDEX IF NOT EXISTS idx_app_secrets_key ON public.app_secrets(key);

COMMENT ON TABLE public.app_secrets IS 'Simple key/value secrets storage. Service-role access only.';