/**
 * Application Configuration Helpers
 *
 * Provides functions to read/write application configuration from Supabase
 * instead of relying on large environment variables.
 */

import { supabaseAdmin } from "./_supabaseAdmin";

/**
 * Get an application configuration value by key
 *
 * @param key - Configuration key (typically the env var name)
 * @returns The configuration value, or null if not found
 */
export async function getAppConfig<T = any>(key: string): Promise<T | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error("[app_config] getAppConfig error", { key, error });
      return null;
    }

    if (!data) {
      console.warn("[app_config] No config found for key:", key);
      return null;
    }

    return (data.value as T) ?? null;
  } catch (err) {
    console.error("[app_config] getAppConfig exception", { key, err });
    return null;
  }
}

/**
 * Set or update an application configuration value
 *
 * @param key - Configuration key
 * @param value - Configuration value (any JSON-serializable data)
 */
export async function setAppConfig(key: string, value: any): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert(
        {
          key,
          value,
          updated_at: new Date().toISOString()
        },
        { onConflict: "key" }
      );

    if (error) {
      console.error("[app_config] setAppConfig error", { key, error });
      throw error;
    }

    console.log("[app_config] Successfully set config:", key);
  } catch (err) {
    console.error("[app_config] setAppConfig exception", { key, err });
    throw err;
  }
}

/**
 * Delete an application configuration value
 *
 * @param key - Configuration key to delete
 */
export async function deleteAppConfig(key: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("app_config")
      .delete()
      .eq("key", key);

    if (error) {
      console.error("[app_config] deleteAppConfig error", { key, error });
      throw error;
    }

    console.log("[app_config] Successfully deleted config:", key);
  } catch (err) {
    console.error("[app_config] deleteAppConfig exception", { key, err });
    throw err;
  }
}

/**
 * Get all application configuration keys and values
 *
 * @returns Array of all configuration entries
 */
export async function getAllAppConfig(): Promise<Array<{ key: string; value: any }>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_config")
      .select("key, value")
      .order("key");

    if (error) {
      console.error("[app_config] getAllAppConfig error", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("[app_config] getAllAppConfig exception", err);
    return [];
  }
}
