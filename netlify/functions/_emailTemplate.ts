/**
 * Ghoste One Email Template
 *
 * Branded HTML email template using Ghoste One color palette:
 * - Background: #020617 (very dark navy)
 * - Card: #0B1120 (slightly lighter)
 * - Primary button: #1D4ED8 (Ghoste blue)
 * - Secondary accent: #38BDF8 (light blue)
 * - Text: #E5E7EB / #F9FAFB
 * - Muted: #9CA3AF / #6B7280
 * - Badge: #0F172A
 * - Border: #1F2937
 */

export interface GhosteEmailOptions {
  subject: string;
  preheader?: string;
  bodyText: string; // Plain text with \n\n for paragraphs
  ctaLabel?: string;
  ctaUrl?: string;
  footerText?: string;
}

/**
 * Render a branded Ghoste One email
 */
export function renderGhosteEmail(opts: GhosteEmailOptions): string {
  const {
    subject,
    preheader,
    bodyText,
    ctaLabel,
    ctaUrl,
    footerText,
  } = opts;

  // Convert plain text paragraphs to HTML
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean);

  const bodyHtml = paragraphs
    .map((p) => {
      // Handle bullet lists
      if (p.includes('\n•') || p.startsWith('•')) {
        const items = p
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            if (line.startsWith('•')) {
              return `<li style="margin-bottom:8px;color:#E5E7EB;">${line.substring(1).trim()}</li>`;
            }
            return `<p style="margin:0 0 12px;line-height:1.6;color:#E5E7EB;font-size:15px;">${line}</p>`;
          })
          .join('');

        if (items.includes('<li')) {
          return `<ul style="margin:0 0 16px;padding-left:20px;list-style-type:disc;">${items}</ul>`;
        }
        return items;
      }

      // Regular paragraph
      return `<p style="margin:0 0 16px;line-height:1.6;color:#E5E7EB;font-size:15px;">${p.replace(
        /\n/g,
        '<br/>',
      )}</p>`;
    })
    .join('');

  // CTA button (if provided)
  const ctaButton =
    ctaUrl && ctaLabel
      ? `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px;">
        <tr>
          <td align="center">
            <a href="${ctaUrl}"
               style="
                 display:inline-block;
                 padding:14px 32px;
                 border-radius:999px;
                 background:#1D4ED8;
                 color:#F9FAFB;
                 font-weight:600;
                 font-size:15px;
                 text-decoration:none;
                 text-align:center;
                 transition:background 0.2s;
               ">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>`
      : '';

  const defaultFooter = footerText || 'Ghoste One is your music marketing workspace for smart links, ad campaigns, fan communication, and AI-powered strategy.';

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
    ${preheader ? `<meta name="description" content="${preheader}" />` : ''}
    <style>
      @media only screen and (max-width: 600px) {
        .email-container {
          width: 100% !important;
          padding: 16px !important;
        }
        .email-header {
          padding: 20px 16px 12px !important;
        }
        .email-body {
          padding: 16px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#020617; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#020617; padding:32px 16px;">
      <tr>
        <td align="center">
          <!-- Main email container -->
          <table class="email-container" width="100%" cellpadding="0" cellspacing="0" role="presentation"
                 style="max-width:600px; background:#0B1120; border-radius:24px; border:1px solid #1F2937; box-shadow:0 20px 40px rgba(0,0,0,0.7); overflow:hidden;">

            <!-- Header with gradient -->
            <tr>
              <td class="email-header" style="padding:28px 28px 16px; background:radial-gradient(circle at top left, #1D4ED8 0%, #020617 50%);">
                <!-- Ghoste One badge -->
                <div style="display:inline-block; padding:5px 12px; border-radius:999px; background:#0F172A; border:1px solid #1F2937; margin-bottom:12px;">
                  <span style="color:#38BDF8; font-size:11px; letter-spacing:0.08em; font-weight:600; text-transform:uppercase;">
                    Ghoste One
                  </span>
                </div>

                <!-- Email subject as title -->
                <h1 style="margin:12px 0 0; color:#F9FAFB; font-size:24px; line-height:1.3; font-weight:700;">
                  ${subject}
                </h1>
              </td>
            </tr>

            <!-- Body content -->
            <tr>
              <td class="email-body" style="padding:24px 28px 32px; background:#0B1120;">
                ${bodyHtml}
                ${ctaButton}

                <!-- Footer tagline -->
                <p style="margin:28px 0 0; padding-top:24px; border-top:1px solid #1F2937; font-size:12px; line-height:1.5; color:#6B7280;">
                  ${defaultFooter}
                </p>
              </td>
            </tr>
          </table>

          <!-- Legal footer -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; margin-top:16px;">
            <tr>
              <td align="center">
                <p style="margin:0; font-size:11px; line-height:1.5; color:#4B5563; text-align:center;">
                  You're receiving this because you created a Ghoste One account.<br/>
                  If this wasn't you, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Simple template variable replacement
 */
export function replaceTemplateVars(
  text: string,
  vars: Record<string, string>,
): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}
