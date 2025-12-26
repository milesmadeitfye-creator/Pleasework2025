import { createClient } from "@supabase/supabase-js";

export function getAdminSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function upsertGlobalSecret(key: string, value: string) {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("app_secrets")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  if (error) throw error;
}

export async function getGlobalSecret(key: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
}

export async function getGlobalSecrets(keys: string[]): Promise<Record<string, string | null>> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", keys);

  if (error) throw error;

  const result: Record<string, string | null> = {};
  keys.forEach(k => result[k] = null);

  if (data) {
    data.forEach(row => {
      result[row.key] = row.value;
    });
  }

  return result;
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('[appSecrets] Missing SUPABASE_URL');
  if (!serviceKey) throw new Error('[appSecrets] Missing SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function upsertAppSecret(userId: string, key: string, value: string): Promise<void> {
  if (!userId) throw new Error('[appSecrets] userId required');
  if (!key) throw new Error('[appSecrets] key required');
  if (typeof value !== 'string') throw new Error('[appSecrets] value must be string');

  const supabase = getServiceClient();

  const { error } = await supabase
    .from('user_app_secrets')
    .upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );

  if (error) throw new Error(`[appSecrets] upsertAppSecret failed: ${error.message}`);
}

export async function getAppSecret(userId: string, key: string): Promise<string | null> {
  if (!userId) throw new Error('[appSecrets] userId required');
  if (!key) throw new Error('[appSecrets] key required');

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('user_app_secrets')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`[appSecrets] getAppSecret failed: ${error.message}`);
  return data?.value ?? null;
}

export async function getAppSecrets(userId: string, keys: string[]): Promise<Record<string, string | null>> {
  if (!userId) throw new Error('[appSecrets] userId required');

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('user_app_secrets')
    .select('key, value')
    .eq('user_id', userId)
    .in('key', keys);

  if (error) throw new Error(`[appSecrets] getAppSecrets failed: ${error.message}`);

  const result: Record<string, string | null> = {};
  keys.forEach(k => result[k] = null);

  if (data) {
    data.forEach(row => {
      result[row.key] = row.value;
    });
  }

  return result;
}

// In-memory cache for config (1 minute TTL)
let configCache: { data: Record<string, string>; timestamp: number } | null = null;
const CONFIG_CACHE_TTL = 60 * 1000; // 1 minute

export interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  STRIPE_SECRET_KEY: string | null;
  APP_BASE_URL: string;
}

/**
 * Load app configuration from environment variables or app_secrets table.
 *
 * Priority order:
 * 1. Environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required)
 * 2. Global app_secrets table for SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, etc.
 *
 * Results are cached for 1 minute to avoid repeated DB queries.
 */
export async function loadAppConfig(): Promise<AppConfig> {
  // Check cache first
  if (configCache && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL) {
    console.log('[appSecrets] Using cached config');
    return {
      SUPABASE_URL: configCache.data.SUPABASE_URL,
      SUPABASE_ANON_KEY: configCache.data.SUPABASE_ANON_KEY,
      STRIPE_SECRET_KEY: configCache.data.STRIPE_SECRET_KEY || null,
      APP_BASE_URL: configCache.data.APP_BASE_URL || 'https://ghoste.one',
    };
  }

  console.log('[appSecrets] Loading config from env + app_secrets...');

  // Required env vars for server-side operations
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('[appSecrets] SUPABASE_URL environment variable is required');
  }

  if (!serviceRoleKey) {
    throw new Error('[appSecrets] SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  }

  const config: Record<string, string> = {
    SUPABASE_URL: supabaseUrl,
    APP_BASE_URL: process.env.APP_BASE_URL || 'https://ghoste.one',
  };

  try {
    // Fetch additional config from app_secrets table
    const secrets = await getGlobalSecrets([
      'SUPABASE_ANON_KEY',
      'STRIPE_SECRET_KEY',
    ]);

    // Use app_secrets values, fallback to env vars
    config.SUPABASE_ANON_KEY = secrets.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    config.STRIPE_SECRET_KEY = secrets.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';

    console.log('[appSecrets] Config loaded:', {
      SUPABASE_URL: '✓',
      SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY ? '✓' : '✗',
      STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY ? '✓' : '✗',
      APP_BASE_URL: config.APP_BASE_URL,
    });

    // Validate required keys
    if (!config.SUPABASE_ANON_KEY) {
      throw new Error(
        'SUPABASE_ANON_KEY not found in environment variables or app_secrets table. ' +
        'Add it to the app_secrets table or environment variables.'
      );
    }

    // Cache the result
    configCache = {
      data: config,
      timestamp: Date.now(),
    };

    return {
      SUPABASE_URL: config.SUPABASE_URL,
      SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,
      STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY || null,
      APP_BASE_URL: config.APP_BASE_URL,
    };
  } catch (err: any) {
    console.error('[appSecrets] Failed to load config:', err);
    throw new Error(`Failed to load app configuration: ${err.message}`);
  }
}

/**
 * Clear the config cache (useful for testing or after config updates)
 */
export function clearConfigCache(): void {
  configCache = null;
  console.log('[appSecrets] Config cache cleared');
}
