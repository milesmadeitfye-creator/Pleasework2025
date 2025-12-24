/**
 * Email Automation Runner
 *
 * Scheduled function that runs every 5 minutes to process pending email_jobs.
 *
 * QUICK VERIFY STEPS:
 * 1. POST /.netlify/functions/email-automation-test with { "to_email": "you@example.com" }
 * 2. Wait up to 5 minutes for this runner to execute
 * 3. Check Supabase: SELECT * FROM email_jobs ORDER BY created_at DESC LIMIT 20;
 * 4. Expect status to become 'sent'; if 'failed', read last_error column
 *
 * This function:
 * - Checks if email_automation is enabled in app_settings
 * - Fetches up to 25 pending jobs from email_jobs table
 * - Locks each job (pending -> sending) to prevent double-send
 * - Sends via Mailgun
 * - Updates status to 'sent' or 'failed'
 */

import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { sendMailgunEmail } from './_lib/mailgun';

interface EmailJob {
  id: string;
  to_email: string;
  template_key: string;
  subject: string;
  payload: any;
  status: string;
  attempts: number;
  created_at: string;
}

interface AppSettings {
  key: string;
  value: any;
}

const handler = schedule('*/5 * * * *', async (event) => {
  console.log('[EmailAutomation] Runner triggered at:', new Date().toISOString());

  try {
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

    // Check if email automation is enabled
    const { data: settings, error: settingsError } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', 'email_automation')
      .maybeSingle();

    if (settingsError) {
      console.error('[EmailAutomation] Error fetching settings:', settingsError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch settings' }),
      };
    }

    const isEnabled = settings?.value?.enabled === true;

    if (!isEnabled) {
      console.log('[EmailAutomation] Email automation is disabled');
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, enabled: false, message: 'Email automation is disabled' }),
      };
    }

    console.log('[EmailAutomation] Email automation is enabled, processing jobs...');

    // Fetch pending jobs (oldest first, limit 25)
    const { data: jobs, error: jobsError } = await supabase
      .from('email_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(25);

    if (jobsError) {
      console.error('[EmailAutomation] Error fetching jobs:', jobsError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch jobs' }),
      };
    }

    if (!jobs || jobs.length === 0) {
      console.log('[EmailAutomation] No pending jobs found');
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, enabled: true, processed: 0 }),
      };
    }

    console.log(`[EmailAutomation] Found ${jobs.length} pending jobs, processing...`);

    let successCount = 0;
    let failCount = 0;

    // Process each job
    for (const job of jobs) {
      try {
        // Lock the job (pending -> sending) with optimistic locking
        const { data: lockedJob, error: lockError } = await supabase
          .from('email_jobs')
          .update({
            status: 'sending',
            attempts: job.attempts + 1,
          })
          .eq('id', job.id)
          .eq('status', 'pending') // Only update if still pending (prevents race conditions)
          .select()
          .maybeSingle();

        if (lockError || !lockedJob) {
          // Job was already locked by another process or doesn't exist
          console.log(`[EmailAutomation] Job ${job.id} already locked or not found, skipping`);
          continue;
        }

        console.log(`[EmailAutomation] Processing job ${job.id}:`, {
          to: job.to_email,
          subject: job.subject,
          template: job.template_key,
        });

        // Extract email content from payload
        const text = job.payload?.text || '';
        const html = job.payload?.html || '';

        // Send email via Mailgun
        const result = await sendMailgunEmail({
          to: job.to_email,
          subject: job.subject,
          text,
          html,
        });

        if (result.success) {
          // Update job status to sent
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', job.id);

          successCount++;
          console.log(`[EmailAutomation] ✅ Job ${job.id} sent successfully`);
        } else {
          // Update job status to failed
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              last_error: result.error || 'Unknown error',
            })
            .eq('id', job.id);

          failCount++;
          console.error(`[EmailAutomation] ❌ Job ${job.id} failed:`, result.error);
        }
      } catch (error: any) {
        // Catch any unexpected errors during job processing
        console.error(`[EmailAutomation] Unexpected error processing job ${job.id}:`, error);

        // Mark as failed
        await supabase
          .from('email_jobs')
          .update({
            status: 'failed',
            last_error: error.message || 'Unexpected error',
          })
          .eq('id', job.id);

        failCount++;
      }
    }

    console.log(`[EmailAutomation] Processing complete:`, {
      total: jobs.length,
      success: successCount,
      failed: failCount,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        enabled: true,
        processed: jobs.length,
        success: successCount,
        failed: failCount,
      }),
    };
  } catch (error: any) {
    console.error('[EmailAutomation] Fatal error in runner:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Fatal error in runner',
      }),
    };
  }
});

export { handler };
