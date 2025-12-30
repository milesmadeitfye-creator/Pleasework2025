/**
 * Email Kickoff Function
 *
 * Owner-only endpoint to diagnose Mailgun config and send queued welcome emails.
 * - Checks env vars
 * - Enqueues users who haven't received welcome emails
 * - Sends via Mailgun in batches
 * - Tracks success via email_outbox + welcome_email_sent_at + automation_events
 */

import { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { getWelcomeEmailHtml, getWelcomeEmailText } from './_welcomeEmailTemplate';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || 'Ghoste One <hello@ghoste.one>';

const OWNER_EMAIL = 'milesdorre5@gmail.com';
const MAX_BATCHES = 10;
const BATCH_SIZE = 50;

interface KickoffResult {
  success: boolean;
  enqueued: number;
  sent: number;
  failed: number;
  remainingQueued: number;
  mailgunDomain?: string;
  fromEmail?: string;
  errors: string[];
  diagnostics: {
    supabaseConfigured: boolean;
    mailgunConfigured: boolean;
    mailgunApiKey: boolean;
    mailgunDomain: boolean;
    mailgunFromEmail: boolean;
  };
}

// Initialize Mailgun client
let mailgunClient: any = null;
if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
  const mailgun = new Mailgun(formData);
  mailgunClient = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });
}

/**
 * Send email via Mailgun
 */
async function sendMailgunEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!mailgunClient || !MAILGUN_DOMAIN) {
    return { success: false, error: 'Mailgun not configured' };
  }

  try {
    const result = await mailgunClient.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    return { success: true, messageId: result.id };
  } catch (error: any) {
    console.error('[Mailgun] Send error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Verify user is authorized (owner email or admin)
 */
async function verifyOwnerAccess(authToken: string): Promise<{ authorized: boolean; userId?: string; email?: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { authorized: false };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);

    if (authError || !user) {
      console.error('[Auth] Invalid token:', authError);
      return { authorized: false };
    }

    // Check if user is owner or admin
    const isOwner = user.email === OWNER_EMAIL;

    if (isOwner) {
      return { authorized: true, userId: user.id, email: user.email };
    }

    // Check for is_admin flag in user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (profile?.is_admin) {
      return { authorized: true, userId: user.id, email: user.email };
    }

    return { authorized: false };
  } catch (error: any) {
    console.error('[Auth] Verification error:', error);
    return { authorized: false };
  }
}

/**
 * Enqueue users who need welcome emails
 */
async function enqueueWelcomeEmails(): Promise<{ enqueued: number; errors: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const errors: string[] = [];
  let enqueued = 0;

  try {
    // Find users who haven't received welcome email
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('user_id, email, first_name')
      .is('welcome_email_sent_at', null)
      .not('email', 'is', null)
      .limit(500);

    if (error) {
      errors.push(`Failed to query users: ${error.message}`);
      return { enqueued, errors };
    }

    if (!users || users.length === 0) {
      return { enqueued, errors };
    }

    console.log(`[Enqueue] Found ${users.length} users needing welcome emails`);

    // Enqueue each user
    for (const user of users) {
      try {
        const { data, error: insertError } = await supabase
          .from('email_outbox')
          .insert({
            user_id: user.user_id,
            to_email: user.email,
            template_key: 'welcome_v1',
            subject: 'Welcome to Ghoste One 👻',
            payload: {
              firstName: user.first_name || 'there',
              email: user.email,
            },
            status: 'queued',
            attempts: 0,
          })
          .select('id')
          .single();

        if (insertError) {
          // Ignore duplicate errors (unique constraint)
          if (insertError.code !== '23505') {
            errors.push(`Failed to enqueue ${user.email}: ${insertError.message}`);
          }
        } else {
          enqueued++;
        }
      } catch (err: any) {
        errors.push(`Error enqueuing ${user.email}: ${err.message}`);
      }
    }

    console.log(`[Enqueue] Successfully enqueued ${enqueued} emails`);
    return { enqueued, errors };
  } catch (error: any) {
    errors.push(`Enqueue error: ${error.message}`);
    return { enqueued, errors };
  }
}

/**
 * Process and send queued emails in batches
 */
