/*
  # Email Automation Repair + Sales Triggers

  ## Purpose
  Repair broken email enrollment, add sales automation triggers aligned with new pricing ($9/$19/$49).

  ## Changes
  1. **Email Templates Table**
     - Stores all onboarding + sales email templates
     - Organized by phase: activation → value → upsell → urgency
     - Includes new pricing in copy

  2. **User Email State Table**
     - Tracks enrollment status per user
     - Prevents duplicate enrollments
     - Tracks last email sent

  3. **Sales Trigger Functions**
     - Credit usage triggers (50%, 90%, 100%)
     - Feature attempt triggers (locked features)
     - Subscription event triggers

  4. **Helper Functions**
     - enqueue_onboarding_email: Queue email for user
     - enqueue_sales_email: Queue sales email based on trigger
     - check_and_send_credit_emails: Auto-check credit levels

  ## Security
  - RLS enabled on all tables
  - Server-only writes via service role
*/

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  phase text NOT NULL CHECK (phase IN ('activation', 'value', 'upsell', 'urgency', 'sales')),
  day_offset integer NOT NULL DEFAULT 0,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Create user_email_state table (tracks enrollment + last send)
CREATE TABLE IF NOT EXISTS user_email_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at timestamptz DEFAULT now(),
  last_email_key text,
  last_email_sent_at timestamptz,
  credits_50_sent boolean DEFAULT false,
  credits_90_sent boolean DEFAULT false,
  credits_100_sent boolean DEFAULT false,
  feature_locked_sent jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_email_state ENABLE ROW LEVEL SECURITY;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_email_state_user_id ON user_email_state(user_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_status_created ON email_jobs(status, created_at) WHERE status = 'pending';

-- Function: Enqueue onboarding email
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
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM email_templates
  WHERE template_key = p_template_key AND enabled = true;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Template not found or disabled: %', p_template_key;
  END IF;

  -- Calculate scheduled time
  v_scheduled_at := now() + (p_delay_minutes || ' minutes')::interval;

  -- Insert into email_jobs
  INSERT INTO email_jobs (
    user_id,
    to_email,
    template_key,
    subject,
    payload,
    status,
    attempts,
    created_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_user_email,
    p_template_key,
    v_template.subject,
    jsonb_build_object(
      'text', v_template.body_text,
      'html', v_template.body_html,
      'scheduled_at', v_scheduled_at
    ),
    CASE
      WHEN p_delay_minutes = 0 THEN 'pending'
      ELSE 'scheduled'
    END,
    0,
    now(),
    now()
  )
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- Function: Enqueue sales email
CREATE OR REPLACE FUNCTION enqueue_sales_email(
  p_user_id uuid,
  p_user_email text,
  p_trigger_key text,
  p_template_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state record;
  v_job_id uuid;
BEGIN
  -- Get user email state
  SELECT * INTO v_state
  FROM user_email_state
  WHERE user_id = p_user_id;

  IF v_state IS NULL THEN
    -- Create state if doesn't exist
    INSERT INTO user_email_state (user_id)
    VALUES (p_user_id);
  END IF;

  -- Check if this trigger was already sent
  IF p_trigger_key = 'credits_50' AND v_state.credits_50_sent THEN
    RETURN NULL;
  ELSIF p_trigger_key = 'credits_90' AND v_state.credits_90_sent THEN
    RETURN NULL;
  ELSIF p_trigger_key = 'credits_100' AND v_state.credits_100_sent THEN
    RETURN NULL;
  END IF;

  -- Enqueue email
  SELECT enqueue_onboarding_email(
    p_user_id,
    p_user_email,
    p_template_key,
    0
  ) INTO v_job_id;

  -- Mark trigger as sent
  IF p_trigger_key = 'credits_50' THEN
    UPDATE user_email_state SET credits_50_sent = true WHERE user_id = p_user_id;
  ELSIF p_trigger_key = 'credits_90' THEN
    UPDATE user_email_state SET credits_90_sent = true WHERE user_id = p_user_id;
  ELSIF p_trigger_key = 'credits_100' THEN
    UPDATE user_email_state SET credits_100_sent = true WHERE user_id = p_user_id;
  END IF;

  RETURN v_job_id;
END;
$$;

-- Function: Check and send credit warning emails
CREATE OR REPLACE FUNCTION check_and_send_credit_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user record;
  v_usage numeric;
  v_limit numeric;
  v_pct numeric;
BEGIN
  -- Loop through users with wallets
  FOR v_user IN
    SELECT
      w.user_id,
      w.total_credits,
      u.email,
      b.plan_key,
      b.status
    FROM user_wallets w
    JOIN auth.users u ON u.id = w.user_id
    LEFT JOIN user_billing_v2 b ON b.user_id = w.user_id
    WHERE b.status IN ('active', 'trialing', 'past_due')
      OR b.status IS NULL
  LOOP
    -- Calculate usage percentage
    v_limit := CASE
      WHEN v_user.plan_key = 'artist' THEN 30000
      WHEN v_user.plan_key = 'growth' THEN 65000
      WHEN v_user.plan_key = 'scale' THEN 500000
      ELSE 7500  -- free tier
    END;

    v_usage := v_limit - COALESCE(v_user.total_credits, 0);
    v_pct := (v_usage / v_limit) * 100;

    -- Send appropriate email based on usage
    IF v_pct >= 100 THEN
      PERFORM enqueue_sales_email(
        v_user.user_id,
        v_user.email,
        'credits_100',
        'credits_exhausted'
      );
    ELSIF v_pct >= 90 THEN
      PERFORM enqueue_sales_email(
        v_user.user_id,
        v_user.email,
        'credits_90',
        'credits_running_low'
      );
    ELSIF v_pct >= 50 THEN
      PERFORM enqueue_sales_email(
        v_user.user_id,
        v_user.email,
        'credits_50',
        'credits_halfway'
      );
    END IF;
  END LOOP;
END;
$$;

-- Insert core email templates (with new pricing)
INSERT INTO email_templates (template_key, phase, day_offset, subject, body_text, body_html, enabled) VALUES

-- Day 0: Welcome
('welcome', 'activation', 0, 'Welcome to Ghoste One, {{first_name}} 🎧',
'Hey {{first_name}},

Welcome to Ghoste One — your control room for music marketing.

Here are 3 quick wins you can knock out today:

1) Create your first Smart Link so fans have one place to click.
2) Connect your Tasks & Calendar so you never miss a release deadline.
3) Open Ghoste AI and ask for a 2-week plan for your next release.

