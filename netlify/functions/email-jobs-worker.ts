/**
 * Email Jobs Worker - Scheduled
 *
 * Runs every 2 minutes to process pending email jobs from public.email_jobs.
 * Loads templates from public.email_templates, renders with payload variables,
 * sends via Mailgun, and updates job status.
 */

import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || `Ghoste One <no-reply@${MAILGUN_DOMAIN}>`;

const BATCH_SIZE = 50;

interface EmailJob {
  id: string;
  user_id: string;
  to_email: string;
  template_key: string;
  subject: string | null;
  payload: Record<string, any>;
  status: string;
  attempts: number;
  send_after: string | null;
}

interface EmailTemplate {
  template_key: string;
  subject: string;
  body_text: string;
  body_html: string;
}

interface WorkerResult {
  processed: number;
  sent: number;
  failed: number;
}

/**
 * Create a safe payload with guaranteed fallbacks
 */
function createSafePayload(payload: Record<string, any>, toEmail: string): Record<string, any> {
  const emailPrefix = toEmail ? toEmail.split('@')[0] : 'there';

  const safePayload = {
    ...payload,
    first_name: payload.first_name ||
                payload.display_name ||
                payload.full_name ||
                emailPrefix,
    cta_url: ensureHttpsUrl(payload.cta_url || 'https://ghoste.one/overview'),
  };

  return safePayload;
}

/**
 * Ensure URL has https:// prefix and is valid
 */
function ensureHttpsUrl(url: string): string {
  if (!url || url.trim() === '') {
    return 'https://ghoste.one/overview';
  }

  const trimmed = url.trim();

  // If it already has a protocol, return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Add https:// prefix
  return 'https://' + trimmed;
}

/**
 * Render template with variable replacement (supports nested keys like {{plan.name}})
 */
function renderTemplate(template: string, payload: Record<string, any>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    const keys = trimmedKey.split('.');
    let value: any = payload;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return match;
      }
    }

    return value != null ? String(value) : match;
  });
}

/**
 * Finalize rendered content: replace leftover {{first_name}} with "there" and strip remaining tokens
 */
function finalizeRenderedContent(content: string): string {
  // First pass: replace any leftover {{first_name}} or {{ first_name }} with "there"
  let finalized = content.replace(/\{\{\s*first_name\s*\}\}/gi, 'there');

  // Second pass: strip any remaining {{...}} tokens to avoid shipping braces to users
  finalized = finalized.replace(/\{\{[^}]+\}\}/g, '');

  return finalized;
}

async function sendViaMailgun(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const formData = new URLSearchParams();
    formData.append('from', MAILGUN_FROM_EMAIL);
    formData.append('to', params.to);
    formData.append('subject', params.subject);
    formData.append('text', params.text);
    formData.append('html', params.html);

    const auth = Buffer.from('api:' + MAILGUN_API_KEY).toString('base64');

    const response = await fetch('https://api.mailgun.net/v3/' + MAILGUN_DOMAIN + '/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      const errorMsg = result.message || JSON.stringify(result);
      throw new Error('Mailgun ' + response.status + ': ' + errorMsg);
    }

    return {
      success: true,
      messageId: result.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown Mailgun error',
    };
  }
}

