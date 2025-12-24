/**
 * Ghoste One Service Email Template
 *
 * This template is ONLY for Ghoste's own system/service emails sent from noreply@ghoste.one
 * (welcome emails, onboarding, system notifications, Ghoste AI messages, etc.)
 *
 * DO NOT use this for artist-to-fan campaign emails or user marketing campaigns.
 * Those should use their own branding and templates.
 */

export type GhosteServiceEmailOptions = {
  headline: string;
  bodyHtml: string; // already formatted HTML body (paragraphs, lists, etc.)
  ctaLabel?: string;
  ctaUrl?: string;
  managePrefsUrl?: string;
  unsubscribeUrl?: string;
  firstName?: string | null;
};

export function renderGhosteServiceEmail({
  headline,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  managePrefsUrl,
  unsubscribeUrl,
  firstName,
}: GhosteServiceEmailOptions): string {
  const name = firstName && firstName.trim().length > 0 ? firstName.trim() : "there";

  // Provide sensible defaults for links so template doesn't break
  const safeCtaUrl = ctaUrl ?? "#";
  const safeManagePrefsUrl = managePrefsUrl ?? safeCtaUrl;
  const safeUnsubscribeUrl = unsubscribeUrl ?? safeCtaUrl;

  return `<!DOCTYPE html>
<html lang="en" style="margin:0; padding:0;">
  <head>
    <meta charset="utf-8" />
    <title>Ghoste One</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background-color:#020617; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#020617; margin:0; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#020617; border-radius:16px; border:1px solid #0f172a; overflow:hidden;">
            <tr>
              <td style="padding:20px 24px 8px 24px; text-align:left;">
                <span style="display:inline-block; padding:6px 10px; border-radius:999px; background:rgba(56,189,248,0.12); color:#38bdf8; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">
                  Ghoste One
                </span>
              </td>
            </tr>

            <tr>
              <td style="padding:4px 24px 0 24px; text-align:left;">
                <h1 style="margin:0; font-size:22px; line-height:1.3; color:#e5e7eb; font-weight:700;">
                  ${headline}
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 24px 0 24px; text-align:left;">
                <p style="margin:0; font-size:14px; line-height:1.6; color:#9ca3af;">
                  Hey ${name},
                </p>
                <div style="margin-top:8px; font-size:14px; line-height:1.6; color:#9ca3af;">
                  ${bodyHtml}
                </div>
              </td>
            </tr>

            ${
              ctaLabel && ctaUrl
                ? `
            <tr>
              <td style="padding:20px 24px 0 24px; text-align:left;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#38bdf8" style="border-radius:999px;">
                      <a href="${safeCtaUrl}" target="_blank"
                        style="display:inline-block; padding:10px 22px; font-size:13px; font-weight:600; color:#020617; text-decoration:none; letter-spacing:0.03em;">
                        ${ctaLabel}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:12px 24px 0 24px; text-align:left;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#6b7280;">
                  Or paste this link into your browser:
                  <br />
                  <a href="${safeCtaUrl}" target="_blank" style="color:#38bdf8; text-decoration:none; word-break:break-all;">
                    ${safeCtaUrl}
                  </a>
                </p>
              </td>
            </tr>
            `
                : ""
            }

            <tr>
              <td style="padding:20px 24px 0 24px;">
                <hr style="border:none; border-top:1px solid #111827; margin:0;" />
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 0 24px; text-align:left;">
                <p style="margin:0; font-size:11px; line-height:1.6; color:#6b7280;">
                  Ghoste One is your music marketing workspace for smart links, ad campaigns, and fan communication — built for independent artists, managers, and small labels.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 20px 24px; text-align:left;">
                <p style="margin:0; font-size:11px; line-height:1.6; color:#4b5563;">
                  You are receiving this email because you use Ghoste One or a Ghoste Media product.
                  <br />
                  <a href="${safeManagePrefsUrl}" target="_blank" style="color:#9ca3af; text-decoration:underline;">
                    Manage preferences
                  </a>
                  &nbsp;•&nbsp;
                  <a href="${safeUnsubscribeUrl}" target="_blank" style="color:#9ca3af; text-decoration:underline;">
                    Unsubscribe
                  </a>
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
