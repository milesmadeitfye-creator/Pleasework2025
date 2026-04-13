import { getServiceClient } from './supabaseAdmin';

/**
 * Secrets resolver — pulls API keys from multiple sources:
 *   1. process.env (Netlify env vars) — highest priority
 *   2. app_secrets table — platform-level keys (OpenAI, Anthropic, etc.)
 *   3. meta_credentials table — Meta tokens per-user (uses first active)
 *   4. google_ads_credentials table — Google Ads tokens per-user
 *
 * This means the internal panel is self-configuring: as long as
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY are set
 * on Netlify, everything else is pulled from the DB automatically.
 */

// In-memory cache (Netlify functions are short-lived, so this caches per-invocation)
const cache: Record<string, string | null> = {};

/**
 * Get a secret by name. Checks env vars first, then app_secrets table.
 */
export async function getSecret(key: string): Promise<string | null> {
  // 1. Check env var
  const envVal = process.env[key];
  if (envVal) return envVal;

  // 2. Check cache
  if (key in cache) return cache[key];

  // 3. Check app_secrets table
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from('app_secrets')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (!error && data?.value) {
      cache[key] = data.value;
      return data.value;
    }
  } catch (err) {
    console.warn(`[secrets] Failed to fetch "${key}" from app_secrets:`, err);
  }

  cache[key] = null;
  return null;
}

/**
 * Get multiple secrets at once (batched query).
 */
export async function getSecrets(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const missing: string[] = [];

  // Check env vars and cache first
  for (const key of keys) {
    const envVal = process.env[key];
    if (envVal) {
      result[key] = envVal;
    } else if (key in cache) {
      result[key] = cache[key];
    } else {
      missing.push(key);
      result[key] = null;
    }
  }

  // Batch fetch missing from DB
  if (missing.length > 0) {
    try {
      const sb = getServiceClient();
      const { data, error } = await sb
        .from('app_secrets')
        .select('key, value')
        .in('key', missing);

      if (!error && data) {
        for (const row of data) {
          result[row.key] = row.value;
          cache[row.key] = row.value;
        }
      }
    } catch (err) {
      console.warn('[secrets] Batch fetch from app_secrets failed:', err);
    }
  }

  return result;
}

/**
 * Get Meta credentials (access token, ad account, page ID).
 * Checks env vars first, then meta_credentials table.
 */
export async function getMetaCredentials(): Promise<{
  accessToken: string | null;
  adAccountId: string | null;
  pageId: string | null;
}> {
  // Check env vars first
  const envToken = process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  const envAccount = process.env.META_AD_ACCOUNT_ID;
  const envPage = process.env.META_PAGE_ID;

  if (envToken && envAccount) {
    return {
      accessToken: envToken,
      adAccountId: envAccount.replace('act_', ''),
      pageId: envPage || null,
    };
  }

  // Pull from meta_credentials table (first active connection)
  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from('meta_credentials')
      .select('access_token, system_user_token, ad_account_id, page_id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const token = data.system_user_token || data.access_token;
      return {
        accessToken: token || null,
        adAccountId: (data.ad_account_id || '').replace('act_', ''),
        pageId: data.page_id || null,
      };
    }
  } catch (err) {
    console.warn('[secrets] Failed to fetch meta_credentials:', err);
  }

  return { accessToken: null, adAccountId: null, pageId: null };
}

/**
 * Get Google Ads credentials.
 * Checks env vars first, then google_ads_credentials table.
 */
export async function getGoogleAdsCredentials(): Promise<{
  developerToken: string | null;
  customerId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  accessToken: string | null;
}> {
  // Check env vars first
  const envDev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const envCustomer = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const envRefresh = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (envDev && envCustomer && envRefresh) {
    return {
      developerToken: envDev,
      customerId: envCustomer,
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || null,
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || null,
      refreshToken: envRefresh,
      accessToken: null,
    };
  }

  // Pull from google_ads_credentials table + app_secrets
  try {
    const sb = getServiceClient();

    // Get user-level credentials
    const { data: creds, error: credsErr } = await sb
      .from('google_ads_credentials')
      .select('customer_id, access_token, refresh_token')
      .limit(1)
      .maybeSingle();

    // Get app-level keys from app_secrets
    const secrets = await getSecrets([
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
    ]);

    if (!credsErr && creds) {
      return {
        developerToken: secrets.GOOGLE_ADS_DEVELOPER_TOKEN || null,
        customerId: creds.customer_id || null,
        clientId: secrets.GOOGLE_ADS_CLIENT_ID || secrets.GOOGLE_CLIENT_ID || null,
        clientSecret: secrets.GOOGLE_ADS_CLIENT_SECRET || secrets.GOOGLE_CLIENT_SECRET || null,
        refreshToken: creds.refresh_token || null,
        accessToken: creds.access_token || null,
      };
    }
  } catch (err) {
    console.warn('[secrets] Failed to fetch google_ads_credentials:', err);
  }

  return {
    developerToken: null,
    customerId: null,
    clientId: null,
    clientSecret: null,
    refreshToken: null,
    accessToken: null,
  };
}
