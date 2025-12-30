/*
  # Fix Welcome Email CTA Button and Variable Rendering

  ## Purpose
  Fix welcome email to ensure:
  1. CTA button is clickable with proper attributes for all email clients
  2. Variables like {{first_name}} always render (never show as raw {{...}})
  3. Subject has no variables (static for reliability)

  ## Changes
  1. Update welcome template HTML to have:
     - target="_blank" and rel="noopener noreferrer" on all CTA links
     - Proper inline styles for Gmail mobile compatibility
     - Full absolute URLs (not relative)
  
  2. Update welcome template text to include URLs as fallback
  
  3. Update enqueue_onboarding_email to build payload with:
     - first_name (with fallbacks)
     - app_url
     - user_id
*/

-- Update welcome email template with clickable buttons
UPDATE email_templates
SET 
  subject = 'Welcome to Ghoste One 👻',
  body_text = 'Hey {{first_name}},

Welcome to Ghoste One — your control room for music marketing.

Here are 3 quick wins you can knock out today:

1) Create your first Smart Link so fans have one place to click.
2) Connect your Tasks & Calendar so you never miss a release deadline.
3) Open Ghoste AI and ask for a 2-week plan for your next release.

Get Started: https://ghoste.one/studio/getting-started

– The Ghoste One Team',
  body_html = '<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:14px;padding:28px;border:1px solid #e9edf5;">
        <h1 style="margin:0 0 12px 0;font-size:28px;line-height:1.2;color:#1b2b4a;">
          Welcome to Ghoste One 👻
        </h1>

        <p style="margin:0 0 14px 0;font-size:16px;color:#2c3e55;">
          Hey <strong>{{first_name}}</strong>,
        </p>

        <p style="margin:0 0 16px 0;font-size:16px;color:#2c3e55;">
          Welcome to Ghoste One — your control room for music marketing.
        </p>

        <p style="margin:0 0 10px 0;font-size:16px;color:#2c3e55;">
          Here are 3 quick wins you can knock out today:
        </p>

        <ol style="margin:0 0 18px 18px;padding:0;color:#2c3e55;font-size:16px;">
          <li style="margin:0 0 8px 0;">Create your first Smart Link so fans have one place to click.</li>
          <li style="margin:0 0 8px 0;">Connect your Tasks &amp; Calendar so you never miss a release deadline.</li>
          <li style="margin:0 0 8px 0;">Open Ghoste AI and ask for a 2-week plan for your next release.</li>
        </ol>

        <!-- CLICKABLE BUTTON with all required attributes -->
        <a href="https://ghoste.one/studio/getting-started"
           target="_blank"
           rel="noopener noreferrer"
           style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:16px;">
          Get Started
        </a>

        <p style="margin:18px 0 0 0;font-size:13px;color:#6b7a90;">
          — The Ghoste One Team
        </p>
      </div>
    </div>
  </body>
</html>
',
  updated_at = now()
WHERE template_key = 'welcome';

-- Update enqueue_onboarding_email to include first_name and app_url in payload
CREATE OR REPLACE FUNCTION enqueue_onboarding_email(
  p_user_id uuid,
  p_user_email text,
  p_template_key text,
  p_delay_minutes integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template record;
  v_job_id uuid;
  v_scheduled_at timestamptz;
  v_user_profile record;
  v_first_name text;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM email_templates
  WHERE template_key = p_template_key AND enabled = true;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Template not found or disabled: %', p_template_key;
  END IF;

  -- Get user profile for first_name
  SELECT first_name, display_name, full_name INTO v_user_profile
  FROM user_profiles
  WHERE user_id = p_user_id;

  -- Build first_name with fallbacks
  v_first_name := COALESCE(
    v_user_profile.first_name,
    v_user_profile.display_name,
    v_user_profile.full_name,
    SPLIT_PART(p_user_email, '@', 1),
    'there'
  );

  -- Calculate scheduled time
  v_scheduled_at := now() + (p_delay_minutes || ' minutes')::interval;

  -- Insert into email_jobs with proper payload
  INSERT INTO email_jobs (
    user_id,
    to_email,
    template_key,
    subject,
    payload,
    status,
    attempts,
    send_after,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_user_email,
    p_template_key,
    v_template.subject,
    jsonb_build_object(
      'first_name', v_first_name,
      'app_url', 'https://ghoste.one',
      'user_id', p_user_id::text,
      'email', p_user_email
    ),
    CASE
      WHEN p_delay_minutes = 0 THEN 'pending'
      ELSE 'queued'
    END,
    0,
    CASE
      WHEN p_delay_minutes > 0 THEN v_scheduled_at
      ELSE NULL
    END,
    now(),
    now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION enqueue_onboarding_email TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_onboarding_email TO authenticated;

COMMENT ON FUNCTION enqueue_onboarding_email IS 'Enqueues onboarding emails with proper payload including first_name and app_url';
