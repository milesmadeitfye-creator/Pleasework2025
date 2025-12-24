/**
 * Comprehensive Email Scheduler V2
 * Processes the email_queue table and sends emails via Mailgun
 *
 * Handles:
 * - Scheduled onboarding emails with Ghoste branding
 * - Retry logic (up to 3 attempts)
 * - Logging to email_sends table
 * - Uses FROM_EMAIL environment variable
 * - Uses ghosteBaseTemplate for consistent branding
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { renderGhosteServiceEmail } from '../../src/utils/serviceEmailTemplate';

const DEBUG_VERSION = 'email-scheduler-v2.1.0';
const ENVIRONMENT = process.env.CONTEXT || process.env.NODE_ENV || 'unknown';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_REGION = (process.env.MAILGUN_REGION || 'us').toLowerCase();
const FROM_EMAIL = process.env.FROM_EMAIL || 'Ghoste One <noreply@ghoste.one>';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://ghoste.one';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

function validateConfig(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!MAILGUN_API_KEY) missing.push('MAILGUN_API_KEY');
  if (!MAILGUN_DOMAIN) missing.push('MAILGUN_DOMAIN');
  if (!FROM_EMAIL) missing.push('FROM_EMAIL');

  return { ok: missing.length === 0, missing };
}

const configCheck = validateConfig();
if (!configCheck.ok) {
  console.error('[email-scheduler-v2] CRITICAL: Missing environment variables:', configCheck.missing);
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const mailgun = new Mailgun(formData);
const mg = MAILGUN_API_KEY
  ? mailgun.client({
      username: 'api',
      key: MAILGUN_API_KEY,
      url: MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
    })
  : null;

interface EmailQueueItem {
  id: string;
  user_id: string | null;
  to_email: string;
  subject: string;
  template_key: string;
  template_id: string | null;
  payload: Record<string, any>;
  scheduled_at: string;
  retry_count: number;
  max_retries: number;
}

/**
 * Enhanced Ghoste Onboarding Email Template
 * Inline version for use in Netlify functions
 */
