/*
  # Ads Operations Logging System

  1. New Tables
    - `ads_operations`
      - `id` (uuid, primary key)
      - `created_at` (timestamptz)
      - `user_id` (uuid, nullable)
      - `label` (text) - operation type like 'publish', 'saveDraft', etc.
      - `source` (text) - 'netlify' or 'client'
      - `request` (jsonb) - sanitized request payload
      - `response` (jsonb) - sanitized response
      - `status` (integer) - HTTP status code
      - `ok` (boolean) - success flag
      - `meta_campaign_id` (text) - Meta campaign ID if applicable
      - `meta_adset_id` (text) - Meta adset ID if applicable
      - `meta_ad_id` (text) - Meta ad ID if applicable
      - `error` (text) - error message if failed

  2. Security
    - Enable RLS on `ads_operations` table
    - Users can only read their own operations
    - Inserts are server-side only (service role)

  3. Indexes
    - Index on created_at for recent operations queries
    - Index on user_id + created_at for user-scoped queries
*/

-- Create ads_operations table
CREATE TABLE IF NOT EXISTS public.ads_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  label text NOT NULL,
  source text NOT NULL DEFAULT 'netlify',
  request jsonb,
  response jsonb,
  status integer,
  ok boolean,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  error text,
  CONSTRAINT ads_operations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS ads_operations_created_at_idx ON public.ads_operations (created_at DESC);
CREATE INDEX IF NOT EXISTS ads_operations_user_id_created_at_idx ON public.ads_operations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ads_operations_label_idx ON public.ads_operations (label);

-- Enable RLS
ALTER TABLE public.ads_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own operations
CREATE POLICY "Users can read own operations"
  ON public.ads_operations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE policies - server-side only via service role

-- Add helpful comment
COMMENT ON TABLE public.ads_operations IS 'Server-side log of all ads operations for debugging. Sanitized data only.';