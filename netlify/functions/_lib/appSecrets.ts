import { createClient } from "@supabase/supabase-js";

export function getAdminSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function upsertAppSecret(user_id: string, key: string, value: string) {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("app_secrets")
    .upsert(
      { user_id, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );

  if (error) throw error;
}

export async function getAppSecret(user_id: string, key: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("value")
    .eq("user_id", user_id)
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
}

export async function getAppSecrets(user_id: string, keys: string[]): Promise<Record<string, string | null>> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .eq("user_id", user_id)
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
