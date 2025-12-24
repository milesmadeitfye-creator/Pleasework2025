import { getSupabaseAdmin } from "./_supabaseAdmin";

export const SB_URL = process.env.SUPABASE_URL!;
export const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const sb = getSupabaseAdmin();
export const supabase = sb;

export const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export function getQueryParam(event: any, key: string) {
  return event?.queryStringParameters?.[key] || null;
}
