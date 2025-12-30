/*
  # Update email_jobs schema

  ## Purpose
  Add send_after column for delayed sending and rename error to last_error.

  ## Changes
  1. Add send_after column (nullable timestamptz)
  2. Rename error column to last_error
  3. Add index on send_after for scheduling queries
*/

-- Add send_after column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'email_jobs'
    AND column_name = 'send_after'
  ) THEN
    ALTER TABLE public.email_jobs ADD COLUMN send_after timestamptz;
  END IF;
END $$;

-- Rename error to last_error if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'email_jobs'
    AND column_name = 'error'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'email_jobs'
    AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.email_jobs RENAME COLUMN error TO last_error;
  END IF;
END $$;

-- Add index for scheduling queries
CREATE INDEX IF NOT EXISTS idx_email_jobs_send_after
  ON public.email_jobs(send_after)
  WHERE status IN ('pending', 'queued');

-- Update comment
COMMENT ON COLUMN public.email_jobs.send_after IS 'Scheduled send time. NULL = send immediately. Job processes only if send_after <= now()';
COMMENT ON COLUMN public.email_jobs.last_error IS 'Error message from last send attempt';
