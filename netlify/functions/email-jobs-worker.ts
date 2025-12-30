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
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || 'Ghoste One <noreply@ghoste.one>';

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

        const subject = job.subject || template.subject;
        const renderedSubject = renderTemplate(subject, job.payload);
        const renderedText = renderTemplate(template.body_text, job.payload);
        const renderedHtml = renderTemplate(template.body_html, job.payload);

        const sendResult = await sendViaMailgun({
          to: job.to_email,
          subject: renderedSubject,
          text: renderedText,
          html: renderedHtml,
        });

        if (sendResult.success) {
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
          console.log('[EmailJobsWorker] Sent job ' + job.id + ' to ' + job.to_email);
        } else {
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: sendResult.error || 'Unknown error',
              attempts: job.attempts + 1,
              updated_at: now,
            })
            .eq('id', job.id);

          result.failed++;
          console.error('[EmailJobsWorker] Failed job ' + job.id + ': ' + sendResult.error);
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
