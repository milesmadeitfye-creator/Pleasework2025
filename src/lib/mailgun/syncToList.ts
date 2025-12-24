/**
 * Mailgun List Sync Utilities
 * Syncs users to the main Mailgun list with comprehensive logging
 */

import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { createClient } from '@supabase/supabase-js';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_LIST_ADDRESS = process.env.MAILGUN_LIST_ADDRESS || 'onboarding@mg.ghostemedia.com';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SyncUserData {
  id?: string;
  email: string;
  full_name?: string;
  name?: string;
  action?: 'signup' | 'backfill' | 'test';
}

/**
 * Logs sync attempt to database for debugging
 */
async function logSync({
  userId,
  email,
  name,
  action,
  status,
  errorMessage,
  responseJson,
}: {
  userId?: string;
  email: string;
  name?: string;
  action: 'signup' | 'backfill' | 'test';
  status: 'success' | 'error';
  errorMessage?: string;
  responseJson?: any;
}) {
  try {
    await supabase.from('mailgun_sync_logs').insert({
      user_id: userId,
      email,
      name,
      action,
      status,
      error_message: errorMessage,
      response_json: responseJson,
    });
  } catch (logError: any) {
    console.error('[logSync] Failed to write log:', logError.message);
  }
}

/**
 * Syncs a user to the main Mailgun mailing list with comprehensive logging
 * Adds or updates the user and tags them with "ghoste_onboarding"
 */
export async function syncUserToMailgunList(user: SyncUserData): Promise<void> {
  const action = user.action || 'signup';
  const userId = user.id;
  const name = user.full_name || user.name;

  // Check for required environment variables
  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !MAILGUN_LIST_ADDRESS) {
    const errorMsg = 'Missing Mailgun environment variables (MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_LIST_ADDRESS)';
    console.warn(`[syncUserToMailgunList] ${errorMsg}`);

    await logSync({
      userId,
      email: user.email,
      name,
      action,
      status: 'error',
      errorMessage: errorMsg,
    });
    return;
  }

  try {
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    // Add or update user to mailing list
    const memberData: any = {
      address: user.email,
      subscribed: true,
      upsert: true,
    };

    if (name) {
      memberData.name = name;
    }

    // Add user variables (metadata)
    memberData.vars = JSON.stringify({
      user_id: userId || 'unknown',
      synced_at: new Date().toISOString(),
      action,
    });

    console.log(`[syncUserToMailgunList] Syncing ${user.email} to list ${MAILGUN_LIST_ADDRESS}...`);

    const response = await mg.lists.members.createMember(MAILGUN_LIST_ADDRESS, memberData);

    console.log(`[syncUserToMailgunList] Successfully synced ${user.email}`);

    // Log success
    await logSync({
      userId,
      email: user.email,
      name,
      action,
      status: 'success',
      responseJson: response,
    });

    // Tag user with ghoste_onboarding
    try {
      await mg.lists.members.updateMember(MAILGUN_LIST_ADDRESS, user.email, {
        vars: JSON.stringify({
          user_id: userId || 'unknown',
          synced_at: new Date().toISOString(),
          tags: ['ghoste_onboarding'],
          action,
        }),
      });
      console.log(`[syncUserToMailgunList] Tagged ${user.email} with ghoste_onboarding`);
    } catch (tagError: any) {
      console.warn(`[syncUserToMailgunList] Could not tag ${user.email}:`, tagError.message);
    }
  } catch (error: any) {
    // Log error
    const errorMessage = error.message || 'Unknown error';
    console.error(`[syncUserToMailgunList] Error syncing ${user.email}:`, errorMessage);
    console.error('[syncUserToMailgunList] Stack:', error.stack);

    await logSync({
      userId,
      email: user.email,
      name,
      action,
      status: 'error',
      errorMessage,
      responseJson: error.details || error,
    });

    // Don't throw - we don't want Mailgun sync failures to block user creation
  }
}

/**
 * Batch sync multiple users to Mailgun list
 * Useful for backfilling existing users
 */
export async function batchSyncUsersToMailgunList(
  users: SyncUserData[],
  action: 'signup' | 'backfill' | 'test' = 'backfill'
): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    synced: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const user of users) {
    try {
      await syncUserToMailgunList({ ...user, action });
      result.synced++;
    } catch (error: any) {
      result.failed++;
      result.errors.push(`${user.email}: ${error.message}`);
    }
  }

  return result;
}
