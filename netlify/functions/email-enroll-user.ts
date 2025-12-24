/**
 * Email Enrollment Function
 * Enrolls a user into the onboarding email sequence
 *
 * Called on:
 * - User signup (email or OAuth)
 * - Manual enrollment
 * - Retroactive enrollment
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const handler: Handler = async (event) => {
  console.log('[email-enroll-user] Starting enrollment');

  try {
    const { userId, userEmail, retroactive } = JSON.parse(event.body || '{}');

    if (!userId || !userEmail) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId or userEmail' }),
      };
    }

    // Get user's signup date
    const { data: user } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .maybeSingle();

    const signupDate = user?.created_at ? new Date(user.created_at) : new Date();

    // Get all onboarding emails (the new 20-step sequence)
    const { data: templates, error: templatesError } = await supabase
      .from('onboarding_emails')
      .select('*')
      .order('step_number', { ascending: true });

    if (templatesError) {
      console.error('[email-enroll-user] Error fetching templates:', templatesError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch templates' }),
      };
    }

    console.log(`[email-enroll-user] Found ${templates?.length || 0} templates`);

    // Check if user is already enrolled
    const { data: existing } = await supabase
      .from('email_queue')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existing && existing.length > 0 && !retroactive) {
      console.log('[email-enroll-user] User already enrolled, skipping');
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

    // Create email queue entries for each template
    // Schedule emails with progressive delays (1 day, 2 days, 3 days, etc.)
    const queueEntries = [];
    for (const template of templates || []) {
      const scheduledDate = new Date(signupDate);
      const daysOffset = template.step_number - 1; // step 1 = day 0, step 2 = day 1, etc.
      scheduledDate.setDate(scheduledDate.getDate() + daysOffset);

      // If retroactive and email is overdue, schedule for immediate send
      if (retroactive && scheduledDate < new Date()) {
        scheduledDate.setTime(Date.now() + 60000); // 1 minute from now
      }

      queueEntries.push({
        user_id: userId,
        to_email: userEmail,
        subject: template.subject,
        template_key: template.slug,
        template_id: null, // Not using old email_templates table
        payload: {
          username: userEmail.split('@')[0],
          email: userEmail,
        },
        scheduled_at: scheduledDate.toISOString(),
        retry_count: 0,
        max_retries: 3,
      });
    }

    const { error: insertError } = await supabase
      .from('email_queue')
      .insert(queueEntries);

    if (insertError) {
      console.error('[email-enroll-user] Error inserting queue entries:', insertError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to enroll user' }),
      };
    }

    console.log(`[email-enroll-user] Successfully enrolled ${userEmail} with ${queueEntries.length} emails`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        enrolled: true,
        emailCount: queueEntries.length,
      }),
    };
  } catch (error: any) {
    console.error('[email-enroll-user] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Enrollment failed' }),
    };
  }
};
