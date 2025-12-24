/**
 * Retroactive Email Enrollment
 * Enrolls ALL existing users into the onboarding email sequence
 *
 * This should be run ONCE to backfill existing users
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const handler: Handler = async (event) => {
  console.log('[email-enroll-all-existing] Starting retroactive enrollment');

  try {
    // Security: require admin token
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token || token !== process.env.ADMIN_TOKEN) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Get all users from profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, created_at');

    if (profilesError) {
      console.error('[email-enroll-all-existing] Error fetching profiles:', profilesError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch profiles' }),
      };
    }

    console.log(`[email-enroll-all-existing] Found ${profiles?.length || 0} profiles`);

    let enrolled = 0;
    let skipped = 0;
    let errors = 0;

    for (const profile of profiles || []) {
      if (!profile.email) {
        console.log(`[email-enroll-all-existing] Skipping user ${profile.id} - no email`);
        skipped++;
        continue;
      }

      try {
        // Call the enrollment function
        const response = await fetch(`${process.env.URL}/.netlify/functions/email-enroll-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: profile.id,
            userEmail: profile.email,
            retroactive: true,
          }),
        });

        const result = await response.json();

        if (result.enrolled) {
          enrolled++;
          console.log(`[email-enroll-all-existing] Enrolled ${profile.email}`);
        } else {
          skipped++;
          console.log(`[email-enroll-all-existing] Skipped ${profile.email} - ${result.message}`);
        }
      } catch (error: any) {
        console.error(`[email-enroll-all-existing] Error enrolling ${profile.email}:`, error);
        errors++;
      }
    }

    const result = {
      success: true,
      total: profiles?.length || 0,
      enrolled,
      skipped,
      errors,
    };

    console.log('[email-enroll-all-existing] Completed:', result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[email-enroll-all-existing] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Retroactive enrollment failed' }),
    };
  }
};
