import { supabase } from '@/lib/supabase.client';

export const META_OAUTH_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'ads_management',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
] as const;

export type MetaConnection = {
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

export type MetaOAuthData = {
  state: string;
  meta_user_id: string;
  meta_name: string;
  meta_email: string;
  access_token: string;
  token_type: string;
  expires_at: string | null;
};

/**
 * Generate a secure random state for OAuth CSRF protection
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the Meta OAuth authorization URL
 */
export function buildMetaAuthUrl(state: string): string {
  const metaAuthUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');

  metaAuthUrl.searchParams.set('client_id', import.meta.env.VITE_META_APP_ID || '');
  metaAuthUrl.searchParams.set('redirect_uri', import.meta.env.VITE_META_REDIRECT_URI || '');
  metaAuthUrl.searchParams.set('response_type', 'code');
  metaAuthUrl.searchParams.set('scope', META_OAUTH_SCOPES.join(','));
  metaAuthUrl.searchParams.set('state', state);

  return metaAuthUrl.toString();
}

/**
 * Upsert user Meta connection to Supabase
 */
export async function upsertUserMetaConnection(data: {
  meta_user_id: string;
  access_token: string;
  token_type?: string;
  expires_at?: string | null;
}): Promise<MetaConnection> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not logged in');
  }

  const { data: connection, error } = await supabase
    .from('user_meta_connections')
    .upsert(
      {
        user_id: user.id,
        meta_user_id: data.meta_user_id,
        access_token: data.access_token,
        token_type: data.token_type || 'bearer',
        expires_at: data.expires_at ?? null,
        meta_app_scopes: [...META_OAUTH_SCOPES],
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[metaOAuth] Failed to upsert connection:', error);
    throw error;
  }

  if (!connection) {
    throw new Error('Failed to save Meta connection');
  }

  return connection;
}

/**
 * Get user's Meta connection from Supabase
 */
export async function getUserMetaConnection(): Promise<MetaConnection | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_meta_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[metaOAuth] Failed to fetch connection:', error);
    throw error;
  }

  return data;
}

/**
 * Delete user's Meta connection
 */
export async function deleteUserMetaConnection(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not logged in');
  }

  const { error } = await supabase
    .from('user_meta_connections')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[metaOAuth] Failed to delete connection:', error);
    throw error;
  }
}

/**
 * Check if Meta connection is expired
 */
export function isMetaConnectionExpired(connection: MetaConnection | null): boolean {
  if (!connection || !connection.expires_at) {
    return false;
  }

  const expiresAt = new Date(connection.expires_at);
  const now = new Date();

  // Consider expired if within 1 hour of expiration
  const oneHour = 60 * 60 * 1000;
  return expiresAt.getTime() - now.getTime() < oneHour;
}
