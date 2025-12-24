/**
 * Supabase Secret Loader (Server-Only)
 * File: netlify/functions/_shared/secrets.ts
 *
 * Fetches secrets from public.app_secrets table using service role key
 * Includes in-memory caching with 5-minute TTL to reduce DB reads
 *
 * CRITICAL: This module is SERVER-ONLY. Never import from client code.
 */
import { createClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedSecret {
  value: string;
  expiresAt: number;
}

const secretCache = new Map<string, CachedSecret>();

/**
 * Get secret from Supabase app_secrets table with caching
 * Returns null if secret not found
 */
export async function getSecret(key: string): Promise<string | null> {
  // Check cache first
  const cached = secretCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[Secrets] Using cached value for: ${key}`);
    return cached.value;
  }

  // Fetch from database
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[Secrets] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[Secrets] Error fetching secret '${key}':`, error.message);
      return null;
    }

    if (!data) {
      console.warn(`[Secrets] Secret not found: ${key}`);
      return null;
    }

    // Cache the result
    secretCache.set(key, {
      value: data.value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    console.log(`[Secrets] Fetched and cached: ${key}`);
    return data.value;
  } catch (err: any) {
    console.error(`[Secrets] Unexpected error fetching secret '${key}':`, err.message);
    return null;
  }
}

/**
 * Get secret with required validation
 * Throws error if secret not found
 */
export async function requireSecret(key: string): Promise<string> {
  const value = await getSecret(key);

  if (!value) {
    throw new Error(`Required secret not found: ${key}`);
  }

  return value;
}

/**
 * Clear secret cache (useful for testing)
 */
export function clearSecretCache(): void {
  secretCache.clear();
  console.log("[Secrets] Cache cleared");
}
