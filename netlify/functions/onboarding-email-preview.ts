/**
 * Onboarding Email Preview
 * Renders onboarding emails with Ghoste branding for preview purposes
 * Does NOT send emails - only generates HTML for browser viewing
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://ghoste.one';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Enhanced Ghoste Onboarding Email Template
 * (Same as in email-scheduler-v2.ts)
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
          <tr>
            <td align="left" style="padding:4px 32px 24px 32px;">
              <div style="color:#7e87c9; font-size:12px; line-height:1.6;">
                ${secondaryText}
              </div>
            </td>
          </tr>
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

function errorPage(message: string, code: number): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Email Preview</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #020617;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .error-box {
      max-width: 500px;
      padding: 32px;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      text-align: center;
    }
    h1 {
      margin: 0 0 16px;
      color: #ef4444;
      font-size: 48px;
    }
    p {
      margin: 0;
      font-size: 16px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="error-box">
    <h1>${code}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export const handler: Handler = async (event) => {
  console.log('[onboarding-email-preview] Preview requested');

  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('Method not allowed', 405),
      };
    }

    const params = event.queryStringParameters || {};
    const stepParam = params.step;
    const userId = params.userId;

    if (!stepParam) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('Missing required parameter: step (1-20)', 400),
      };
    }

    const step = parseInt(stepParam, 10);

    if (isNaN(step) || step < 1 || step > 20) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('Invalid step number. Must be between 1 and 20.', 400),
      };
    }

    console.log(`[onboarding-email-preview] Fetching email for step ${step}`);

    // Fetch onboarding email definition
    const { data: emailDef, error: emailError } = await supabase
      .from('onboarding_emails')
      .select('*')
      .eq('step_number', step)
      .maybeSingle();

    if (emailError) {
      console.error('[onboarding-email-preview] Database error:', emailError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage('Database error fetching email template', 500),
      };
    }

    if (!emailDef) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: errorPage(`No onboarding email found for step ${step}`, 404),
      };
    }

    console.log(`[onboarding-email-preview] Found email: ${emailDef.slug}`);

    // Fetch user profile for personalization if userId provided
    let firstName: string | null = null;
    if (userId) {
      console.log(`[onboarding-email-preview] Fetching user data for ${userId}`);

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, first_name')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        firstName = profile.first_name || profile.full_name?.split(' ')[0] || profile.email?.split('@')[0] || null;
        console.log(`[onboarding-email-preview] Personalized for ${profile.email}`);
      } else {
        console.log(`[onboarding-email-preview] User ${userId} not found, using generic preview`);
      }
    }

    // Ensure CTA URL is always present (from DB or default)
    const defaultCtaUrl = `${APP_BASE_URL}/dashboard`;
    const ctaUrl = emailDef.cta_url || defaultCtaUrl;

    // Generate HTML using enhanced Ghoste template
    const { html } = buildGhosteOnboardingEmailHtml({
      subject: emailDef.subject,
      firstName,
      tagline: 'Artist Marketing OS',
      headline: emailDef.headline,
      introText: emailDef.body_html, // Use body_html as intro text
      stepsLabel: null, // No steps in current DB schema
      step1Title: null,
      step1Body: null,
      step2Title: null,
      step2Body: null,
      step3Title: null,
      step3Body: null,
      ctaLabel: emailDef.cta_label,
      ctaUrl,
      secondaryText: null, // Use default
      manageNotificationsUrl: `${APP_BASE_URL}/account/notifications`,
      unsubscribeUrl: `${APP_BASE_URL}/unsubscribe`,
      year: String(new Date().getFullYear()),
    });

    console.log('[onboarding-email-preview] Returning preview HTML');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    };
  } catch (error: any) {
    console.error('[onboarding-email-preview] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: errorPage('Internal server error generating preview', 500),
    };
  }
};