function buildGhosteOnboardingEmailHtml(input: {
  subject: string;
  firstName?: string | null;
  tagline?: string | null;
  headline?: string | null;
  introText?: string | null;
  stepsLabel?: string | null;
  step1Title?: string | null;
  step1Body?: string | null;
  step2Title?: string | null;
  step2Body?: string | null;
  step3Title?: string | null;
  step3Body?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  secondaryText?: string | null;
  manageNotificationsUrl?: string | null;
  unsubscribeUrl?: string | null;
  year?: string | null;
}): { html: string; text: string } {
  // Set defaults
  const firstName = input.firstName || 'there';
  const tagline = input.tagline || 'Artist Marketing OS';
  const headline = input.headline || input.subject;
  const introText = input.introText || '';
  const stepsLabel = input.stepsLabel || 'Your next 3 moves';
  const ctaLabel = input.ctaLabel || 'Open Ghoste One';
  const ctaUrl = input.ctaUrl || `${APP_BASE_URL}/dashboard`;
  const secondaryText = input.secondaryText || 'Pro tip: take one small action right after reading this email so Ghoste can start working for you.';
  const manageNotificationsUrl = input.manageNotificationsUrl || `${APP_BASE_URL}/account/notifications`;
  const unsubscribeUrl = input.unsubscribeUrl || `${APP_BASE_URL}/unsubscribe`;
  const year = input.year || String(new Date().getFullYear());

  // Build step sections
  const step1Html = (input.step1Title || input.step1Body) ? `
                      <tr>
                        <td valign="top" width="22" style="font-size:14px; color:#8f9bff; padding-top:4px;">1.</td>
                        <td style="padding-bottom:10px;">
                          <div style="color:#ffffff; font-size:14px; font-weight:600; margin-bottom:2px;">${input.step1Title || ''}</div>
                          <div style="color:#c7d0ff; font-size:13px; line-height:1.5;">${input.step1Body || ''}</div>
                        </td>
                      </tr>` : '';

  const step2Html = (input.step2Title || input.step2Body) ? `
                      <tr>
                        <td valign="top" width="22" style="font-size:14px; color:#8f9bff; padding-top:4px;">2.</td>
                        <td style="padding-bottom:10px;">
                          <div style="color:#ffffff; font-size:14px; font-weight:600; margin-bottom:2px;">${input.step2Title || ''}</div>
                          <div style="color:#c7d0ff; font-size:13px; line-height:1.5;">${input.step2Body || ''}</div>
                        </td>
                      </tr>` : '';

  const step3Html = (input.step3Title || input.step3Body) ? `
                      <tr>
                        <td valign="top" width="22" style="font-size:14px; color:#8f9bff; padding-top:4px;">3.</td>
                        <td>
                          <div style="color:#ffffff; font-size:14px; font-weight:600; margin-bottom:2px;">${input.step3Title || ''}</div>
                          <div style="color:#c7d0ff; font-size:13px; line-height:1.5;">${input.step3Body || ''}</div>
                        </td>
                      </tr>` : '';

  const hasSteps = step1Html || step2Html || step3Html;

  // Build HTML email
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${input.subject}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:#050815; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#050815">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="width:600px; max-width:100%; border-radius:24px; overflow:hidden; background:radial-gradient(circle at top left,#543cff,#050815); box-shadow:0 18px 45px rgba(0,0,0,0.55);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:20px 24px 0 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="color:#ffffff; font-size:18px; font-weight:600;">
                    Ghoste <span style="color:#8b5bff;">One</span>
                  </td>
                  <td align="right" style="color:#9aa4ff; font-size:11px; text-transform:uppercase; letter-spacing:1.4px;">
                    ${tagline}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Hero / title -->
          <tr>
            <td align="left" style="padding:24px 32px 8px 32px;">
              <div style="color:#9aa4ff; font-size:12px; text-transform:uppercase; letter-spacing:1.6px; margin-bottom:6px;">
                Hey ${firstName} 👋
              </div>
              <div style="color:#ffffff; font-size:24px; line-height:1.3; font-weight:700; margin-bottom:12px;">
                ${headline}
              </div>
              ${introText ? `<div style="color:#c7d0ff; font-size:14px; line-height:1.6; margin-bottom:18px;">
                ${introText}
              </div>` : ''}
            </td>
          </tr>
          <!-- Steps block -->
          ${hasSteps ? `<tr>
            <td align="left" style="padding:0 32px 8px 32px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-radius:18px; background-color:rgba(5,12,40,0.92); border:1px solid rgba(140,151,255,0.3);">
                <tr>
                  <td style="padding:18px 20px 6px 20px; color:#9aa4ff; font-size:12px; text-transform:uppercase; letter-spacing:1.4px; font-weight:600;">
                    ${stepsLabel}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 20px 18px 20px;">
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      ${step1Html}
                      ${step2Html}
                      ${step3Html}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}
          <!-- CTA button -->
          <tr>
            <td align="left" style="padding:18px 32px 4px 32px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" bgcolor="#8b5bff" style="border-radius:999px;">
                    <a href="${ctaUrl}" style="display:inline-block; padding:12px 26px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Secondary text -->
          <tr>
            <td align="left" style="padding:4px 32px 24px 32px;">
              <div style="color:#7e87c9; font-size:12px; line-height:1.6;">
                ${secondaryText}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:14px 24px 22px 24px; border-top:1px solid rgba(115,130,220,0.25);">
              <div style="color:#6f789f; font-size:11px; line-height:1.6;">
                You're receiving this because you created an account on <span style="color:#a9b3ff;">Ghoste One</span>.<br/>
                <a href="${manageNotificationsUrl}" style="color:#9aa4ff; text-decoration:none;">Manage notifications</a> ·
                <a href="${unsubscribeUrl}" style="color:#9aa4ff; text-decoration:none;">Unsubscribe</a>
              </div>
              <div style="color:#4e577c; font-size:10px; padding-top:8px;">
                © ${year} Ghoste Media LLC. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Build plain text version
  const textParts: string[] = [
    `GHOSTE ONE - ${tagline}`,
    '',
    `Hey ${firstName} 👋`,
    '',
    headline,
    '',
  ];

  if (introText) {
    textParts.push(introText);
    textParts.push('');
  }

  if (hasSteps) {
    textParts.push(stepsLabel);
    textParts.push('');

    if (input.step1Title || input.step1Body) {
      textParts.push(`1. ${input.step1Title || ''}`);
      if (input.step1Body) textParts.push(`   ${input.step1Body}`);
      textParts.push('');
    }

    if (input.step2Title || input.step2Body) {
      textParts.push(`2. ${input.step2Title || ''}`);
      if (input.step2Body) textParts.push(`   ${input.step2Body}`);
      textParts.push('');
    }

    if (input.step3Title || input.step3Body) {
      textParts.push(`3. ${input.step3Title || ''}`);
      if (input.step3Body) textParts.push(`   ${input.step3Body}`);
      textParts.push('');
    }
  }

  textParts.push(`>>> ${ctaLabel}`);
  textParts.push(ctaUrl);
  textParts.push('');
  textParts.push(secondaryText);
  textParts.push('');
  textParts.push('---');
  textParts.push(`You're receiving this because you created an account on Ghoste One.`);
  textParts.push(`Manage notifications: ${manageNotificationsUrl}`);
  textParts.push(`Unsubscribe: ${unsubscribeUrl}`);
  textParts.push('');
  textParts.push(`© ${year} Ghoste Media LLC. All rights reserved.`);

  const text = textParts.join('\n');

  return { html, text };
}

async function sendEmail(item: EmailQueueItem): Promise<{ success: boolean; mailgunId?: string; error?: string }> {
  const startTime = Date.now();

  console.log('[email-scheduler-v2] 📧 send_email_called', {
    to: maskEmail(item.to_email),
    subject: item.subject,
    template_key: item.template_key,
    queue_id: item.id,
    debug_version: DEBUG_VERSION,
  });

  if (!supabase) {
    const error = 'Supabase not configured';
    console.error('[email-scheduler-v2] ❌ send_failed', { error, debug_version: DEBUG_VERSION });
    throw new Error(error);
  }

  if (!mg || !MAILGUN_DOMAIN) {
    const error = 'Mailgun not configured';
    console.error('[email-scheduler-v2] ❌ send_failed', { error, debug_version: DEBUG_VERSION });
    throw new Error(error);
  }

  try {
    console.log('[email-scheduler-v2] 🔍 template_lookup_started', { template_key: item.template_key });

    let htmlBody = '';
    let textBody = '';

    // Try to find matching onboarding_emails record by slug
    const slug = item.template_key.replace(/_(0|[1-9]\d*)$/, ''); // Remove trailing numbers like _0, _1, etc.

    const { data: onboardingEmail } = await supabase
      .from('onboarding_emails')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    console.log('[email-scheduler-v2] 📄 template_found', { found: !!onboardingEmail, slug });

    if (onboardingEmail) {
      // Fetch user profile for personalization
      let firstName: string | null = null;
      if (item.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, full_name, email')
          .eq('id', item.user_id)
          .maybeSingle();

        if (profile) {
          firstName = profile.first_name || profile.full_name?.split(' ')[0] || profile.email?.split('@')[0] || null;
        }
      }

      // Ensure CTA URL is always present (from DB or default)
      const defaultCtaUrl = `${APP_BASE_URL}/dashboard`;
      const ctaUrl = onboardingEmail.cta_url || defaultCtaUrl;

      // Use the Ghoste service email template (for system emails from noreply@ghoste.one)
      htmlBody = renderGhosteServiceEmail({
        headline: onboardingEmail.headline || item.subject,
        bodyHtml: onboardingEmail.body_html || `<p>${item.subject}</p>`,
        ctaLabel: onboardingEmail.cta_label || 'Open Ghoste One',
        ctaUrl,
        managePrefsUrl: `${APP_BASE_URL}/account/notifications`,
        unsubscribeUrl: `${APP_BASE_URL}/unsubscribe`,
        firstName,
      });

      // Simple plain text version
      textBody = `${onboardingEmail.headline || item.subject}\n\nHey ${firstName || 'there'},\n\n${(onboardingEmail.body_html || '').replace(/<[^>]*>/g, '')}\n\n${ctaUrl}\n\nGhoste One`;
    } else if (item.template_id) {
      // Fallback to old email_templates table
      const { data: template } = await supabase
        .from('email_templates')
        .select('html_body')
        .eq('id', item.template_id)
        .maybeSingle();

      if (template) {
        htmlBody = template.html_body;
        for (const [key, value] of Object.entries(item.payload || {})) {
          htmlBody = htmlBody.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
        }
        textBody = htmlBody.replace(/<[^>]*>/g, ''); // Strip HTML tags for plain text
      }
    }

    // Ensure we have fallback content
    if (!htmlBody) {
      htmlBody = item.subject;
      textBody = item.subject;
    }

    // Send via Mailgun with both HTML and text
    console.log('[email-scheduler-v2] 📮 mailgun_send_starting', {
      to: maskEmail(item.to_email),
      from: FROM_EMAIL,
      domain: MAILGUN_DOMAIN,
      region: MAILGUN_REGION,
      has_html: !!htmlBody,
      has_text: !!textBody,
    });

    const mailgunResponse = await mg.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to: item.to_email,
      subject: item.subject,
      html: htmlBody,
      text: textBody || htmlBody.replace(/<[^>]*>/g, ''),
    });

    const elapsed = Date.now() - startTime;
    const mailgunId = mailgunResponse?.id || 'unknown';

    console.log('[email-scheduler-v2] ✅ email_sent_successfully', {
      to: maskEmail(item.to_email),
      subject: item.subject,
      mailgun_id: mailgunId,
      elapsed_ms: elapsed,
      debug_version: DEBUG_VERSION,
    });

    // Mark as sent in queue
    await supabase
      .from('email_queue')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', item.id);

    // Log to email_sends
    await supabase.from('email_sends').insert({
      user_id: item.user_id,
      template_id: item.template_id,
      sent_at: new Date().toISOString(),
      status: 'sent',
    });

    return { success: true, mailgunId };

  } catch (error: any) {
    const elapsed = Date.now() - startTime;

    console.error('[email-scheduler-v2] ❌ send_failed', {
      to: maskEmail(item.to_email),
      subject: item.subject,
      error_message: error.message || String(error),
      error_status: error.status,
      elapsed_ms: elapsed,
      debug_version: DEBUG_VERSION,
    });

    // Increment retry count
    const newRetryCount = item.retry_count + 1;

    if (newRetryCount >= item.max_retries) {
      // Max retries reached, mark as failed
      await supabase
        .from('email_queue')
        .update({
          error: error.message || String(error),
          retry_count: newRetryCount,
        })
        .eq('id', item.id);

      // Log failure
      await supabase.from('email_sends').insert({
        user_id: item.user_id,
        template_id: item.template_id,
        sent_at: new Date().toISOString(),
        status: 'failed',
        error_message: error.message || String(error),
      });
    } else {
      // Schedule retry
      await supabase
        .from('email_queue')
        .update({
          retry_count: newRetryCount,
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Retry in 1 hour
        })
        .eq('id', item.id);
    }

    throw error;
  }
}

