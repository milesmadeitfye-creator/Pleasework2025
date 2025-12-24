import formData from 'form-data';
import Mailgun from 'mailgun.js';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Ghoste One <noreply@ghoste.one>';

const mailgun = new Mailgun(formData);

export const mailgunClient =
  MAILGUN_API_KEY && MAILGUN_DOMAIN
    ? mailgun.client({ username: 'api', key: MAILGUN_API_KEY })
    : null;

export async function sendSplitInviteEmail(params: {
  to: string;
  collaboratorName?: string;
  inviterName: string;
  splitTitle: string;
  inviteUrl: string;
}) {
  if (!mailgunClient || !MAILGUN_DOMAIN) {
    console.error('[Mailgun] Not configured, cannot send split invite');
    throw new Error('Mailgun not configured');
  }

  const { to, collaboratorName, inviterName, splitTitle, inviteUrl } = params;

  const subject = `${inviterName} invited you to a Ghoste split`;
  const greeting = collaboratorName ? `Hey ${collaboratorName},` : 'Hey there,';

  const text = `
${greeting}

${inviterName} just invited you to collaborate on a split in Ghoste for:
"${splitTitle}"

Click this link to view the split and accept:
${inviteUrl}

If you weren't expecting this, you can ignore this email.

– Ghoste
`;

  const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Ghoste Split Invite</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body {
          background-color: #030712;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #e5e7eb;
          line-height: 1.6;
        }
        .wrapper {
          width: 100%;
          padding: 32px 16px;
          background: linear-gradient(180deg, #0b1220 0%, #020617 50%, #000000 100%);
        }
        .container {
          max-width: 560px;
          margin: 0 auto;
          background: radial-gradient(circle at top, #0b1220 0%, #020617 55%, #000000 100%);
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
          padding: 36px 32px;
        }
        .logo {
          font-weight: 700;
          font-size: 20px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #60a5fa;
          margin-bottom: 10px;
          text-align: center;
        }
        .badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.5);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: #bfdbfe;
          margin-bottom: 20px;
        }
        .header-section {
          text-align: center;
          margin-bottom: 24px;
        }
        h1 {
          margin: 0 0 12px;
          font-size: 24px;
          line-height: 1.3;
          color: #f9fafb;
          font-weight: 700;
        }
        p {
          font-size: 15px;
          line-height: 1.7;
          color: #cbd5e1;
          margin: 0 0 14px;
        }
        .highlight {
          color: #60a5fa;
          font-weight: 600;
        }
        .project-card {
          margin: 24px 0;
          padding: 18px 20px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(148, 163, 184, 0.4);
        }
        .project-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .project-name {
          font-size: 18px;
          color: #f1f5f9;
          font-weight: 600;
          margin: 0;
        }
        .cta-wrapper {
          text-align: center;
          margin: 32px 0 20px;
        }
        .cta-button {
          display: inline-block;
          padding: 14px 36px;
          border-radius: 999px;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          color: #ffffff !important;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 12px 35px rgba(59, 130, 246, 0.5);
          transition: transform 0.2s;
        }
        .cta-button:hover {
          transform: scale(1.02);
        }
        .footnote {
          margin-top: 24px;
          font-size: 12px;
          color: #64748b;
          line-height: 1.6;
        }
        .divider {
          margin: 28px 0 20px;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(148, 163, 184, 0.3), transparent);
        }
        .footer {
          text-align: center;
          font-size: 11px;
          color: #475569;
        }
        @media only screen and (max-width: 600px) {
          .container {
            padding: 24px 20px;
          }
          h1 {
            font-size: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header-section">
            <div class="logo">GHOSTE ONE</div>
            <div class="badge">Split Invitation</div>
          </div>

          <h1>You've been invited to collaborate</h1>

          <p>${greeting}</p>

          <p>
            <span class="highlight">${inviterName}</span> has invited you to collaborate on a royalty split agreement in Ghoste One for:
          </p>

          <div class="project-card">
            <div class="project-label">Project</div>
            <div class="project-name">${splitTitle}</div>
          </div>

          <p>
            Review the split percentages, terms, and conditions. If everything looks good, you can digitally sign the agreement to finalize your collaboration.
          </p>

          <div class="cta-wrapper">
            <a class="cta-button" href="${inviteUrl}" target="_blank" rel="noopener noreferrer">
              Review Split & Sign
            </a>
          </div>

          <p class="footnote">
            This invitation link is secure and will expire in 7 days. If you weren't expecting this invite or have any questions, please reach out to ${inviterName} directly.
          </p>

          <div class="divider"></div>

          <div class="footer">
            <p style="margin: 0 0 8px;">Powered by <strong>Ghoste One</strong></p>
            <p style="margin: 0; color: #334155;">Your Artist Growth Operating System</p>
          </div>
        </div>
      </div>
    </body>
  </html>
  `;

  try {
    await mailgunClient.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });

    console.log('[Mailgun] Split invite email sent successfully to:', to);
  } catch (error: any) {
    console.error('[Mailgun] Failed to send split invite email:', error);
    throw error;
  }
}
