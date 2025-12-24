/**
 * Safe Environment Variable Access
 *
 * Provides guarded access to environment variables with automatic
 * logging when required variables are missing.
 */

import { logDiag } from "./diagnostics";

/**
 * Get an environment variable safely
 * @param key - The environment variable key (with or without VITE_ prefix)
 * @param required - If true, logs a warning when the variable is missing
 * @returns The variable value or empty string if not found
 */
export function env(key: string, required = false): string {
  // Add VITE_ prefix if not present for Vite env vars
  const viteKey = key.startsWith("VITE_") ? key : `VITE_${key}`;

  const value = (import.meta.env as any)?.[viteKey] || (import.meta.env as any)?.[key] || "";

  if (required && !value) {
    logDiag({
      level: "warn",
      type: "build",
      message: `Missing required environment variable: ${key}`,
      extra: { key, viteKey },
    });
  }

  return value;
}

/**
 * Check if an environment variable exists
 */
export function hasEnv(key: string): boolean {
  const viteKey = key.startsWith("VITE_") ? key : `VITE_${key}`;
  return !!((import.meta.env as any)?.[viteKey] || (import.meta.env as any)?.[key]);
}

/**
 * Get all available environment variables (for diagnostics)
 * Note: Only returns boolean flags, never actual values
 */
export function getEnvFlags(): Record<string, boolean> {
  const env = import.meta.env as any;
  const flags: Record<string, boolean> = {};

  // Common env vars to check
  const keys = [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_META_APP_ID",
    "VITE_META_REDIRECT_URI",
    "VITE_FUNCTIONS_ORIGIN",
    "VITE_SITE_URL",
    "MODE",
    "DEV",
    "PROD",
    "SSR",
  ];

  for (const key of keys) {
    flags[key] = !!(env?.[key]);
  }

  return flags;
}
