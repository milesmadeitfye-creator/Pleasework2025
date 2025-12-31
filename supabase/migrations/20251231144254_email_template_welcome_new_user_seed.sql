/*
  # Seed welcome_new_user Email Template

  1. Changes
    - Insert welcome_new_user template if not exists
    - Provides fallback for trigger-based welcome emails

  2. Notes
    - Template uses variable replacement: {{first_name}}, {{cta_url}}
    - Enabled by default
    - Uses 'activation' phase (closest to onboarding)
*/

-- Insert welcome_new_user template if not exists
INSERT INTO public.email_templates (
  template_key,
  subject,
  body_text,
  body_html,
  enabled,
  category,
  phase,
  day_offset
)
VALUES (
  'welcome_new_user',
  'Welcome to Ghoste, {{first_name}}! 🎵',
  'Hey {{first_name}},

Welcome to Ghoste One! We''re excited to have you here.

Ghoste is your all-in-one platform for music marketing. Here''s what you can do:

• Create Smart Links for your releases
• Launch ad campaigns with AI assistance
• Track your analytics in real-time
• Connect with your fans

Ready to get started? Log in to your dashboard and explore the platform.

{{cta_url}}

If you have any questions, just reply to this email.

Cheers,
The Ghoste Team',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      color: #111827;
      font-size: 24px;
      margin-bottom: 16px;
    }
    p {
      margin-bottom: 16px;
      color: #4b5563;
    }
    ul {
      margin: 16px 0;
      padding-left: 20px;
      color: #4b5563;
    }
    li {
      margin-bottom: 8px;
    }
    .cta {
      display: inline-block;
      padding: 12px 24px;
      background: #4F46E5;
      color: white;
      border-radius: 6px;
      text-decoration: none;
      margin-top: 16px;
      font-weight: 500;
    }
    .cta:hover {
      background: #4338CA;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to Ghoste, {{first_name}}! 🎵</h1>
    
    <p>We''re excited to have you here.</p>
    
    <p>Ghoste is your all-in-one platform for music marketing. Here''s what you can do:</p>
    
    <ul>
      <li>Create Smart Links for your releases</li>
      <li>Launch ad campaigns with AI assistance</li>
      <li>Track your analytics in real-time</li>
      <li>Connect with your fans</li>
    </ul>
    
    <p>Ready to get started? Log in to your dashboard and explore the platform.</p>
    
    <a href="{{cta_url}}" class="cta">Go to Dashboard</a>
    
    <div class="footer">
      <p>If you have any questions, just reply to this email.</p>
      <p>Cheers,<br>The Ghoste Team</p>
    </div>
  </div>
</body>
</html>',
  true,
  'onboarding',
  'activation',
  0
)
ON CONFLICT (template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_text = EXCLUDED.body_text,
  body_html = EXCLUDED.body_html,
  enabled = EXCLUDED.enabled,
  category = EXCLUDED.category,
  phase = EXCLUDED.phase,
  updated_at = now();

COMMENT ON TABLE public.email_templates IS 'Email templates for both static and trigger-based emails. New trigger-based emails can use AI generation with prompts in email_jobs.payload.';