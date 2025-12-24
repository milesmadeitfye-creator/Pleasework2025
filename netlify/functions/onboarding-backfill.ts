/**
 * Onboarding Backfill
 * Enrolls ALL existing users into the 20-step onboarding email sequence
 * AND syncs them to Mailgun mailing list
 *
 * This is an idempotent operation - users already in the queue are skipped.
 * Uses the unique constraint on (user_id, template_key) to prevent duplicates.
 *
 * Security: Requires ADMIN_TOKEN authorization header
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Mailgun from 'mailgun.js';
import formData from 'form-data';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_LIST_ADDRESS = process.env.MAILGUN_LIST_ADDRESS || 'onboarding@mg.ghostemedia.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Syncs a single user to Mailgun list with logging
 */
async function syncUserToMailgun(userId: string, email: string, name?: string): Promise<void> {
  // Check for required environment variables
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAILGUN_LIST_ADDRESS) {
    const errorMsg = 'Missing Mailgun env vars (MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_LIST_ADDRESS)';
    console.warn(`[syncUserToMailgun] ${errorMsg} for ${email}`);

    await supabase.from('mailgun_sync_logs').insert({
      user_id: userId,
      email,
      name,
      action: 'backfill',
      status: 'error',
      error_message: errorMsg,
    });
    return;
  }

  try {
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    const memberData: any = {
      address: email,
      subscribed: true,
      upsert: true,
      vars: JSON.stringify({
        user_id: userId,
        synced_at: new Date().toISOString(),
        action: 'backfill',
      }),
    };

    if (name) {
      memberData.name = name;
    }

    console.log(`[syncUserToMailgun] Syncing ${email} to Mailgun...`);

    const response = await mg.lists.members.createMember(MAILGUN_LIST_ADDRESS, memberData);

    console.log(`[syncUserToMailgun] Successfully synced ${email}`);

    // Log success
    await supabase.from('mailgun_sync_logs').insert({
      user_id: userId,
      email,
      name,
      action: 'backfill',
      status: 'success',
      response_json: response,
    });

    // Tag user with ghoste_onboarding
    try {
      await mg.lists.members.updateMember(MAILGUN_LIST_ADDRESS, email, {
        vars: JSON.stringify({
          user_id: userId,
          synced_at: new Date().toISOString(),
          tags: ['ghoste_onboarding'],
          action: 'backfill',
        }),
      });
      console.log(`[syncUserToMailgun] Tagged ${email} with ghoste_onboarding`);
    } catch (tagError: any) {
      console.warn(`[syncUserToMailgun] Could not tag ${email}:`, tagError.message);
    }
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    console.error(`[syncUserToMailgun] Error syncing ${email}:`, errorMessage);

    await supabase.from('mailgun_sync_logs').insert({
      user_id: userId,
      email,
      name,
      action: 'backfill',
      status: 'error',
      error_message: errorMessage,
      response_json: error.details || error,
    });
  }
}

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface OnboardingEmail {
  step_number: number;
  slug: string;
  subject: string;
  preheader: string;
  headline: string;
  body_html: string;
  cta_label: string;
  cta_url: string;
}