async function sendQueuedEmails(): Promise<{ sent: number; failed: number; errors: string[] }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  for (let batchNum = 0; batchNum < MAX_BATCHES; batchNum++) {
    // Fetch next batch of queued emails
    const { data: emails, error: fetchError } = await supabase
      .from('email_outbox')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      errors.push(`Batch ${batchNum + 1} fetch error: ${fetchError.message}`);
      break;
    }

    if (!emails || emails.length === 0) {
      console.log(`[Send] No more queued emails after batch ${batchNum + 1}`);
      break;
    }

    console.log(`[Send] Processing batch ${batchNum + 1}: ${emails.length} emails`);

    // Process each email in batch
    for (const email of emails) {
      try {
        // Mark as sending
        await supabase
          .from('email_outbox')
          .update({
            status: 'sending',
            attempts: email.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        // Generate email content
        const payload = email.payload || {};
        const firstName = payload.firstName || 'there';
        const emailAddress = payload.email || email.to_email;

        const html = getWelcomeEmailHtml({
          firstName,
          email: emailAddress,
        });

        const text = getWelcomeEmailText({
          firstName,
          email: emailAddress,
        });

        // Send via Mailgun
        const result = await sendMailgunEmail({
          to: email.to_email,
          subject: email.subject,
          html,
          text,
        });

        if (result.success) {
          // Mark as sent
          await supabase
            .from('email_outbox')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          // Update user profile
          await supabase
            .from('user_profiles')
            .update({
              welcome_email_sent_at: new Date().toISOString(),
            })
            .eq('user_id', email.user_id);

          // Insert automation event (triggers sales sequences)
          await supabase
            .from('automation_events')
            .insert({
              user_id: email.user_id,
              event_key: 'welcome_sent',
              payload: {
                email: email.to_email,
                template_key: email.template_key,
                sent_at: new Date().toISOString(),
              },
            });

          sent++;
          console.log(`[Send] ✓ Sent to ${email.to_email}`);
        } else {
          // Mark as failed
          await supabase
            .from('email_outbox')
            .update({
              status: 'failed',
              error: result.error,
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id);

          failed++;
          errors.push(`Failed to send to ${email.to_email}: ${result.error}`);
          console.error(`[Send] ✗ Failed to ${email.to_email}:`, result.error);
        }
      } catch (err: any) {
        errors.push(`Error processing ${email.to_email}: ${err.message}`);
        console.error(`[Send] Error processing ${email.to_email}:`, err);

        // Mark as failed
        try {
          await supabase
            .from('email_outbox')
            .update({
              status: 'failed',
              error: err.message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', email.id);
        } catch (updateErr) {
          console.error('[Send] Failed to update failed status:', updateErr);
        }

        failed++;
      }
    }
  }

  return { sent, failed, errors };
}

/**
 * Get remaining queued count
 */
async function getRemainingQueued(): Promise<number> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { count, error } = await supabase
      .from('email_outbox')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued');

    if (error) {
      console.error('[Queue] Failed to get remaining count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('[Queue] Error getting remaining count:', error);
    return 0;
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const result: KickoffResult = {
    success: false,
    enqueued: 0,
    sent: 0,
    failed: 0,
    remainingQueued: 0,
    errors: [],
    diagnostics: {
      supabaseConfigured: !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY,
      mailgunConfigured: !!MAILGUN_API_KEY && !!MAILGUN_DOMAIN,
      mailgunApiKey: !!MAILGUN_API_KEY,
      mailgunDomain: !!MAILGUN_DOMAIN,
      mailgunFromEmail: !!MAILGUN_FROM_EMAIL,
    },
  };

  try {
    // 1. Verify authorization
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Missing or invalid Authorization header',
          diagnostics: result.diagnostics,
        }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const auth = await verifyOwnerAccess(token);

    if (!auth.authorized) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: 'Access denied. Owner-only endpoint.',
          diagnostics: result.diagnostics,
        }),
      };
    }

    console.log(`[Kickoff] Authorized: ${auth.email}`);

    // 2. Diagnose configuration
    if (!result.diagnostics.supabaseConfigured) {
      result.errors.push('Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
    }

    if (!result.diagnostics.mailgunConfigured) {
      result.errors.push('Mailgun not configured (missing MAILGUN_API_KEY or MAILGUN_DOMAIN)');
    }

    if (result.errors.length > 0) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Configuration incomplete',
          ...result,
        }),
      };
    }

    result.mailgunDomain = MAILGUN_DOMAIN;
    result.fromEmail = MAILGUN_FROM_EMAIL;

    // 3. Enqueue users who need welcome emails
    console.log('[Kickoff] Enqueuing users...');
    const enqueueResult = await enqueueWelcomeEmails();
    result.enqueued = enqueueResult.enqueued;
    result.errors.push(...enqueueResult.errors);

    console.log(`[Kickoff] Enqueued ${result.enqueued} new emails`);

    // 4. Send queued emails
    console.log('[Kickoff] Sending queued emails...');
    const sendResult = await sendQueuedEmails();
    result.sent = sendResult.sent;
    result.failed = sendResult.failed;
    result.errors.push(...sendResult.errors);

    console.log(`[Kickoff] Sent ${result.sent}, Failed ${result.failed}`);

    // 5. Get remaining queued count
    result.remainingQueued = await getRemainingQueued();
    console.log(`[Kickoff] Remaining queued: ${result.remainingQueued}`);

    // 6. Determine overall success
    result.success = result.sent > 0 || (result.enqueued === 0 && result.remainingQueued === 0);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[Kickoff] Unexpected error:', error);
    result.errors.push(`Unexpected error: ${error.message}`);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        ...result,
      }),
    };
  }
};
