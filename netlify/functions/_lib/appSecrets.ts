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
