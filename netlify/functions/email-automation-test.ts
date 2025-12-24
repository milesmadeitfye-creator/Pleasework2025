/**
 * Email Automation Test Endpoint
 *
 * Enqueues a test email into the email_jobs table.
 * Does NOT send directly - relies on email-automation-runner to process.
 *
 * Usage:
 * POST /.netlify/functions/email-automation-test
 * Body: { "to_email": "your@email.com" } or { "email": "your@email.com" }
 *
 * Then check Supabase:
 * SELECT * FROM email_jobs ORDER BY created_at DESC LIMIT 20;
 *
 * Wait up to 5 minutes for the runner to process it.
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const handler: Handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Get email from body (support both to_email and email)
    const toEmail = body.to_email || body.email;

    if (!toEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required field: to_email or email' }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' }),
      };
    }

    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    // Insert test email job
    const { data: job, error: insertError } = await supabase
      .from('email_jobs')
      .insert({
        to_email: toEmail,
        template_key: 'test_email',
        subject: 'Ghoste Email Test ✅',
        payload: {
          text: `This is a test email from Ghoste's email automation system.

If you're seeing this, it means:
✅ The email queue is working
✅ Mailgun integration is configured correctly
✅ The scheduled runner is processing jobs

Sent at: ${new Date().toISOString()}`,
          html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ghoste Email Test</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
    <h1 style="color: white; margin: 0;">Ghoste Email Test ✅</h1>
  </div>

  <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
    <p>This is a test email from Ghoste's email automation system.</p>

    <p><strong>If you're seeing this, it means:</strong></p>
    <ul>
      <li>✅ The email queue is working</li>
      <li>✅ Mailgun integration is configured correctly</li>
      <li>✅ The scheduled runner is processing jobs</li>
    </ul>

    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      <strong>Sent at:</strong> ${new Date().toISOString()}
    </p>
  </div>

  <div style="text-align: center; font-size: 12px; color: #999;">
    <p>This is an automated test email from Ghoste</p>
  </div>
</body>
</html>`,
        },
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[EmailAutomationTest] Error inserting job:', insertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to enqueue test email',
          details: insertError.message,
        }),
      };
    }

    console.log('[EmailAutomationTest] Test email enqueued:', {
      jobId: job.id,
      to: toEmail,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        enqueued: true,
        jobId: job.id,
        to: toEmail,
        message: 'Test email enqueued successfully. It will be sent within 5 minutes by the scheduled runner.',
        checkStatus: `SELECT * FROM email_jobs WHERE id = '${job.id}';`,
      }),
    };
  } catch (error: any) {
    console.error('[EmailAutomationTest] Fatal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};

export { handler };
