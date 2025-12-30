/**
 * Email Enqueue Welcome
 *
 * Enqueues welcome emails using the email engine (email_jobs + email_templates):
 * - Single user (POST with userId or email)
 * - All users (POST with X-Admin-Key header for backfill)
 *
 * Uses enqueue_welcome_email RPC which calls enqueue_onboarding_email.
 * Does NOT send emails - only queues them for email-worker to process.
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

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
      // BACKFILL MODE: Fetch all users who haven't been sent welcome email
      console.log('[EnqueueWelcome] Backfill mode: fetching users without welcome email');

      // Get users from auth.users and check if they have email_jobs for welcome
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) {
        console.error('[EnqueueWelcome] Error fetching auth users:', authError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch users' }),
        };
      }

      // Get profiles for these users (if they exist)
      const userIds = authUsers.users.map(u => u.id);
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, first_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Get existing email_jobs for welcome template
      const { data: existingJobs } = await supabase
        .from('email_jobs')
        .select('user_id')
        .eq('template_key', 'welcome')
        .in('user_id', userIds);

      const sentUserIds = new Set(existingJobs?.map(j => j.user_id) || []);

      // Build list of users who need welcome email
      usersToEnqueue = authUsers.users
        .filter(u => u.email && !sentUserIds.has(u.id))
        .map(u => {
          const profile = profileMap.get(u.id);
          return {
            id: u.id,
            email: u.email!,
            first_name: profile?.first_name,
          };
        })
        .slice(0, 1000); // Limit to 1000

      console.log(`[EnqueueWelcome] Found ${usersToEnqueue.length} users to enqueue`);

    } else if (userId) {
      // SINGLE USER MODE: Fetch specific user
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

      if (authError || !authUser.user) {
        console.error('[EnqueueWelcome] Error fetching auth user:', authError);
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User not found' }),
        };
      }

      if (!authUser.user.email) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'User has no email' }),
        };
      }

      // Get profile for first_name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name')
        .eq('user_id', userId)
        .maybeSingle();

      usersToEnqueue = [{
        id: authUser.user.id,
        email: authUser.user.email,
        first_name: profile?.first_name,
      }];

    } else if (email) {
      // EMAIL MODE: Fetch user by email from auth.users
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

      if (authError) {
        console.error('[EnqueueWelcome] Error fetching auth users:', authError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch users' }),
        };
      }

      const authUser = authUsers.users.find(u => u.email === email);

      if (!authUser) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'User not found' }),
        };
      }

      // Get profile for first_name
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('first_name')
        .eq('user_id', authUser.id)
        .maybeSingle();

      usersToEnqueue = [{
        id: authUser.id,
        email: authUser.email!,
        first_name: profile?.first_name,
      }];

    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Must provide userId, email, or X-Admin-Key for backfill',
        }),
      };
    }

    // Enqueue welcome emails using RPC
    let queued = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of usersToEnqueue) {
      try {
        const firstName = user.first_name || 'there';

        // Call enqueue_welcome_email RPC (which calls enqueue_onboarding_email)
        const { data: jobId, error } = await supabase.rpc('enqueue_welcome_email', {
          p_user_id: user.id,
          p_user_email: user.email,
          p_first_name: firstName,
        });

        if (error) {
          console.error(`[EnqueueWelcome] Error enqueueing for user ${user.id}:`, error);
          errors++;
        } else if (jobId) {
          console.log(`[EnqueueWelcome] Queued email job ${jobId} for user ${user.id}`);
          queued++;
        } else {
          console.log(`[EnqueueWelcome] Skipped (already queued) for user ${user.id}`);
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
