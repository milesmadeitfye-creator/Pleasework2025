/**
 * Mailgun Send Test Endpoint
 *
 * Simple test endpoint to verify Mailgun configuration and send a test email
 *
 * Usage:
 * POST /.netlify/functions/mailgun-send-test
 * {
 *   "to": "test@example.com",
 *   "subject": "Test Email",
 *   "text": "This is a test email"
 * }
 *
 * Auth: Requires valid user session OR ADMIN_TEST_KEY env var
 */

import type { Handler } from '@netlify/functions';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { sb } from './_sb';

const DEBUG_VERSION = 'mailgun-send-test-v1.0.0';
const ENVIRONMENT = process.env.CONTEXT || process.env.NODE_ENV || 'unknown';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_REGION = (process.env.MAILGUN_REGION || 'us').toLowerCase();
const FROM_EMAIL = process.env.FROM_EMAIL || 'Ghoste One <noreply@ghoste.one>';
const ADMIN_TEST_KEY = process.env.ADMIN_TEST_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

export const handler: Handler = async (event) => {
  console.log('[mailgun-send-test] 🧪 test_started', {
    debug_version: DEBUG_VERSION,
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {
      error: 'METHOD_NOT_ALLOWED',
      message: 'Only POST requests allowed',
      debug_version: DEBUG_VERSION,
    });
  }

  try {
    // Auth check: Either valid user session OR admin test key
    const authHeader = event.headers.authorization;
    const adminKey = event.headers['x-admin-key'];

    let isAuthorized = false;

    if (ADMIN_TEST_KEY && adminKey === ADMIN_TEST_KEY) {
      console.log('[mailgun-send-test] ✅ auth_via_admin_key');
      isAuthorized = true;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await sb.auth.getUser(token);

      if (!authError && user) {
        console.log('[mailgun-send-test] ✅ auth_via_user_token', {
          user_id: user.id.substring(0, 8) + '...',
        });
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      console.error('[mailgun-send-test] ❌ auth_failed');
      return jsonResponse(401, {
        error: 'UNAUTHORIZED',
        message: 'Valid user session or admin test key required',
        debug_version: DEBUG_VERSION,
      });
    }

    // Validate config
    const missing: string[] = [];
    if (!MAILGUN_API_KEY) missing.push('MAILGUN_API_KEY');
    if (!MAILGUN_DOMAIN) missing.push('MAILGUN_DOMAIN');
    if (!FROM_EMAIL) missing.push('FROM_EMAIL');

    if (missing.length > 0) {
      console.error('[mailgun-send-test] ❌ config_missing', { missing });
      return jsonResponse(400, {
        error: 'MAILGUN_CONFIG_MISSING',
        missing,
        message: 'Mailgun environment variables not configured',
        debug_version: DEBUG_VERSION,
      });
    }

    // Parse request body
    const { to, subject, text, html } = JSON.parse(event.body || '{}');

    if (!to || !subject || (!text && !html)) {
      console.error('[mailgun-send-test] ❌ invalid_request');
      return jsonResponse(400, {
        error: 'INVALID_REQUEST',
        message: 'Required fields: to, subject, and either text or html',
        debug_version: DEBUG_VERSION,
      });
    }

    // Validate email format
    if (!to.includes('@')) {
      return jsonResponse(400, {
        error: 'INVALID_EMAIL',
        message: 'Invalid email address format',
        debug_version: DEBUG_VERSION,
      });
    }

    // Initialize Mailgun client
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: MAILGUN_API_KEY,
      url: MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net',
    });

    console.log('[mailgun-send-test] 📮 sending_test_email', {
      to: maskEmail(to),
      from: FROM_EMAIL,
      domain: MAILGUN_DOMAIN,
      region: MAILGUN_REGION,
      has_html: !!html,
      has_text: !!text,
    });

    // Send test email
    const startTime = Date.now();
    const mailgunResponse = await mg.messages.create(MAILGUN_DOMAIN, {
      from: FROM_EMAIL,
      to,
      subject,
      text: text || (html ? html.replace(/<[^>]*>/g, '') : ''),
      html: html || undefined,
      'o:tag': ['test', 'mailgun-send-test'],
    });

    const elapsed = Date.now() - startTime;
    const mailgunId = mailgunResponse?.id || 'unknown';

    console.log('[mailgun-send-test] ✅ test_email_sent', {
      to: maskEmail(to),
      mailgun_id: mailgunId,
      elapsed_ms: elapsed,
      status: mailgunResponse?.status,
    });

    return jsonResponse(200, {
      success: true,
      message: 'Test email sent successfully',
      mailgun_id: mailgunId,
      mailgun_status: mailgunResponse?.status,
      to: maskEmail(to),
      from: FROM_EMAIL,
      elapsed_ms: elapsed,
      config: {
        domain: MAILGUN_DOMAIN,
        region: MAILGUN_REGION,
      },
      debug_version: DEBUG_VERSION,
    });

  } catch (error: any) {
    console.error('[mailgun-send-test] ❌ test_failed', {
      error_message: error.message || String(error),
      error_status: error.status,
      error_details: error.details,
      debug_version: DEBUG_VERSION,
    });

    return jsonResponse(500, {
      error: 'MAILGUN_SEND_FAILED',
      message: error.message || 'Failed to send test email',
      status: error.status,
      details: error.details || error.message,
      debug_version: DEBUG_VERSION,
    });
  }
};

export default handler;
