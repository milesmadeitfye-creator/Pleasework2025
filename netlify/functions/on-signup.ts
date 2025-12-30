/**
 * On Signup Hook
 * Called when a new user signs up (email or OAuth)
 * Handles:
 * - Email enrollment in onboarding sequence
 * - Mailgun list sync with "ghoste_onboarding" tag
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Mailgun from 'mailgun.js';
import formData from 'form-data';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_LIST_ADDRESS = process.env.MAILGUN_LIST_ADDRESS || 'onboarding@mg.ghostemedia.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function syncUserToMailgunList(user: {
  id: string;
  email: string;
  full_name?: string;
}): Promise<void> {
  try {
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.warn('[on-signup] Mailgun not configured, skipping sync');
      return;
    }

    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    const memberData: any = {
      address: user.email,
      subscribed: true,
      upsert: true,
    };

    if (user.full_name) {
      memberData.name = user.full_name;
    }

    memberData.vars = JSON.stringify({
      user_id: user.id,
      synced_at: new Date().toISOString(),
      tags: ['ghoste_onboarding'],
    });

    await mg.lists.members.createMember(MAILGUN_LIST_ADDRESS, memberData);

    console.log('[on-signup] ✅ mailgun_list_synced', {
      email: user.email.split('@')[0].charAt(0) + '***@' + user.email.split('@')[1],
      list: MAILGUN_LIST_ADDRESS,
    });
  } catch (error: any) {
    console.error('[on-signup] ❌ mailgun_list_sync_failed', {
      email: user.email.split('@')[0].charAt(0) + '***@' + user.email.split('@')[1],
      error_message: error.message,
    });
  }
}

export const handler: Handler = async (event) => {
  const timestamp = new Date().toISOString();

  console.log('[on-signup] 🎉 automation_trigger_fired', { timestamp });

  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, userEmail, userName, provider } = body;

    if (!userId || !userEmail) {
      console.error('[on-signup] ❌ missing_required_fields');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId or userEmail' }),
      };
    }

    const maskedEmail = userEmail.split('@')[0].charAt(0) + '***@' + userEmail.split('@')[1];

    console.log('[on-signup] 👤 new_user_detected', {
      user_id: userId.substring(0, 8) + '...',
      email: maskedEmail,
      provider: provider || 'email',
    });

    // Sync to Mailgun list (non-blocking)
    syncUserToMailgunList({
      id: userId,
      email: userEmail,
      full_name: userName,
    }).catch((err) => {
      console.error('[on-signup] Mailgun sync failed:', err);
    });

    // Enqueue welcome email (new system)
    console.log('[on-signup] 📨 enqueueing_welcome_email');

    try {
      const welcomeResponse = await fetch(`${process.env.URL}/.netlify/functions/email-enqueue-welcome`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
        }),
      });

      const welcomeResult = await welcomeResponse.json();

      if (welcomeResponse.ok && welcomeResult.ok) {
        console.log('[on-signup] ✅ welcome_email_queued', {
          queued: welcomeResult.queued,
          skipped: welcomeResult.skipped,
        });
      } else {
        console.error('[on-signup] ⚠️ welcome_email_queue_failed', {
          status: welcomeResponse.status,
          result: welcomeResult,
        });
      }
    } catch (welcomeError: any) {
      console.error('[on-signup] ❌ welcome_email_queue_error', {
        error_message: welcomeError.message,
      });
    }

    // Run email decider immediately after signup (triggers onboarding_day0/welcome)
    console.log('[on-signup] 🎯 running_email_decider');

    try {
      const { data: deciderData, error: deciderError } = await supabase
        .rpc('run_email_decider');

      if (deciderError) {
        console.error('[on-signup] ⚠️ email_decider_failed', {
          error_message: deciderError.message,
        });
      } else {
        console.log('[on-signup] ✅ email_decider_complete', deciderData);
      }
    } catch (deciderCatchError: any) {
      console.error('[on-signup] ❌ email_decider_error', {
        error_message: deciderCatchError.message,
      });
    }

    // Legacy: Enroll in email sequence (keeping for compatibility)
    console.log('[on-signup] 📨 calling_email_enrollment');

    try {
      const enrollResponse = await fetch(`${process.env.URL}/.netlify/functions/email-enroll-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userEmail,
          retroactive: false,
        }),
      });

      const enrollResult = await enrollResponse.json();

      if (enrollResponse.ok && enrollResult.success) {
        console.log('[on-signup] ✅ email_enrollment_success', {
          enrolled: enrollResult.enrolled,
          email_count: enrollResult.emailCount,
        });
      } else {
        console.error('[on-signup] ⚠️ email_enrollment_partial', {
          status: enrollResponse.status,
          result: enrollResult,
        });
      }
    } catch (enrollError: any) {
      console.error('[on-signup] ❌ email_enrollment_failed', {
        error_message: enrollError.message,
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Signup processing complete',
      }),
    };
  } catch (error: any) {
    console.error('[on-signup] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Signup processing failed' }),
    };
  }
};
