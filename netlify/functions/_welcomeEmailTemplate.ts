/**
 * Welcome Email Template
 *
 * Template key: welcome_v1
 * Subject: Welcome to Ghoste One 👻
 */

interface WelcomeEmailData {
  firstName: string;
  email: string;
}

export function getWelcomeEmailText(data: WelcomeEmailData): string {
  const { firstName } = data;

  return `Hey ${firstName},

Welcome to Ghoste One — your control room for music marketing.

Here's what you can do right now:

→ Create your first Smart Link
   One link for all platforms. Track every click.
   Start: https://ghoste.one/studio/smart-links

→ Launch a campaign with Ghoste AI
   Your AI manager will help you plan, create, and execute.
   Start: https://ghoste.one/studio/ghoste-ai

→ Build your fanbase
   Email lists, SMS, automations — all in one place.
   Start: https://ghoste.one/studio/fan-communication

Questions? Just reply to this email.

– The Ghoste One Team

---
Unsubscribe: https://ghoste.one/unsubscribe?email=${encodeURIComponent(data.email)}
`;
}

export function getWelcomeEmailHtml(data: WelcomeEmailData): string {
  const { firstName, email } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Ghoste One</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0f29; color: #e5e7eb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0f29; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #111827; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #60a5fa; letter-spacing: -0.5px;">
                👻 Welcome to Ghoste One
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #d1d5db;">
                Hey <strong style="color: #fff;">${firstName}</strong>,
              </p>

              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #d1d5db;">
                Welcome to Ghoste One — your control room for music marketing.
              </p>

              <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">
                Here's what you can do right now:
              </p>

              <!-- Action 1: Smart Links -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 15px 0; background-color: #1f2937; border-radius: 8px; border-left: 4px solid #60a5fa;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #fff;">
                      → Create your first Smart Link
                    </h3>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      One link for all platforms. Track every click.
                    </p>
                    <a href="https://ghoste.one/studio/smart-links" style="display: inline-block; padding: 10px 20px; background-color: #60a5fa; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                      Create Smart Link →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Action 2: Ghoste AI -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 15px 0; background-color: #1f2937; border-radius: 8px; border-left: 4px solid #8b5cf6;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #fff;">
                      → Launch a campaign with Ghoste AI
                    </h3>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Your AI manager will help you plan, create, and execute.
                    </p>
                    <a href="https://ghoste.one/studio/ghoste-ai" style="display: inline-block; padding: 10px 20px; background-color: #8b5cf6; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                      Open Ghoste AI →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Action 3: Fan Communication -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 25px 0; background-color: #1f2937; border-radius: 8px; border-left: 4px solid #10b981;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #fff;">
                      → Build your fanbase
                    </h3>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Email lists, SMS, automations — all in one place.
                    </p>
                    <a href="https://ghoste.one/studio/fan-communication" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
                      Start Building →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #d1d5db;">
                Questions? Just reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #0f172a; border-top: 1px solid #1f2937;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; text-align: center;">
                – The Ghoste One Team
              </p>
              <p style="margin: 0; font-size: 12px; color: #4b5563; text-align: center;">
                <a href="https://ghoste.one/unsubscribe?email=${encodeURIComponent(email)}" style="color: #6b7280; text-decoration: underline;">
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
</html>
  `.trim();
}
