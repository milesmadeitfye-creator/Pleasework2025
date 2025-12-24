/**
 * Ghoste One Base Email Template
 * Branded HTML email template with dark background and Ghoste styling
 */

export interface GhosteEmailTemplateProps {
  headline: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  preheader?: string;
}

export function ghosteBaseTemplate({
  headline,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  preheader = 'Music marketing on autopilot.',
}: GhosteEmailTemplateProps): string {
  return `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ghoste One</title>
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#020617;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}
  </span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#020617;border-radius:16px;border:1px solid #1e293b;padding:32px;">
          <tr>
            <td align="left" style="color:#e5e7eb;font-size:14px;">
              <div style="font-size:20px;font-weight:700;margin-bottom:4px;">
                👻 Ghoste One
              </div>
              <div style="font-size:12px;color:#9ca3af;">Music marketing on autopilot.</div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;">
              <h1 style="margin:0;color:#f9fafb;font-size:24px;line-height:1.4;font-weight:700;">${headline}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-top:16px;color:#e5e7eb;font-size:14px;line-height:1.7;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;">
              <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;text-decoration:none;background:linear-gradient(135deg,#38bdf8,#6366f1);color:#0b1120;font-weight:600;font-size:14px;">
                ${ctaLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:32px;border-top:1px solid #1e293b;font-size:11px;color:#6b7280;">
              <p style="margin:0 0 8px 0;">
                You're receiving this because you created a Ghoste One account.
              </p>
              <p style="margin:0;">
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
