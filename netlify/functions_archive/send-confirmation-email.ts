import type { Handler } from '@netlify/functions';

/**
 * Mailgun Confirmation Email Sender
 *
 * Sends a confirmation email to new signups using Mailgun.
 *
 * Environment variables required:
 * - MAILGUN_API_KEY
 * - MAILGUN_BASE_URL (e.g., https://api.mailgun.net/v3/your-mailgun-domain)
 * - MAILGUN_FROM_EMAIL (optional, defaults to Ghoste <no-reply@ghoste.one>)
 */

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const apiKey = process.env.MAILGUN_API_KEY;
    const baseUrl = process.env.MAILGUN_BASE_URL;
    const fromEnv = process.env.MAILGUN_FROM_EMAIL;

    if (!apiKey || !baseUrl) {
      console.error('[Mailgun] Missing API key or base URL');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Mailgun not configured' })
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const email = (body.email || '').trim();

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email required' })
      };
    }

    const from = fromEnv || 'Ghoste <no-reply@ghoste.one>';

    const params = new URLSearchParams();
    params.append('from', from);
    params.append('to', email);
    params.append('subject', 'Confirm your email with Ghoste');
    params.append(
      'text',
      `You're officially Ghosted 👻

Tap to confirm your email:
https://ghoste.one/confirm?email=${encodeURIComponent(email)}

If you didn't request this, you can safely ignore this email.`
    );

    console.log(`[Mailgun] Sending confirmation email to ${email}`);

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Mailgun] Send failed:', res.status, errorText);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Mailgun send failed' })
      };
    }

    const result = await res.json();
    console.log('[Mailgun] ✅ Email sent successfully:', result);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('[Mailgun] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
