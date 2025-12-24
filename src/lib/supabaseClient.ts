import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// Runtime guard to catch missing env vars
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase env missing:", {
    url: !!supabaseUrl,
    anonKey: !!supabaseAnonKey,
  });
  throw new Error("Supabase client missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

// Validate URL format
if (supabaseUrl && !supabaseUrl.startsWith("https://")) {
  console.warn("VITE_SUPABASE_URL does not start with https://", supabaseUrl);
}

// Dev-only check to ensure correct Supabase environment
if (import.meta.env.DEV) {
  console.log("[SUPABASE_URL]", import.meta.env.VITE_SUPABASE_URL);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

console.log("🔗 Supabase Initialized:", {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  keyLength: supabaseAnonKey?.length,
  functionsUrl: `${supabaseUrl}/functions/v1`,
});
