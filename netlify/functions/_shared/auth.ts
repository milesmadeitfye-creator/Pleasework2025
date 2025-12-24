// netlify/functions/_shared/auth.ts
import { createClient } from "@supabase/supabase-js";

export async function getUserFromAuthHeader(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.error("[getUserFromAuthHeader] Error:", error.message);
    return null;
  }

  return data?.user ?? null;
}
