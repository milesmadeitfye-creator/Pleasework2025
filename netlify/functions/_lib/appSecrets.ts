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
