/**
 * Email Worker
 *
 * Processes email_jobs queue via the email engine:
 * - Reads pending/scheduled jobs from email_jobs
 * - Resolves template content from email_templates or payload
 * - Sends via Mailgun API
 * - Updates status to sent/failed
 * - On successful WELCOME send: inserts automation_events('welcome_sent') + updates user_email_state
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const APP_URL = 'https://ghoste.one';
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

interface EmailJob {
  id: string;
  user_id: string;
  to_email: string;
  template_key: string;
  subject: string;
  payload: any;
  status: string;
  attempts: number;
  created_at: string;
}

interface MailgunResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Substitute template variables like {{first_name}}, {{app_url}}
 */
function substituteVariables(template: string, variables: Record<string, any>): string {
  let result = template;

  // Add default variables
  const allVars = {
    app_url: APP_URL,
    ...variables,
  };

  // Replace {{variable}} with value
  for (const [key, value] of Object.entries(allVars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value || ''));
  }

  return result;
}

async function sendViaMailgun(params: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}): Promise<MailgunResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const fromEmail = process.env.MAILGUN_FROM_EMAIL || `Ghoste One <hello@${domain}>`;

  if (!apiKey || !domain) {
    return {
      success: false,
      error: 'Mailgun not configured (missing API_KEY or DOMAIN)',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('from', params.from || fromEmail);
    formData.append('to', params.to);
    formData.append('subject', params.subject);

    if (params.text) {
      formData.append('text', params.text);
    }

    if (params.html) {
      formData.append('html', params.html);
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

    console.log('[EmailWorker] Mailgun success:', {
      to: params.to,
      messageId: result.id,
    });

    return {
      success: true,
      messageId: result.id,
    };
  } catch (error: any) {
    console.error('[EmailWorker] Mailgun error:', error.message);
    return {
      success: false,
      error: error.message || 'Unknown Mailgun error',
    };
  }
}

const handler: Handler = async (event) => {
  console.log('[EmailWorker] Starting email worker at:', new Date().toISOString());

  const startTime = Date.now();
  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Supabase configuration missing' }),
      };
    }

    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Mailgun configuration missing' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const now = new Date().toISOString();

    console.log(`[EmailWorker] Fetching up to ${BATCH_SIZE} pending/scheduled emails...`);

    // Fetch pending jobs (including scheduled jobs that are due)
    const { data: jobs, error: jobsError } = await supabase
      .from('email_jobs')
      .select('*')
      .or(`status.eq.pending,and(status.eq.scheduled,payload->>scheduled_at.lte.${now})`)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (jobsError) {
      console.error('[EmailWorker] Error fetching jobs:', jobsError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch email jobs' }),
      };
    }

    if (!jobs || jobs.length === 0) {
      console.log('[EmailWorker] No pending jobs to process');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          processed: 0,
          sent: 0,
          failed: 0,
          duration_ms: Date.now() - startTime,
        }),
      };
    }

    console.log(`[EmailWorker] Found ${jobs.length} jobs, processing...`);

    // Process each job
    for (const job of jobs as EmailJob[]) {
      try {
        // ATOMIC CLAIM: Mark as sending
        const { data: claimed, error: claimError } = await supabase
          .from('email_jobs')
          .update({ status: 'sending', attempts: job.attempts + 1, updated_at: now })
          .eq('id', job.id)
          .in('status', ['pending', 'scheduled'])
          .select('id')
          .maybeSingle();

        if (claimError || !claimed) {
          console.log(`[EmailWorker] Job ${job.id} already claimed, skipping`);
          continue;
        }

        processed++;

        console.log(`[EmailWorker] Processing job ${job.id}: ${job.template_key} to ${job.to_email}`);

        // Get template variables from payload or defaults
        const variables: Record<string, any> = {
          first_name: job.payload?.first_name || 'there',
          email: job.to_email,
          credits: job.payload?.credits || '7,500',
          feature_name: job.payload?.feature_name || 'this feature',
        };

        // Check if template content is in payload (from enqueue_onboarding_email)
        let textContent = job.payload?.text;
        let htmlContent = job.payload?.html;
        let subject = job.subject;

        // If not in payload, fetch from email_templates table
        if (!textContent || !htmlContent) {
          const { data: template, error: templateError } = await supabase
            .from('email_templates')
            .select('subject, body_text, body_html')
            .eq('template_key', job.template_key)
            .eq('enabled', true)
            .single();

          if (templateError || !template) {
            console.error(`[EmailWorker] Template not found: ${job.template_key}`, templateError);
            await supabase
              .from('email_jobs')
              .update({
                status: 'failed',
                error: `Template not found: ${job.template_key}`,
                updated_at: now,
              })
              .eq('id', job.id);
            failed++;
            continue;
          }

          textContent = template.body_text;
          htmlContent = template.body_html;
          subject = template.subject;
        }

        // Substitute variables in all content
        const finalSubject = substituteVariables(subject, variables);
        const finalText = substituteVariables(textContent, variables);
        const finalHtml = substituteVariables(htmlContent, variables);

        // Send email
        const result = await sendViaMailgun({
          to: job.to_email,
          subject: finalSubject,
          text: finalText,
          html: finalHtml,
        });

        if (result.success) {
          // SUCCESS: Mark as sent
          const sentAt = new Date().toISOString();

          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: sentAt,
              error: null,
              updated_at: sentAt,
            })
            .eq('id', job.id);

          // If welcome email, insert automation_events + update user_email_state
          if (job.template_key === 'welcome') {
            await supabase.from('automation_events').insert({
              user_id: job.user_id,
              event_key: 'welcome_sent',
              payload: {
                email: job.to_email,
                template_key: job.template_key,
                sent_at: sentAt,
                messageId: result.messageId,
              },
            });

            await supabase
              .from('user_email_state')
              .upsert(
                {
                  user_id: job.user_id,
                  enrolled_at: sentAt,
                  last_email_key: job.template_key,
                  last_email_sent_at: sentAt,
                },
                { onConflict: 'user_id' }
              );

            console.log(`[EmailWorker] ✅ Welcome email sent + automation triggered for ${job.to_email}`);
          }

          sent++;
          console.log(`[EmailWorker] ✅ Job ${job.id} sent successfully`);
        } else {
          // FAILURE: Check if we should retry
          const shouldRetry = job.attempts + 1 < MAX_ATTEMPTS;

          if (shouldRetry) {
            // Mark back as pending for retry
            await supabase
              .from('email_jobs')
              .update({
                status: 'pending',
                error: (result.error || 'Unknown error').substring(0, 500),
                updated_at: now,
              })
              .eq('id', job.id);

            console.log(`[EmailWorker] ⟳ Retry ${job.attempts + 1}/${MAX_ATTEMPTS} for ${job.to_email}`);
          } else {
            // Mark as failed (max attempts reached)
            await supabase
              .from('email_jobs')
              .update({
                status: 'failed',
                error: (result.error || 'Unknown error').substring(0, 500),
                updated_at: now,
              })
              .eq('id', job.id);

            console.error(`[EmailWorker] ❌ Job ${job.id} failed permanently: ${result.error}`);
          }

          failed++;
        }
      } catch (error: any) {
        console.error(`[EmailWorker] Unexpected error processing job ${job.id}:`, error);

        try {
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              error: (error.message || 'Unexpected error').substring(0, 500),
              updated_at: now,
            })
            .eq('id', job.id);
        } catch (updateErr: any) {
          console.error(`[EmailWorker] Failed to update job ${job.id} error state:`, updateErr);
        }

        failed++;
      }
    }

    const duration = Date.now() - startTime;

    console.log('[EmailWorker] Processing complete:', {
      processed,
      sent,
      failed,
      duration_ms: duration,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        processed,
        sent,
        failed,
        duration_ms: duration,
      }),
    };
  } catch (error: any) {
    console.error('[EmailWorker] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Fatal error',
        processed,
        sent,
        failed,
      }),
    };
  }
};

export { handler };