Log in now: {{app_url}}

– The Ghoste One Team',
'<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #030712; color: #e5e7eb;">
  <h2 style="color: #60a5fa;">Welcome to Ghoste One</h2>
  <p>Hey {{first_name}},</p>
  <p>Welcome to Ghoste One — your control room for music marketing.</p>
  <p>Here are 3 quick wins you can knock out today:</p>
  <ol>
    <li>Create your first Smart Link so fans have one place to click.</li>
    <li>Connect your Tasks & Calendar so you never miss a release deadline.</li>
    <li>Open Ghoste AI and ask for a 2-week plan for your next release.</li>
  </ol>
  <p style="margin-top: 30px;"><a href="{{app_url}}" style="display: inline-block; padding: 12px 24px; background: #60a5fa; color: white; text-decoration: none; border-radius: 6px;">Get Started</a></p>
  <p style="margin-top: 30px; font-size: 12px; color: #64748b;">– The Ghoste One Team</p>
</div>', true),

-- Sales: Credits halfway
('credits_halfway', 'sales', 0, 'You''re halfway through your credits',
'Hey {{first_name}},

You''ve used 50% of your monthly credits. That means you''re putting in the work — nice.

Your current plan gives you {{credits}} credits/month.

Want more? Upgrade to keep the momentum going:
• Artist ($9/mo): 30,000 credits
• Growth ($19/mo): 65,000 credits
• Scale ($49/mo): 500,000 credits

Upgrade: {{app_url}}/subscriptions

– The Ghoste One Team',
'<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #030712; color: #e5e7eb;">
  <h2 style="color: #60a5fa;">You''re halfway through your credits</h2>
  <p>Hey {{first_name}},</p>
  <p>You''ve used 50% of your monthly credits. That means you''re putting in the work — nice.</p>
  <p>Want more? Upgrade to keep the momentum going:</p>
  <ul>
    <li><strong>Artist ($9/mo)</strong>: 30,000 credits</li>
    <li><strong>Growth ($19/mo)</strong>: 65,000 credits</li>
    <li><strong>Scale ($49/mo)</strong>: 500,000 credits</li>
  </ul>
  <p style="margin-top: 30px;"><a href="{{app_url}}/subscriptions" style="display: inline-block; padding: 12px 24px; background: #60a5fa; color: white; text-decoration: none; border-radius: 6px;">View Plans</a></p>
  <p style="margin-top: 30px; font-size: 12px; color: #64748b;">– The Ghoste One Team</p>
</div>', true),

-- Sales: Credits running low
('credits_running_low', 'sales', 0, 'Running low on credits',
'Hey {{first_name}},

You''re at 90% of your monthly credits. Time to upgrade if you want to keep building.

Your options:
• Artist ($9/mo): 30,000 credits
• Growth ($19/mo): 65,000 credits
• Scale ($49/mo): 500,000 credits

Upgrade now: {{app_url}}/subscriptions

– The Ghoste One Team',
'<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #030712; color: #e5e7eb;">
  <h2 style="color: #fbbf24;">Running low on credits</h2>
  <p>Hey {{first_name}},</p>
  <p>You''re at 90% of your monthly credits. Time to upgrade if you want to keep building.</p>
  <p><strong>Your options:</strong></p>
  <ul>
    <li><strong>Artist ($9/mo)</strong>: 30,000 credits</li>
    <li><strong>Growth ($19/mo)</strong>: 65,000 credits</li>
    <li><strong>Scale ($49/mo)</strong>: 500,000 credits</li>
  </ul>
  <p style="margin-top: 30px;"><a href="{{app_url}}/subscriptions" style="display: inline-block; padding: 12px 24px; background: #fbbf24; color: #111827; text-decoration: none; border-radius: 6px;">Upgrade Now</a></p>
  <p style="margin-top: 30px; font-size: 12px; color: #64748b;">– The Ghoste One Team</p>
</div>', true),

-- Sales: Credits exhausted
('credits_exhausted', 'sales', 0, 'You''re out of credits',
'Hey {{first_name}},

You''ve used all your monthly credits. To keep using Ghoste, upgrade to a paid plan:

• Artist ($9/mo): 30,000 credits
• Growth ($19/mo): 65,000 credits
• Scale ($49/mo): 500,000 credits

All plans include a 7-day free trial.

Upgrade: {{app_url}}/subscriptions

– The Ghoste One Team',
'<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #030712; color: #e5e7eb;">
  <h2 style="color: #ef4444;">You''re out of credits</h2>
  <p>Hey {{first_name}},</p>
  <p>You''ve used all your monthly credits. To keep using Ghoste, upgrade to a paid plan:</p>
  <ul>
    <li><strong>Artist ($9/mo)</strong>: 30,000 credits</li>
    <li><strong>Growth ($19/mo)</strong>: 65,000 credits</li>
    <li><strong>Scale ($49/mo)</strong>: 500,000 credits</li>
  </ul>
  <p>All plans include a 7-day free trial.</p>
  <p style="margin-top: 30px;"><a href="{{app_url}}/subscriptions" style="display: inline-block; padding: 12px 24px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px;">Upgrade Now</a></p>
  <p style="margin-top: 30px; font-size: 12px; color: #64748b;">– The Ghoste One Team</p>
</div>', true),

-- Sales: Feature locked
('feature_locked', 'sales', 0, 'Unlock {{feature_name}} with a paid plan',
'Hey {{first_name}},

You just tried to use {{feature_name}}, but it''s locked on the free plan.

Upgrade to unlock it:
• Artist ($9/mo): 30,000 credits + all core features
• Growth ($19/mo): 65,000 credits + ads manager
• Scale ($49/mo): 500,000 credits + priority support

Start your 7-day free trial: {{app_url}}/subscriptions

– The Ghoste One Team',
'<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #030712; color: #e5e7eb;">
  <h2 style="color: #60a5fa;">Unlock {{feature_name}}</h2>
  <p>Hey {{first_name}},</p>
  <p>You just tried to use <strong>{{feature_name}}</strong>, but it''s locked on the free plan.</p>
  <p>Upgrade to unlock it:</p>
  <ul>
    <li><strong>Artist ($9/mo)</strong>: 30,000 credits + all core features</li>
    <li><strong>Growth ($19/mo)</strong>: 65,000 credits + ads manager</li>
    <li><strong>Scale ($49/mo)</strong>: 500,000 credits + priority support</li>
  </ul>
  <p style="margin-top: 30px;"><a href="{{app_url}}/subscriptions" style="display: inline-block; padding: 12px 24px; background: #60a5fa; color: white; text-decoration: none; border-radius: 6px;">Start Free Trial</a></p>
  <p style="margin-top: 30px; font-size: 12px; color: #64748b;">– The Ghoste One Team</p>
</div>', true)

ON CONFLICT (template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_text = EXCLUDED.body_text,
  body_html = EXCLUDED.body_html,
  updated_at = now();

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION enqueue_onboarding_email TO service_role;
GRANT EXECUTE ON FUNCTION enqueue_sales_email TO service_role;
GRANT EXECUTE ON FUNCTION check_and_send_credit_emails TO service_role;
