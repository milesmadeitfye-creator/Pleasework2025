/**
 * Build Ghoste Onboarding Email HTML
 *
 * Creates consistent, on-brand HTML emails for the onboarding sequence
 * with inline styles for email client compatibility.
 *
 * Returns both HTML (for rich email clients) and plain text (for fallback/accessibility).
 */

export interface GhosteEmailInput {
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
}

export interface GhosteEmailOutput {
  html: string;
  text: string;
}

/**
 * Builds HTML and plain text versions of a Ghoste onboarding email
 */
export function buildGhosteOnboardingEmailHtml(input: GhosteEmailInput): GhosteEmailOutput {
  // Set defaults
  const firstName = input.firstName || 'there';
  const tagline = input.tagline || 'Artist Marketing OS';
  const headline = input.headline || input.subject;
  const introText = input.introText || '';
  const stepsLabel = input.stepsLabel || 'Your next 3 moves';
  const ctaLabel = input.ctaLabel || 'Open Ghoste One';
  const ctaUrl = input.ctaUrl || 'https://ghoste.one/dashboard';
  const secondaryText = input.secondaryText || 'Pro tip: take one small action right after reading this email so Ghoste can start working for you.';
  const manageNotificationsUrl = input.manageNotificationsUrl || '#';
  const unsubscribeUrl = input.unsubscribeUrl || '#';
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