export const handler: Handler = async (event) => {
  const isDebug = event.queryStringParameters?.debug === '1';
  const timestamp = new Date().toISOString();

  console.log('[email-scheduler-v2] 🚀 scheduler_started', {
    debug_version: DEBUG_VERSION,
    environment: ENVIRONMENT,
    timestamp,
    debug_mode: isDebug,
  });

  const diagnostics = {
    debug_version: DEBUG_VERSION,
    environment: ENVIRONMENT,
    timestamp,
    config: {
      has_mailgun_key: !!MAILGUN_API_KEY,
      has_domain: !!MAILGUN_DOMAIN,
      domain: MAILGUN_DOMAIN || 'NOT_SET',
      from: FROM_EMAIL || 'NOT_SET',
      region: MAILGUN_REGION,
      has_supabase: !!supabase,
    },
  };

  if (!configCheck.ok) {
    console.error('[email-scheduler-v2] ❌ config_missing', {
      missing: configCheck.missing,
      debug_version: DEBUG_VERSION,
    });

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'MAILGUN_CONFIG_MISSING',
        missing: configCheck.missing,
        message: 'Mailgun environment variables not configured',
        ...diagnostics,
      }),
    };
  }

  if (!supabase) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'SUPABASE_NOT_CONFIGURED',
        ...diagnostics,
      }),
    };
  }

  try {
    const now = new Date().toISOString();

    // Get all due emails that haven't been sent yet
    const { data: dueEmails, error } = await supabase
      .from('email_queue')
      .select('*')
      .is('sent_at', null)
      .lte('scheduled_at', now)
      .lt('retry_count', supabase.raw('max_retries'))
      .order('scheduled_at', { ascending: true })
      .limit(100);

    if (error) {
      console.error('[email-scheduler-v2] Error fetching emails:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch emails' }),
      };
    }

    console.log(`[email-scheduler-v2] Found ${dueEmails?.length || 0} due emails`);

    let sent = 0;
    let failed = 0;

    for (const email of dueEmails || []) {
      try {
        await sendEmail(email as EmailQueueItem);
        sent++;
      } catch (err) {
        failed++;
      }
    }

    const result = {
      success: true,
      processed: dueEmails?.length || 0,
      sent,
      failed,
      ...(isDebug ? diagnostics : {}),
    };

    console.log('[email-scheduler-v2] ✨ scheduler_completed', result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[email-scheduler-v2] 💥 scheduler_fatal_error', {
      error_message: error.message || String(error),
      error_stack: error.stack,
      debug_version: DEBUG_VERSION,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'SCHEDULER_FAILED',
        message: error.message || 'Unknown error',
        ...(isDebug ? diagnostics : {}),
      }),
    };
  }
};
