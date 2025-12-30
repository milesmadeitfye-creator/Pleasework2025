/*
  # Email Decider System

  ## Purpose
  Implement smart email template selection that:
  - Tracks all emails sent to users
  - Picks next template per user without duplicates
  - Prevents email fatigue

  ## Changes
  1. **Email Templates Enhancement**
     - Add `category` column for grouping templates
     - Categories: onboarding, engagement, sales, reactivation

  2. **User Email Sends Table**
     - Tracks every email sent to each user
     - Records provider_message_id, status, error
     - Unique constraint prevents duplicate sends

  3. **Pick Next Email Template RPC**
     - Returns next template_key + category for a user
     - Skips templates already sent
     - Returns NULL if all templates exhausted

  ## Security
  - RLS enabled on all tables
  - Service role required for sending operations
*/

-- Add category column to email_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE public.email_templates
    ADD COLUMN category text DEFAULT 'onboarding'
    CHECK (category IN ('onboarding', 'engagement', 'sales', 'reactivation', 'welcome'));
  END IF;
END $$;

-- Update existing templates to have proper categories based on phase
UPDATE public.email_templates
SET category = CASE
  WHEN phase = 'activation' THEN 'onboarding'
  WHEN phase = 'value' THEN 'engagement'
  WHEN phase IN ('upsell', 'urgency') THEN 'sales'
  WHEN phase = 'sales' THEN 'sales'
  ELSE 'onboarding'
END
WHERE category IS NULL OR category = 'onboarding';

-- Set welcome template category
UPDATE public.email_templates
SET category = 'welcome'
WHERE template_key LIKE 'welcome%' OR template_key = 'welcome_v1';

-- Create user_email_sends table (tracks all sent emails)
CREATE TABLE IF NOT EXISTS public.user_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  category text NOT NULL,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'bounced')),
  error_message text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_email_sends ENABLE ROW LEVEL SECURITY;

-- Create unique constraint to prevent duplicate sends
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_sends_unique
  ON public.user_email_sends(user_id, template_key)
  WHERE status = 'sent';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_email_sends_user_id
  ON public.user_email_sends(user_id);

CREATE INDEX IF NOT EXISTS idx_user_email_sends_category
  ON public.user_email_sends(category);

CREATE INDEX IF NOT EXISTS idx_user_email_sends_sent_at
  ON public.user_email_sends(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_email_sends_template_key
  ON public.user_email_sends(template_key);

-- RLS Policies for user_email_sends
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_email_sends'
      AND policyname = 'Service role can manage user email sends'
  ) THEN
    CREATE POLICY "Service role can manage user email sends"
      ON public.user_email_sends
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_email_sends'
      AND policyname = 'Users can view own email sends'
  ) THEN
    CREATE POLICY "Users can view own email sends"
      ON public.user_email_sends
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Drop existing function if signature changed
DROP FUNCTION IF EXISTS public.pick_next_email_template(uuid);

-- Function: Pick next email template for a user
CREATE OR REPLACE FUNCTION public.pick_next_email_template(p_user_id uuid)
RETURNS TABLE (
  template_key text,
  category text,
  subject text,
  body_text text,
  body_html text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  -- Find next template not yet sent to this user
  -- Prioritize by category order: welcome > onboarding > engagement > sales > reactivation
  SELECT
    t.template_key,
    t.category,
    t.subject,
    t.body_text,
    t.body_html
  INTO v_result
  FROM email_templates t
  WHERE t.enabled = true
    AND NOT EXISTS (
      SELECT 1
      FROM user_email_sends ues
      WHERE ues.user_id = p_user_id
        AND ues.template_key = t.template_key
        AND ues.status = 'sent'
    )
  ORDER BY
    CASE t.category
      WHEN 'welcome' THEN 1
      WHEN 'onboarding' THEN 2
      WHEN 'engagement' THEN 3
      WHEN 'sales' THEN 4
      WHEN 'reactivation' THEN 5
      ELSE 6
    END,
    t.day_offset ASC,
    t.created_at ASC
  LIMIT 1;

  -- Return the result (will be NULL if no templates available)
  IF v_result IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_result.template_key,
      v_result.category,
      v_result.subject,
      v_result.body_text,
      v_result.body_html;
  ELSE
    -- No templates available
    RETURN;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.pick_next_email_template TO service_role;
GRANT EXECUTE ON FUNCTION public.pick_next_email_template TO authenticated;

-- Drop old run_email_decider function
DROP FUNCTION IF EXISTS public.run_email_decider(timestamptz);

-- Function: Run email decider for all active users (called by scheduler)
CREATE OR REPLACE FUNCTION public.run_email_decider()
RETURNS TABLE (
  users_processed integer,
  jobs_created integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_template record;
  v_users_processed integer := 0;
  v_jobs_created integer := 0;
BEGIN
  -- Find active users who:
  -- 1. Have welcome email sent (enrolled in automation)
  -- 2. Haven't received an email in the last 24 hours
  -- 3. Have a valid email address
  FOR v_user IN
    SELECT DISTINCT
      u.id as user_id,
      u.email,
      up.first_name,
      up.display_name
    FROM auth.users u
    LEFT JOIN user_profiles up ON up.id = u.id
    LEFT JOIN user_email_sends ues ON ues.user_id = u.id
    WHERE u.email IS NOT NULL
      AND up.welcome_email_sent_at IS NOT NULL
      AND (
        ues.sent_at IS NULL
        OR ues.sent_at < now() - interval '24 hours'
      )
    GROUP BY u.id, u.email, up.first_name, up.display_name
    HAVING MAX(ues.sent_at) IS NULL OR MAX(ues.sent_at) < now() - interval '24 hours'
    LIMIT 100
  LOOP
    v_users_processed := v_users_processed + 1;

    -- Pick next template for this user
    SELECT * INTO v_template
    FROM pick_next_email_template(v_user.user_id);

    IF v_template IS NOT NULL THEN
      -- Create email job
      INSERT INTO email_jobs (
        user_id,
        to_email,
        template_key,
        subject,
        payload,
        status,
        attempts
      )
      VALUES (
        v_user.user_id,
        v_user.email,
        v_template.template_key,
        v_template.subject,
        jsonb_build_object(
          'first_name', COALESCE(v_user.first_name, v_user.display_name, 'there'),
          'category', v_template.category
        ),
        'pending',
        0
      )
      ON CONFLICT DO NOTHING;

      v_jobs_created := v_jobs_created + 1;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT v_users_processed, v_jobs_created;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.run_email_decider TO service_role;

-- Add helpful comments
COMMENT ON TABLE public.user_email_sends IS 'Tracks all emails sent to users with provider details';
COMMENT ON FUNCTION public.pick_next_email_template IS 'Returns next email template for user without duplicates';
COMMENT ON FUNCTION public.run_email_decider IS 'Scheduled function to queue emails for active users';
COMMENT ON COLUMN public.email_templates.category IS 'Template category for organization and prioritization';