async function processEmailJobs(): Promise<WorkerResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    failed: 0,
  };

  try {
    const now = new Date().toISOString();

    const { data: jobs, error: fetchError } = await supabase
      .from('email_jobs')
      .select('*')
      .in('status', ['pending', 'queued'])
      .or('send_after.is.null,send_after.lte.' + now)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[EmailJobsWorker] Fetch error:', fetchError);
      return result;
    }

    if (!jobs || jobs.length === 0) {
      console.log('[EmailJobsWorker] No pending jobs');
      return result;
    }

    console.log('[EmailJobsWorker] Processing ' + jobs.length + ' jobs');

    for (const job of jobs as EmailJob[]) {
      try {
        result.processed++;

        const { data: template, error: templateError } = await supabase
          .from('email_templates')
          .select('template_key, subject, body_text, body_html')
          .eq('template_key', job.template_key)
          .eq('enabled', true)
          .maybeSingle();

        if (templateError || !template) {
          console.error('[EmailJobsWorker] Template not found: ' + job.template_key);

          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: 'Template not found: ' + job.template_key,
              attempts: job.attempts + 1,
              updated_at: now,
            })
            .eq('id', job.id);

          result.failed++;
          continue;
        }

        // Create safe payload with guaranteed first_name fallback
        const safePayload = createSafePayload(job.payload, job.to_email);

        // Choose subject: job.subject takes priority, otherwise use template.subject, fallback to default
        const baseSubject = job.subject ?? template.subject ?? 'Ghoste One Update';
        const baseText = template.body_text ?? '';
        const baseHtml = template.body_html ?? '';

        // Render templates with payload
        const renderedSubject = renderTemplate(baseSubject, safePayload);
        const renderedText = renderTemplate(baseText, safePayload);
        const renderedHtml = renderTemplate(baseHtml, safePayload);

        // Finalize: replace leftover {{first_name}} with "there" and strip remaining tokens
        const finalSubject = finalizeRenderedContent(renderedSubject);
        const finalText = finalizeRenderedContent(renderedText);
        const finalHtml = finalizeRenderedContent(renderedHtml);

        // Log job details for debugging (check if subject still contains "{{")
        const hasUnresolvedTokens = finalSubject.includes('{{');
        console.log('[EmailJobsWorker] Job ' + job.id + ' | To: ' + job.to_email + ' | Template: ' + job.template_key + ' | Subject: ' + finalSubject.substring(0, 80) + (hasUnresolvedTokens ? ' [WARN: unresolved tokens]' : ''));

        const sendResult = await sendViaMailgun({
          to: job.to_email,
          subject: finalSubject,
          text: finalText,
          html: finalHtml,
        });

        if (sendResult.success) {
          // Update email_jobs status
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: now,
              last_error: null,
              attempts: job.attempts + 1,
              updated_at: now,
            })
            .eq('id', job.id);

          // Track send in user_email_sends (prevents duplicate sends in future)
          const templateCategory = job.payload?.category || 'onboarding';
          await supabase
            .from('user_email_sends')
            .insert({
              user_id: job.user_id,
              template_key: job.template_key,
              category: templateCategory,
              provider_message_id: sendResult.messageId || null,
              status: 'sent',
              sent_at: now,
            })
            .onConflict('user_id, template_key')
            .ignore();

          if (job.template_key === 'welcome_v1') {
            await supabase.from('automation_events').insert({
              user_id: job.user_id,
              event_key: 'welcome_sent',
              payload: {
                template_key: job.template_key,
                email_job_id: job.id,
              },
            });
          }

          result.sent++;
          console.log('[EmailJobsWorker] Sent job ' + job.id + ' | user: ' + job.user_id + ' | template: ' + job.template_key + ' | to: ' + job.to_email);
        } else {
          // Update email_jobs status
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: sendResult.error || 'Unknown error',
              attempts: job.attempts + 1,
              updated_at: now,
            })
            .eq('id', job.id);

          // Track failed send in user_email_sends
          const templateCategory = job.payload?.category || 'onboarding';
          await supabase
            .from('user_email_sends')
            .insert({
              user_id: job.user_id,
              template_key: job.template_key,
              category: templateCategory,
              provider_message_id: null,
              status: 'failed',
              error_message: sendResult.error || 'Unknown error',
              sent_at: now,
            })
            .onConflict('user_id, template_key')
            .ignore();

          result.failed++;
          console.error('[EmailJobsWorker] Failed job ' + job.id + ' | user: ' + job.user_id + ' | template: ' + job.template_key + ' | error: ' + sendResult.error);
        }
      } catch (jobError: any) {
        console.error('[EmailJobsWorker] Error processing job ' + job.id + ':', jobError);
        
        try {
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: jobError.message || 'Processing error',
              attempts: job.attempts + 1,
              updated_at: now,
            })
            .eq('id', job.id);
        } catch (updateError) {
          console.error('[EmailJobsWorker] Failed to update error for job ' + job.id + ':', updateError);
        }

        result.failed++;
      }
    }

    console.log('[EmailJobsWorker] Complete:', result);
    return result;
  } catch (error: any) {
    console.error('[EmailJobsWorker] Fatal error:', error);
    return result;
  }
}

export const handler = schedule('*/2 * * * *', async () => {
  console.log('[EmailJobsWorker] Scheduled run started');

  const result = await processEmailJobs();

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    }),
  };
});

export const config = {
  schedule: '*/2 * * * *',
};
