/**
 * Mailgun User List Backfill
 * Syncs all existing users to the main Mailgun list
 *
 * This should be run ONCE to backfill existing users
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Mailgun from 'mailgun.js';
import formData from 'form-data';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
const MAILGUN_LIST_ADDRESS = process.env.MAILGUN_LIST_ADDRESS || 'onboarding@mg.ghostemedia.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SyncUserData {
  id: string;
  email: string;
  full_name?: string;
}

async function syncUserToMailgunList(user: SyncUserData, mg: any): Promise<void> {
  try {
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

    console.log(`[mailgun-sync-all-users] Synced ${user.email}`);
  } catch (error: any) {
    console.error(`[mailgun-sync-all-users] Error syncing ${user.email}:`, error.message);
    throw error;
  }
}

export const handler: Handler = async (event) => {
  console.log('[mailgun-sync-all-users] Starting Mailgun sync');

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

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Mailgun not configured' }),
      };
    }

    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    // Get all users from profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name');

    if (profilesError) {
      console.error('[mailgun-sync-all-users] Error fetching profiles:', profilesError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch profiles' }),
      };
    }

    console.log(`[mailgun-sync-all-users] Found ${profiles?.length || 0} profiles`);

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const profile of profiles || []) {
      if (!profile.email) {
        console.log(`[mailgun-sync-all-users] Skipping user ${profile.id} - no email`);
        skipped++;
        continue;
      }

      try {
        await syncUserToMailgunList({
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
        }, mg);
        synced++;
      } catch (error: any) {
        console.error(`[mailgun-sync-all-users] Error syncing ${profile.email}:`, error);
        errors++;
      }
    }

    const result = {
      success: true,
      total: profiles?.length || 0,
      synced,
      skipped,
      errors,
    };

    console.log('[mailgun-sync-all-users] Completed:', result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[mailgun-sync-all-users] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Mailgun sync failed' }),
    };
  }
};
