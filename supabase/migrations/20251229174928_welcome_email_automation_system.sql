/*
  # Welcome Email + Automation System

  ## Purpose
  Implement Mailgun-powered welcome email that triggers all automations,
  with backfill capability for existing users.

  ## Changes
  1. **User Profiles Enhancement**
     - Add welcome_email_sent_at timestamp to track welcome email delivery
     - Prevents duplicate welcome emails

  2. **Email Outbox Table**
     - Queue system for all outbound emails
     - Statuses: queued, sending, sent, failed
     - Supports retry logic and error tracking

  3. **Automation Events Table**
     - Simple event bus for triggering automation sequences
     - Records welcome_sent events to start email sequences

  4. **Unique Constraints**
     - Prevent duplicate welcome emails per user
     - Idempotent enqueue operations

  ## Security
  - RLS enabled on all tables
  - Service role required for email operations
  - Admin key protection on worker endpoints
*/

-- Add welcome email tracking to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'welcome_email_sent_at'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN welcome_email_sent_at timestamptz;
  END IF;
END $$;

-- Create email_outbox table (queue system)
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  template_key text NOT NULL,
  subject text NOT NULL,
  payload jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts integer DEFAULT 0,
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

-- Create indexes for email_outbox
CREATE INDEX IF NOT EXISTS idx_email_outbox_status_created
  ON public.email_outbox(status, created_at)
  WHERE status IN ('queued', 'sending');

CREATE INDEX IF NOT EXISTS idx_email_outbox_user_id
  ON public.email_outbox(user_id);

CREATE INDEX IF NOT EXISTS idx_email_outbox_template_key
  ON public.email_outbox(template_key);

-- Create unique constraint to prevent duplicate welcome emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_welcome_unique
  ON public.email_outbox(user_id, template_key)
  WHERE template_key = 'welcome_v1' AND status != 'failed';

-- Create automation_events table (event bus)
CREATE TABLE IF NOT EXISTS public.automation_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

-- Create indexes for automation_events
CREATE INDEX IF NOT EXISTS idx_automation_events_user_id
  ON public.automation_events(user_id);

CREATE INDEX IF NOT EXISTS idx_automation_events_event_key
  ON public.automation_events(event_key);

CREATE INDEX IF NOT EXISTS idx_automation_events_created
  ON public.automation_events(created_at DESC);

-- Index for user_profiles.welcome_email_sent_at
CREATE INDEX IF NOT EXISTS idx_user_profiles_welcome_email_sent
  ON public.user_profiles(welcome_email_sent_at)
  WHERE welcome_email_sent_at IS NOT NULL;

-- RLS Policies for email_outbox
CREATE POLICY "Service role can manage email outbox"
  ON public.email_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own email outbox (for transparency)
CREATE POLICY "Users can view own email outbox"
  ON public.email_outbox
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for automation_events
CREATE POLICY "Service role can manage automation events"
  ON public.automation_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own automation events
CREATE POLICY "Users can view own automation events"
  ON public.automation_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to safely enqueue welcome email
CREATE OR REPLACE FUNCTION enqueue_welcome_email(
  p_user_id uuid,
  p_email text,
  p_first_name text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id bigint;
  v_payload jsonb;
BEGIN
  -- Build payload
  v_payload := jsonb_build_object(
    'firstName', COALESCE(p_first_name, 'there'),
    'email', p_email
  );

  -- Insert into email_outbox (unique constraint prevents duplicates)
  INSERT INTO public.email_outbox (
    user_id,
    to_email,
    template_key,
    subject,
    payload,
    status,
    attempts
  )
  VALUES (
    p_user_id,
    p_email,
    'welcome_v1',
    'Welcome to Ghoste One 👻',
    v_payload,
    'queued',
    0
  )
  ON CONFLICT (user_id, template_key)
  WHERE template_key = 'welcome_v1' AND status != 'failed'
  DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION enqueue_welcome_email TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.email_outbox IS 'Queue system for all outbound emails with retry logic';
COMMENT ON TABLE public.automation_events IS 'Event bus for triggering automation sequences';
COMMENT ON COLUMN public.user_profiles.welcome_email_sent_at IS 'Timestamp when welcome email was successfully sent';