export const handler: Handler = async (event) => {
  console.log('[onboarding-backfill] Starting backfill operation');

  try {
    // Security check: require admin token
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token || !ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      console.error('[onboarding-backfill] Unauthorized access attempt');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized - valid ADMIN_TOKEN required'
        }),
      };
    }

    console.log('[onboarding-backfill] Authorization successful');

    // Fetch all users from profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, created_at')
      .not('email', 'is', null)
      .order('created_at', { ascending: true });

    if (profilesError) {
      console.error('[onboarding-backfill] Error fetching profiles:', profilesError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch user profiles',
          details: profilesError.message
        }),
      };
    }

    const totalUsers = profiles?.length || 0;
    console.log(`[onboarding-backfill] Found ${totalUsers} users with email`);

    if (totalUsers === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          totalUsers: 0,
          queuedUsers: 0,
          skippedUsers: 0,
          message: 'No users found to enroll',
        }),
      };
    }

    // Fetch all onboarding email templates
    const { data: emailTemplates, error: templatesError } = await supabase
      .from('onboarding_emails')
      .select('*')
      .order('step_number', { ascending: true });

    if (templatesError) {
      console.error('[onboarding-backfill] Error fetching templates:', templatesError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch email templates',
          details: templatesError.message
        }),
      };
    }

    const templateCount = emailTemplates?.length || 0;
    console.log(`[onboarding-backfill] Found ${templateCount} email templates`);

    if (templateCount === 0) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'No onboarding email templates found',
          message: 'Please ensure onboarding_emails table is seeded',
        }),
      };
    }

    let queuedUsers = 0;
    let skippedUsers = 0;
    const errors: Array<{ userId: string; email: string; error: string }> = [];

    // Process each user
    for (const user of profiles as User[]) {
      try {
        // Check if user already has any onboarding emails queued
        const { data: existingQueue, error: checkError } = await supabase
          .from('email_queue')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        if (checkError) {
          console.error(`[onboarding-backfill] Error checking queue for ${user.email}:`, checkError);
          errors.push({
            userId: user.id,
            email: user.email,
            error: `Queue check failed: ${checkError.message}`,
          });
          continue;
        }

        // Skip if user already has emails queued
        if (existingQueue && existingQueue.length > 0) {
          console.log(`[onboarding-backfill] User ${user.email} already queued, skipping`);
          skippedUsers++;
          continue;
        }

        // Build queue entries for all onboarding steps
        const signupDate = new Date(user.created_at);
        const queueEntries = [];

        for (const template of emailTemplates as OnboardingEmail[]) {
          // Calculate scheduled date based on step number
          // step 1 = day 0, step 2 = day 1, etc.
          const scheduledDate = new Date(signupDate);
          const daysOffset = template.step_number - 1;
          scheduledDate.setDate(scheduledDate.getDate() + daysOffset);

          // For existing users, if email is overdue, schedule for immediate send
          // (within next 5 minutes to avoid overwhelming the system)
          const now = new Date();
          if (scheduledDate < now) {
            // Spread out immediate sends over 5 minutes to avoid spike
            const randomDelay = Math.floor(Math.random() * 5 * 60 * 1000); // 0-5 minutes
            scheduledDate.setTime(now.getTime() + randomDelay);
          }

          queueEntries.push({
            user_id: user.id,
            to_email: user.email,
            subject: template.subject,
            template_key: template.slug,
            template_id: null,
            payload: {
              username: user.email.split('@')[0],
              email: user.email,
              step_number: template.step_number,
            },
            scheduled_at: scheduledDate.toISOString(),
            retry_count: 0,
            max_retries: 3,
            status: 'pending',
          });
        }

        // Insert all queue entries for this user
        const { error: insertError } = await supabase
          .from('email_queue')
          .insert(queueEntries);

        if (insertError) {
          // Check if it's a unique constraint violation (user already enrolled)
          if (insertError.code === '23505') {
            console.log(`[onboarding-backfill] User ${user.email} already enrolled (unique constraint), skipping`);
            skippedUsers++;
          } else {
            console.error(`[onboarding-backfill] Error enrolling ${user.email}:`, insertError);
            errors.push({
              userId: user.id,
              email: user.email,
              error: `Insert failed: ${insertError.message}`,
            });
          }
          continue;
        }

        console.log(`[onboarding-backfill] Successfully enrolled ${user.email} (${queueEntries.length} emails)`);
        queuedUsers++;

        // Sync user to Mailgun list (non-blocking)
        try {
          // Get user name from profiles table
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('full_name, display_name')
            .eq('id', user.id)
            .maybeSingle();

          const userName = profile?.full_name || profile?.display_name || undefined;

          await syncUserToMailgun(user.id, user.email, userName);
        } catch (mailgunError: any) {
          // Don't fail the backfill if Mailgun sync fails
          console.error(`[onboarding-backfill] Mailgun sync failed for ${user.email}:`, mailgunError.message);
        }

      } catch (error: any) {
        console.error(`[onboarding-backfill] Unexpected error for ${user.email}:`, error);
        errors.push({
          userId: user.id,
          email: user.email,
          error: error?.message || 'Unknown error',
        });
      }
    }

    const result = {
      success: true,
      totalUsers,
      queuedUsers,
      skippedUsers,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      templateCount,
      message: `Backfill complete: ${queuedUsers} users enrolled, ${skippedUsers} already enrolled`,
    };

    console.log('[onboarding-backfill] Backfill complete:', result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (error: any) {
    console.error('[onboarding-backfill] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Backfill operation failed',
        details: error?.message || 'Unknown error',
      }),
    };
  }
};
