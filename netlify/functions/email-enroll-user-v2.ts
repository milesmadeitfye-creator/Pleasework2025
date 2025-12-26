/**
 * Email Enrollment V2
 * Enrolls users in onboarding email sequence using new email_templates system
 *
 * Called by:
 * - on-signup (automatic for new users)
 * - Backfill script (for existing users)
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.URL || 'https://ghoste.one';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

export const handler: Handler = async (event) => {
  console.log('[email-enroll-user-v2] Starting enrollment');

  try {
    const { userId, userEmail, retroactive } = JSON.parse(event.body || '{}');

    if (!userId || !userEmail) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId or userEmail' }),
      };
    }

    // Check if already enrolled
    const { data: existing } = await supabase
      .from('user_email_state')
      .select('enrolled_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing && !retroactive) {
      console.log('[email-enroll-user-v2] User already enrolled, skipping');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: 'User already enrolled',
          enrolled: false,
        }),
      };
    }

    // Create enrollment state
    if (!existing) {
      const { error: stateError } = await supabase
        .from('user_email_state')
        .insert({
          user_id: userId,
          enrolled_at: new Date().toISOString(),
        });

      if (stateError) {
        console.error('[email-enroll-user-v2] Failed to create state:', stateError);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Failed to create enrollment state' }),
        };
      }
    }

    // Get user's first name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();

    const firstName = profile?.full_name?.split(' ')[0] || userEmail.split('@')[0];

    // Enqueue welcome email (immediate)
    const { error: enqueueError } = await supabase.rpc('enqueue_onboarding_email', {
      p_user_id: userId,
      p_user_email: userEmail,
      p_template_key: 'welcome',
      p_delay_minutes: retroactive ? 5 : 0,
    });

    if (enqueueError) {
      console.error('[email-enroll-user-v2] Failed to enqueue welcome:', enqueueError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to enqueue emails' }),
      };
    }

    console.log(`[email-enroll-user-v2] Successfully enrolled ${userEmail}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        enrolled: true,
        emailCount: 1,
      }),
    };
  } catch (error: any) {
    console.error('[email-enroll-user-v2] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Enrollment failed' }),
    };
  }
};
