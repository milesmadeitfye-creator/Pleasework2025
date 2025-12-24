import { supabaseAdmin } from "./_supabaseAdmin";

export type MetaCreds = {
  accessToken: string;
  adAccountId: string;
};

export function normalizeAct(adAccountId: string): string {
  if (!adAccountId) return '';
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

/**
 * Get Meta credentials for a user from existing connections.
 * Reads from user_meta_connections table (already used by Ad Campaigns).
 * DO NOT modify this table or connection saving logic.
 */
export async function getMetaCredsForUser(userId: string): Promise<MetaCreds> {
  const { data, error } = await supabaseAdmin
    .from('user_meta_connections')
    .select('access_token, ad_account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Meta not connected for user. Please connect Meta in Ad Campaigns first.');
  }

  if (!data.access_token) {
    throw new Error('Meta access token missing. Please reconnect Meta.');
  }

  if (!data.ad_account_id) {
    throw new Error('Meta ad account not selected. Please select an ad account in Ad Campaigns.');
  }

  return {
    accessToken: data.access_token,
    adAccountId: data.ad_account_id,
  };
}

/**
 * Fetch data from Meta Graph API
 */
export async function metaFetch<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/v20.0/${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString(), { method: 'GET' });
  const json = await res.json();

  if (!res.ok) {
    const msg = json?.error?.message ?? 'Meta API error';
    throw new Error(msg);
  }

  return json as T;
}

/**
 * Post data to Meta Graph API
 */
export async function metaPost<T>(
  accessToken: string,
  path: string,
  body: Record<string, any>
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/v20.0/${path}`);
  url.searchParams.set('access_token', accessToken);

  const form = new URLSearchParams();
  Object.entries(body).forEach(([k, v]) => {
    form.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  });

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const json = await res.json();

  if (!res.ok) {
    const msg = json?.error?.message ?? 'Meta API error';
    throw new Error(msg);
  }

  return json as T;
}
