// src/lib/mailgunClient.ts
// NOTE: This file should NOT be used from client-side code
// Mailgun API calls must be made from serverless functions only
// This file is kept for backward compatibility but should be refactored

import formData from 'form-data';
import Mailgun from 'mailgun.js';

// Disabled in client - use Netlify functions instead
const MAILGUN_API_KEY = "";
const MAILGUN_DOMAIN = "";
const MAILGUN_FROM_EMAIL = 'Ghoste <no-reply@ghoste.one>';

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
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background:#05050A; color:#F9F9FB; padding:24px;">
    <h1 style="font-size:20px; margin-bottom:12px;">Split collaboration invite</h1>
    <p style="margin:0 0 8px 0;">${greeting}</p>
    <p style="margin:0 0 8px 0;">
      <strong>${inviterName}</strong> just invited you to collaborate on a split in Ghoste for:
    </p>
    <p style="margin:0 0 16px 0; font-style:italic;">"${splitTitle}"</p>
    <p style="margin:0 0 16px 0;">Click the button below to view the split and accept or decline:</p>
    <p>
      <a href="${inviteUrl}" style="display:inline-block;padding:10px 18px;background:#00F5D4;color:#05050A;text-decoration:none;border-radius:999px;font-weight:600;">
        View split & respond
      </a>
    </p>
    <p style="margin-top:24px; font-size:12px; color:#9CA3AF;">
      If you weren't expecting this, you can safely ignore this email.
    </p>
    <p style="font-size:11px; color:#6B7280; margin-top:16px;">– Ghoste</p>
  </div>
  `;

  try {
    await mailgunClient.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM_EMAIL,
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
