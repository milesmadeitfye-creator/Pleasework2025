/**
 * Email Enqueue Welcome
 *
 * Enqueues welcome emails for:
 * - Single user (POST with userId or email)
 * - All users (POST with X-Admin-Key header for backfill)
 *
 * Prevents duplicates using unique constraint on (user_id, template_key).
 * Does NOT send emails - only queues them for email-worker to process.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getWelcomeEmailText, getWelcomeEmailHtml } from './_welcomeEmailTemplate';

interface EnqueueRequest {
  userId?: string;
  email?: string;
}

interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  welcome_email_sent_at?: string;
}

const handler: Handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Parse request body
    let requestData: EnqueueRequest = {};
    if (event.body) {
      try {
        requestData = JSON.parse(event.body);
      } catch {
        requestData = {};
      }
    }

    const { userId, email } = requestData;

    // Check if this is a backfill request (no userId/email + admin key)
    const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const isBackfill = !userId && !email && adminKey === process.env.ADMIN_TASK_KEY;

    let usersToEnqueue: UserProfile[] = [];

    if (isBackfill) {
      // BACKFILL MODE: Fetch all users without welcome emails
      console.log('[EnqueueWelcome] Backfill mode: fetching all users without welcome email');

      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, welcome_email_sent_at')
        .not('email', 'is', null)
        .is('welcome_email_sent_at', null)
        .order('created_at', { ascending: true })
        .limit(1000);

      if (error) {
        console.error('[EnqueueWelcome] Error fetching profiles:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch profiles' }),
        };
      }

      usersToEnqueue = profiles || [];
      console.log(`[EnqueueWelcome] Found ${usersToEnqueue.length} users to enqueue`);

    } else if (userId) {
      // SINGLE USER MODE: Fetch specific user
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, welcome_email_sent_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[EnqueueWelcome] Error fetching profile:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch profile' }),
        };
      }

      if (!profile || !profile.email) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'User not found or missing email' }),
        };
      }

      usersToEnqueue = [profile];

    } else if (email) {
      // EMAIL MODE: Fetch user by email
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('id, email, first_name, welcome_email_sent_at')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error('[EnqueueWelcome] Error fetching profile by email:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch profile' }),
        };
      }

      if (!profile) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'User not found' }),
        };
      }

      usersToEnqueue = [profile];

    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Must provide userId, email, or X-Admin-Key for backfill',
        }),
      };
    }

    // Enqueue welcome emails
    let queued = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of usersToEnqueue) {
      try {
        const firstName = user.first_name || 'there';
        const payload = {
          firstName,
          email: user.email,
          text: getWelcomeEmailText({ firstName, email: user.email }),
          html: getWelcomeEmailHtml({ firstName, email: user.email }),
        };

        // Insert into email_outbox (unique constraint prevents duplicates)
        const { data, error } = await supabase
          .from('email_outbox')
          .insert({
            user_id: user.id,
            to_email: user.email,
            template_key: 'welcome_v1',
            subject: 'Welcome to Ghoste One 👻',
            payload,
            status: 'queued',
            attempts: 0,
          })
          .select('id')
          .maybeSingle();

        if (error) {
          // Check if it's a duplicate (unique constraint violation)
          if (error.code === '23505') {
            console.log(`[EnqueueWelcome] Skipped duplicate for user ${user.id}`);
            skipped++;
          } else {
            console.error(`[EnqueueWelcome] Error enqueueing for user ${user.id}:`, error);
            errors++;
          }
        } else if (data) {
          console.log(`[EnqueueWelcome] Queued email ${data.id} for user ${user.id}`);
          queued++;
        } else {
          // No error but no data = conflict was handled by ON CONFLICT DO NOTHING
          skipped++;
        }
      } catch (err: any) {
        console.error(`[EnqueueWelcome] Unexpected error for user ${user.id}:`, err);
        errors++;
      }
    }

    console.log('[EnqueueWelcome] Complete:', { queued, skipped, errors, total: usersToEnqueue.length });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        queued,
        skipped,
        errors,
        total: usersToEnqueue.length,
        backfill: isBackfill,
      }),
    };
  } catch (error: any) {
    console.error('[EnqueueWelcome] Fatal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Fatal error',
      }),
    };
  }
};

export { handler };
