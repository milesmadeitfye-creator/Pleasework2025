import type { Handler } from '@netlify/functions';

type InviteBody = {
  negotiationId: string;
  projectName: string;
  trackTitle?: string;
  hostName: string;
  inviteeEmail: string;
  splitSummary?: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: Handler = async (event) => {
  console.log('[split-send-invite-lite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'MISSING_BODY' }),
      };
    }

    const body = JSON.parse(event.body) as InviteBody;
    const { negotiationId, projectName, trackTitle, hostName, inviteeEmail, splitSummary } = body;

    if (!negotiationId || !projectName || !hostName || !inviteeEmail) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'MISSING_FIELDS',
          message: 'Missing required fields (negotiationId, projectName, hostName, inviteeEmail)',
        }),
      };
    }

    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
    const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
    const MAILGUN_FROM = process.env.MAILGUN_FROM || 'Ghoste Splits <no-reply@ghoste.one>';
    const APP_URL = process.env.PUBLIC_APP_URL || 'https://ghoste.one';

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.error('[split-send-invite-lite] Mailgun not configured');
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'MAILGUN_NOT_CONFIGURED', message: 'Email service not configured' }),
      };
    }

    const inviteUrl = `${APP_URL}/splits/${negotiationId}`;

    const html = `
      <html>
        <body style="background-color:#020617;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
          <div style="max-width:520px;margin:0 auto;background:#020617;border-radius:18px;border:1px solid #1f2937;padding:24px;">
            <div style="font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#60a5fa;margin-bottom:8px;">
              Ghoste One • Split Invite
            </div>
            <h1 style="font-size:20px;color:#f9fafb;margin:0 0 10px;">You've been invited to a split.</h1>
            <p style="font-size:14px;color:#d1d5db;margin:0 0 10px;">
              <strong>${hostName}</strong> invited you to collaborate on the split for:
            </p>
            <p style="font-size:14px;color:#e5e7eb;margin:0 0 4px;">
              <strong>Project:</strong> ${projectName}
            </p>
            ${
              trackTitle
                ? `<p style="font-size:14px;color:#e5e7eb;margin:0 0 10px;"><strong>Track:</strong> ${trackTitle}</p>`
                : ''
            }
            ${
              splitSummary
                ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 10px;">${splitSummary}</p>`
                : ''
            }
            <p style="margin:16px 0;">
              <a href="${inviteUrl}" style="display:inline-block;padding:10px 24px;border-radius:999px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#f9fafb;font-size:14px;font-weight:600;text-decoration:none;">
                View Split in Ghoste One
              </a>
            </p>
            <p style="font-size:11px;color:#6b7280;margin-top:12px;">
              If you weren't expecting this, you can safely ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;

    const params = new URLSearchParams();
    params.append('from', MAILGUN_FROM);
    params.append('to', inviteeEmail);
    params.append('subject', `Ghoste Split Invite • ${projectName}`);
    params.append('html', html);

    const authHeader = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');

    console.log('[split-send-invite-lite] Sending Mailgun request', {
      to: inviteeEmail,
      project: projectName,
    });

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!mgRes.ok) {
      const text = await mgRes.text().catch(() => '');
      console.error('[split-send-invite-lite] Mailgun error', mgRes.status, text);
      return {
        statusCode: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'MAILGUN_ERROR',
          message: 'Failed to send email',
          status: mgRes.status,
          details: text,
        }),
      };
    }

    console.log('[split-send-invite-lite] Email sent successfully');

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Invite sent successfully' }),
    };
  } catch (e: any) {
    console.error('[split-send-invite-lite] Unexpected error', e);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR', message: e.message || 'Internal server error' }),
    };
  }
};

export default handler;
