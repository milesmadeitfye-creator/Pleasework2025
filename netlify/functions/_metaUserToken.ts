/**
 * Utility for fetching and using user Meta tokens from Supabase
 *
 * This allows Meta API operations to use the logged-in user's access token
 * instead of a system-wide token.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type UserMetaConnection = {
  id: string;
  user_id: string;
  meta_user_id: string | null;
  meta_app_scopes: string[] | null;
  access_token: string | null;
  token_type: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Get user's Meta connection from database
 */
export async function getUserMetaToken(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_meta_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getUserMetaToken] Database error:', error);
    throw new Error('Failed to fetch Meta connection from database');
  }

  if (!data) {
    throw new Error('No Meta connection found. Please connect your Meta account first.');
  }

  if (!data.access_token) {
    throw new Error('Meta access token is missing. Please reconnect your Meta account.');
  }

  // Check if token is expired
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      throw new Error('Meta access token has expired. Please reconnect your Meta account.');
    }
  }

  return data.access_token;
}

/**
 * Get user's Meta connection data (for checking scopes, etc.)
 */
export async function getUserMetaConnection(userId: string): Promise<UserMetaConnection | null> {
  const { data, error } = await supabase
    .from('user_meta_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getUserMetaConnection] Database error:', error);
    return null;
  }

  return data;
}

/**
 * Check if user has Meta connection
 */
export async function hasMetaConnection(userId: string): Promise<boolean> {
  const connection = await getUserMetaConnection(userId);
  return !!(connection && connection.access_token);
}
