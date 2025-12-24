/**
 * Mailgun Email Helper
 *
 * Provides a clean interface to send emails via Mailgun.
 * Uses mailgun.js with form-data.
 */

import Mailgun from 'mailgun.js';
import FormData from 'form-data';

interface MailgunConfig {
  apiKey: string;
  domain: string;
  from?: string;
  region?: 'US' | 'EU';
}

interface SendEmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

/**
 * Get Mailgun client instance
 */
export function getMailgunClient(): { client: any; config: MailgunConfig } {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey) {
    throw new Error('MAILGUN_API_KEY environment variable is not set');
  }

  if (!domain) {
    throw new Error('MAILGUN_DOMAIN environment variable is not set');
  }

  const region = (process.env.MAILGUN_REGION || 'US') as 'US' | 'EU';
  const from = process.env.MAILGUN_FROM || `Ghoste <noreply@${domain}>`;

  const mailgun = new Mailgun(FormData);
  const client = mailgun.client({
    username: 'api',
    key: apiKey,
    url: region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net',
  });

  return {
    client,
    config: {
      apiKey,
      domain,
      from,
      region,
    },
  };
}

/**
 * Send email via Mailgun
 */
export async function sendMailgunEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { client, config } = getMailgunClient();

    // Validate params
    if (!params.to) {
      throw new Error('Missing required parameter: to');
    }

    if (!params.subject) {
      throw new Error('Missing required parameter: subject');
    }

    if (!params.text && !params.html) {
      throw new Error('Must provide either text or html content');
    }

    // Build message data
    const messageData: any = {
      from: params.from || config.from,
      to: params.to,
      subject: params.subject,
    };

    if (params.text) {
      messageData.text = params.text;
    }

    if (params.html) {
      messageData.html = params.html;
    }

    // Send via Mailgun
    const result = await client.messages.create(config.domain, messageData);

    console.log('[Mailgun] Email sent successfully:', {
      to: params.to,
      subject: params.subject,
      messageId: result.id,
    });

    return {
      success: true,
      messageId: result.id,
    };
  } catch (error: any) {
    console.error('[Mailgun] Failed to send email:', {
      error: error.message,
      to: params.to,
      subject: params.subject,
    });

    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}
