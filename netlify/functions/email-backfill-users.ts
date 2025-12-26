/**
 * Email Backfill Users
 * One-time function to enroll existing users in email automation
 *
 * Safety features:
 * - Only enrolls users who haven't been enrolled
 * - Staggers emails (first email in 5 mins, not immediate)
 * - Limits batch size to prevent overwhelming Mailgun
 *
 * Usage:
 * POST /.netlify/functions/email-backfill-users
 * {
 *   "batchSize": 50,  // optional, defaults to 50
 *   "dryRun": true    // optional, set false to actually send
 * }
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
  console.log('[email-backfill] Starting backfill');

  try {
    const { batchSize = 50, dryRun = true } = JSON.parse(event.body || '{}');

    // Get users who haven't been enrolled yet
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email')
      .is('email_confirmed', true)
      .limit(batchSize);

    if (usersError) {
      console.error('[email-backfill] Error fetching users:', usersError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch users' }),
      };
    }

    if (!users || users.length === 0) {
      console.log('[email-backfill] No users found to backfill');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          usersProcessed: 0,
          message: 'No users to backfill',
        }),
      };
    }

    // Filter out already enrolled users
    const { data: enrolled } = await supabase
      .from('user_email_state')
      .select('user_id')
      .in('user_id', users.map((u) => u.id));

    const enrolledIds = new Set((enrolled || []).map((e) => e.user_id));
    const usersToEnroll = users.filter((u) => !enrolledIds.has(u.id));

    console.log(`[email-backfill] Found ${usersToEnroll.length} users to enroll`);

    if (dryRun) {
      console.log('[email-backfill] DRY RUN - would enroll:', usersToEnroll.length);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          dryRun: true,
          usersToEnroll: usersToEnroll.length,
          sampleUsers: usersToEnroll.slice(0, 5).map((u) => ({
            id: u.id,
            email: u.email,
          })),
        }),
      };
    }

    // Enroll users (with retroactive flag)
    let successCount = 0;
    let failCount = 0;

    for (const user of usersToEnroll) {
      try {
        const enrollResponse = await fetch(`${APP_URL}/.netlify/functions/email-enroll-user-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            userEmail: user.email,
            retroactive: true,
          }),
        });

        const result = await enrollResponse.json();

        if (enrollResponse.ok && result.success) {
          successCount++;
          console.log(`[email-backfill] ✅ Enrolled ${user.email}`);
        } else {
          failCount++;
          console.error(`[email-backfill] ❌ Failed to enroll ${user.email}:`, result);
        }
      } catch (error: any) {
        failCount++;
        console.error(`[email-backfill] ❌ Error enrolling ${user.email}:`, error);
      }
    }

    console.log(`[email-backfill] Complete: ${successCount} success, ${failCount} failed`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        dryRun: false,
        usersProcessed: usersToEnroll.length,
        successCount,
        failCount,
      }),
    };
  } catch (error: any) {
    console.error('[email-backfill] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Backfill failed' }),
    };
  }
};
