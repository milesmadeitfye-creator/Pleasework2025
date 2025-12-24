/**
 * Mailchimp: part of the Ghoste.one integration.
 * Frontend helper for Mailchimp connections.
 *
 * IMPORTANT: This module MUST be build-safe.
 * - No server-side env vars (use only import.meta.env.VITE_* if needed).
 * - No Node-only modules (Mailchimp SDK stays in Netlify functions).
 * - All API calls go through Netlify functions, not direct to Mailchimp.
 */
import { SupabaseClient } from '@supabase/supabase-js';

export interface MailchimpConnection {
  id: string;
  user_id: string;
  access_token: string;
  api_key: string | null;
  mailchimp_dc: string | null;
  mailchimp_account_id: string | null;
  mailchimp_list_id: string | null;
  mailchimp_list_name: string | null;
  mailchimp_status: string | null;
  server_prefix: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  data_center?: string | null;
  api_endpoint?: string | null;
}

/**
 * Get Mailchimp connection for a user
 *
 * Queries the user_integrations table for the current user's Mailchimp connection.
 * Returns the connection if it exists and has a valid access_token.
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to query for
 * @returns Connection data and error (if any)
 */
export async function getMailchimpConnectionForUser(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'mailchimp')
    .maybeSingle();

  if (data) {
    data.data_center = data.mailchimp_dc;
    data.api_endpoint = data.server_prefix ? `https://${data.server_prefix}.api.mailchimp.com/3.0` : null;
  }

  return { connection: data as MailchimpConnection | null, error };
}

/**
 * Check if Mailchimp is connected for a user
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID to check
 * @returns Boolean indicating if Mailchimp is connected
 */
export async function isMailchimpConnected(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { connection } = await getMailchimpConnectionForUser(supabase, userId);
  return !!connection && !!connection.access_token;
}
