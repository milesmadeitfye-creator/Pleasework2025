/**
 * Email Queue Worker - Reliable Email Delivery with Retry Logic
 *
 * This function processes the email_jobs queue with:
 * - Atomic job claiming to prevent double-sends
 * - Exponential backoff retry logic [1, 5, 15, 60, 360] minutes
 * - Support for send_after scheduling
 * - Mailgun HTTP API integration
 * - Comprehensive error handling
 *
 * Runs every 2 minutes via Netlify scheduled functions.
 * Can also be triggered manually via HTTP: /.netlify/functions/email-queue?limit=10
 */

import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

interface EmailJob {
  id: string;
  user_id?: string;
  to_email: string;
  template_key?: string;
  subject: string;
  payload: {
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    from?: string;
    replyTo?: string;
    scheduled_at?: string;
  };
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  send_after?: string;
  sent_at?: string;
  last_error?: string;
  created_at: string;
  updated_at?: string;
}

interface MailgunResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // Exponential backoff schedule
const MAX_ATTEMPTS = 5;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

/**
 * Send email via Mailgun HTTP API
 */
async function sendViaMailgun(params: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}): Promise<MailgunResponse> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey) {
    return { success: false, error: 'MAILGUN_API_KEY not configured' };
  }

  if (!domain) {
    return { success: false, error: 'MAILGUN_DOMAIN not configured' };
  }

  const defaultFrom = process.env.MAIL_FROM || `Ghoste <no-reply@${domain}>`;

  try {
    const formData = new URLSearchParams();
    formData.append('from', params.from || defaultFrom);
    formData.append('to', params.to);
    formData.append('subject', params.subject);

    if (params.text) {
      formData.append('text', params.text);
    }

    if (params.html) {
      formData.append('html', params.html);
    }

    if (params.replyTo) {
      formData.append('h:Reply-To', params.replyTo);
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP ${response.status}`);
    }

    console.log('[EmailQueue] Mailgun send success:', {
      to: params.to,
      subject: params.subject,
      messageId: result.id,
    });

    return {
      success: true,
      messageId: result.id,
    };
  } catch (error: any) {
    console.error('[EmailQueue] Mailgun send failed:', {
      to: params.to,
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Unknown Mailgun error',
    };
  }
}

/**
 * Validate email job payload
 */
function validatePayload(job: EmailJob): { valid: boolean; error?: string } {
  // Check if payload exists
  if (!job.payload || typeof job.payload !== 'object') {
    return { valid: false, error: 'Missing or invalid payload object' };
  }

  // Get recipient from payload.to or job.to_email
  const to = job.payload.to || job.to_email;
  if (!to || typeof to !== 'string') {
    return { valid: false, error: 'Missing recipient (payload.to or to_email)' };
  }

  // Get subject from payload.subject or job.subject
  const subject = job.payload.subject || job.subject;
  if (!subject || typeof subject !== 'string') {
    return { valid: false, error: 'Missing subject (payload.subject or subject)' };
  }

  // Must have either text or html
  if (!job.payload.text && !job.payload.html) {
    return { valid: false, error: 'Must have either payload.text or payload.html' };
  }

  return { valid: true };
}

/**
 * Calculate next retry delay
 */
function getBackoffMinutes(attempts: number): number {
  const index = Math.min(attempts - 1, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index];
}

/**
 * Main worker handler
 */
async function processEmailQueue(event: any) {
  console.log('[EmailQueue] Worker triggered at:', new Date().toISOString());

  const startTime = Date.now();
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    // Check required env vars
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'SUPABASE_URL environment variable not set',
          processed: 0,
          sent: 0,
          failed: 0,
        }),
      };
    }

    if (!supabaseServiceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'SUPABASE_SERVICE_ROLE_KEY environment variable not set',
          processed: 0,
          sent: 0,
          failed: 0,
        }),
      };
    }

    if (!process.env.MAILGUN_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'MAILGUN_API_KEY environment variable not set',
          processed: 0,
          sent: 0,
          failed: 0,
        }),
      };
    }

    if (!process.env.MAILGUN_DOMAIN) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'MAILGUN_DOMAIN environment variable not set',
          processed: 0,
          sent: 0,
          failed: 0,
        }),
      };
    }

    // Initialize Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    // Get limit from query param (for manual testing)
    const limit = Math.min(
      parseInt(event?.queryStringParameters?.limit || DEFAULT_LIMIT, 10),
      MAX_LIMIT
    );

    console.log(`[EmailQueue] Fetching up to ${limit} pending jobs...`);

    // Fetch pending jobs that are ready to send
    const now = new Date().toISOString();
    const { data: jobs, error: jobsError } = await supabase
      .from('email_jobs')
      .select('id, user_id, to_email, template_key, subject, payload, status, attempts, send_after, created_at')
      .eq('status', 'pending')
      .or(`send_after.is.null,send_after.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (jobsError) {
      console.error('[EmailQueue] Error fetching jobs:', jobsError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Failed to fetch jobs: ${jobsError.message}`,
          processed: 0,
          sent: 0,
          failed: 0,
        }),
      };
    }

    if (!jobs || jobs.length === 0) {
      console.log('[EmailQueue] No pending jobs found');
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          processed: 0,
          sent: 0,
          failed: 0,
          duration_ms: Date.now() - startTime,
        }),
      };
    }

    console.log(`[EmailQueue] Found ${jobs.length} pending jobs, processing...`);

    // Process each job
    for (const job of jobs as EmailJob[]) {
      try {
        // ATOMIC CLAIM: Try to lock this job
        const { data: claimed, error: claimError } = await supabase
          .from('email_jobs')
          .update({ status: 'sending' })
          .eq('id', job.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();

        if (claimError || !claimed) {
          console.log(`[EmailQueue] Job ${job.id} already claimed, skipping`);
          continue;
        }

        processed++;

        console.log(`[EmailQueue] Processing job ${job.id}:`, {
          to: job.to_email,
          subject: job.subject,
          attempts: job.attempts,
        });

        // Validate payload
        const validation = validatePayload(job);
        if (!validation.valid) {
          console.error(`[EmailQueue] Job ${job.id} validation failed:`, validation.error);

          // Mark as failed permanently
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: `Validation failed: ${validation.error}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          failed++;
          continue;
        }

        // Send email
        const result = await sendViaMailgun({
          to: job.payload.to || job.to_email,
          subject: job.payload.subject || job.subject,
          text: job.payload.text,
          html: job.payload.html,
          from: job.payload.from,
          replyTo: job.payload.replyTo,
        });

        if (result.success) {
          // SUCCESS: Mark as sent
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          sent++;
          console.log(`[EmailQueue] ✅ Job ${job.id} sent successfully`);
        } else {
          // FAILURE: Apply retry logic
          const newAttempts = job.attempts + 1;
          const shouldRetry = newAttempts < MAX_ATTEMPTS;

          if (shouldRetry) {
            // Calculate next retry time
            const backoffMinutes = getBackoffMinutes(newAttempts);
            const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

            await supabase
              .from('email_jobs')
              .update({
                status: 'pending',
                attempts: newAttempts,
                send_after: nextRetry,
                last_error: (result.error || 'Unknown error').substring(0, 400),
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);

            console.log(`[EmailQueue] ⚠️ Job ${job.id} failed, retry in ${backoffMinutes} min (attempt ${newAttempts}/${MAX_ATTEMPTS})`);
          } else {
            // Max attempts reached, mark as permanently failed
            await supabase
              .from('email_jobs')
              .update({
                status: 'failed',
                attempts: newAttempts,
                last_error: (result.error || 'Max retry attempts reached').substring(0, 400),
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);

            failed++;
            console.error(`[EmailQueue] ❌ Job ${job.id} permanently failed after ${newAttempts} attempts`);
          }
        }
      } catch (error: any) {
        console.error(`[EmailQueue] Unexpected error processing job ${job.id}:`, error);

        // Mark job as failed with error
        try {
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: (error.message || 'Unexpected error').substring(0, 400),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        } catch (updateErr: any) {
          console.error(`[EmailQueue] Failed to update job ${job.id} error state:`, updateErr);
        }

        failed++;
      }
    }

    const duration = Date.now() - startTime;

    console.log('[EmailQueue] Processing complete:', {
      processed,
      sent,
      failed,
      duration_ms: duration,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        processed,
        sent,
        failed,
        duration_ms: duration,
      }),
    };
  } catch (error: any) {
    console.error('[EmailQueue] Fatal error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error.message || 'Fatal error in email queue worker',
        processed,
        sent,
        failed,
      }),
    };
  }
}

// Export as scheduled function (runs every 2 minutes)
export const handler = schedule('*/2 * * * *', processEmailQueue);
