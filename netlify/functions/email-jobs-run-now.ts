/**
 * Email Jobs Run Now - Manual Trigger
 *
 * Manually processes up to 50 pending email jobs from public.email_jobs.
 * Supports both static templates and AI-generated content.
 * Protected by X-Admin-Key header or Authorization bearer token for owner email.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || `Ghoste One <no-reply@${MAILGUN_DOMAIN}>`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const ADMIN_TASK_KEY = process.env.ADMIN_TASK_KEY;
const OWNER_EMAIL = 'milesdorre5@gmail.com';

const BATCH_SIZE = 50;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

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

async function generateEmailFromPrompts(params: {
  subjectPrompt: string;
  bodyPrompt: string;
  userContext: Record<string, any>;
}): Promise<{ subject: string; text: string; html: string } | null> {
  try {
    const contextStr = JSON.stringify(params.userContext, null, 2);

    const systemPrompt = `You are Ghoste AI, an expert email copywriter for music artists. Generate compelling, personalized email content.

User Context:
${contextStr}

Generate a professional email following these requirements:
1. Subject line must be concise and compelling (max 60 chars)
2. Body must be warm, personalized, and action-oriented
3. Use the user's first name naturally
4. Include a clear call-to-action
5. Keep tone friendly but professional
6. Body should be 2-4 short paragraphs`;

    const userPrompt = `Subject Requirement: ${params.subjectPrompt}

Body Requirement: ${params.bodyPrompt}

Generate the email content as JSON:
{
  "subject": "...",
  "body": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content);
    if (!parsed.subject || !parsed.body) {
      return null;
    }

    const text = parsed.body;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    p { margin-bottom: 16px; }
    a { color: #4F46E5; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .cta { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; border-radius: 6px; text-decoration: none; margin-top: 16px; }
    .cta:hover { background: #4338CA; text-decoration: none; }
  </style>
</head>
<body>
  ${parsed.body.split('\n\n').map((para: string) => `<p>${para}</p>`).join('\n  ')}
</body>
</html>
`.trim();

    return {
      subject: parsed.subject,
      text,
      html,
    };
  } catch (err: any) {
    console.error('[generateEmailFromPrompts] Error:', err?.message || err);
    return null;
  }
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
      console.error('[EmailJobsRunNow] Fetch error:', fetchError);
      return result;
    }

    if (!jobs || jobs.length === 0) {
      console.log('[EmailJobsRunNow] No pending jobs');
      return result;
    }

    console.log('[EmailJobsRunNow] Processing ' + jobs.length + ' jobs');

    for (const job of jobs as EmailJob[]) {
      try {
        result.processed++;

        const { data: template, error: templateError } = await supabase
          .from('email_templates')
          .select('template_key, subject, body_text, body_html')
          .eq('template_key', job.template_key)
          .eq('enabled', true)
          .maybeSingle();

        let finalSubject = '';
        let finalText = '';
        let finalHtml = '';

        if (template) {
          console.log('[EmailJobsRunNow] Using static template: ' + job.template_key);

          const safePayload = createSafePayload(job.payload, job.to_email);
          const baseSubject = job.subject ?? template.subject ?? 'Ghoste One Update';
          const baseText = template.body_text ?? '';
          const baseHtml = template.body_html ?? '';

          const renderedSubject = renderTemplate(baseSubject, safePayload);
          const renderedText = renderTemplate(baseText, safePayload);
          const renderedHtml = renderTemplate(baseHtml, safePayload);

          finalSubject = finalizeRenderedContent(renderedSubject);
          finalText = finalizeRenderedContent(renderedText);
          finalHtml = finalizeRenderedContent(renderedHtml);
        } else {
          console.log('[EmailJobsRunNow] No static template, checking for prompts: ' + job.template_key);

          const subjectPrompt = job.payload?.subject_prompt;
          const bodyPrompt = job.payload?.body_prompt;

          if (subjectPrompt && bodyPrompt) {
            console.log('[EmailJobsRunNow] Using AI prompts for: ' + job.template_key);

            const userContext = {
              first_name: job.payload?.first_name || job.to_email.split('@')[0],
              email: job.to_email,
              ...job.payload,
            };

            const generated = await generateEmailFromPrompts({
              subjectPrompt,
              bodyPrompt,
              userContext,
            });

            if (!generated) {
              await supabase
                .from('email_jobs')
                .update({
                  status: 'failed',
                  last_error: 'AI generation failed for template: ' + job.template_key,
                  attempts: job.attempts + 1,
                  updated_at: now,
                })
                .eq('id', job.id);

              result.failed++;
              continue;
            }

            finalSubject = generated.subject;
            finalText = generated.text;
            finalHtml = generated.html;
          } else {
            await supabase
              .from('email_jobs')
              .update({
                status: 'failed',
                last_error: 'Template not found and no prompts available for: ' + job.template_key,
                attempts: job.attempts + 1,
                updated_at: now,
              })
              .eq('id', job.id);

            result.failed++;
            continue;
          }
        }

        const hasUnresolvedTokens = finalSubject.includes('{{');
        console.log('[EmailJobsRunNow] Job ' + job.id + ' | To: ' + job.to_email + ' | Template: ' + job.template_key + ' | Subject: ' + finalSubject.substring(0, 80) + (hasUnresolvedTokens ? ' [WARN: unresolved tokens]' : ''));

        const sendResult = await sendViaMailgun({
          to: job.to_email,
          subject: finalSubject,
          text: finalText,
          html: finalHtml,
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
          console.log('[EmailJobsRunNow] Sent job ' + job.id + ' to ' + job.to_email);
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
          console.error('[EmailJobsRunNow] Failed job ' + job.id + ': ' + sendResult.error);
        }
      } catch (jobError: any) {
        console.error('[EmailJobsRunNow] Error processing job ' + job.id + ':', jobError);
        
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
          console.error('[EmailJobsRunNow] Failed to update error for job ' + job.id + ':', updateError);
        }

        result.failed++;
      }
    }

    console.log('[EmailJobsRunNow] Complete:', result);
    return result;
  } catch (error: any) {
    console.error('[EmailJobsRunNow] Fatal error:', error);
    return result;
  }
}

async function verifyAuthorization(headers: Record<string, string | undefined>): Promise<boolean> {
  const adminKey = headers['x-admin-key'] || headers['X-Admin-Key'];
  if (ADMIN_TASK_KEY && adminKey === ADMIN_TASK_KEY) {
    console.log('[EmailJobsRunNow] Authorized via X-Admin-Key');
    return true;
  }

  const authHeader = headers['authorization'] || headers['Authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await supabase.auth.getUser(token);
      
      if (!error && data.user && data.user.email === OWNER_EMAIL) {
        console.log('[EmailJobsRunNow] Authorized via bearer token for owner email');
        return true;
      }
    } catch (error) {
      console.error('[EmailJobsRunNow] Token verification error:', error);
    }
  }

  return false;
}

export const handler: Handler = async (event) => {
  console.log('[EmailJobsRunNow] Manual run triggered');

  const authorized = await verifyAuthorization(event.headers);

  if (!authorized) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unauthorized. Provide X-Admin-Key header or Authorization bearer token.',
      }),
    };
  }

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Mailgun not configured',
      }),
    };
  }

  try {
    const result = await processEmailJobs();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...result,
      }),
    };
  } catch (error: any) {
    console.error('[EmailJobsRunNow] Handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Processing failed',
      }),
    };
  }
};
