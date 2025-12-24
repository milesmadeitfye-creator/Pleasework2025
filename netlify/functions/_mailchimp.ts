/**
 * Mailchimp: part of the Ghoste.one integration.
 * Shared helper functions for Mailchimp Netlify functions.
 *
 * IMPORTANT: This module MUST be build-safe.
 * - Do NOT throw on import if env vars are missing.
 * - All failures happen inside functions, not at module load time.
 */
import { getSupabaseAdmin } from "./_supabaseAdmin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Environment variables - must be set in Netlify UI
export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const FALLBACK_MAILCHIMP_DC = process.env.MAILCHIMP_DEFAULT_DC || "us13";

export type MailchimpConnection = {
  id: string;
  user_id: string;
  access_token: string;
  server_prefix?: string | null;
  data_center?: string | null;
  dc?: string | null;
  default_list_id?: string | null;
};

export type MailchimpError = {
  isMailchimpError: true;
  status: number;
  title?: string;
  detail?: string;
};

/**
 * Create Supabase admin client
 * Throws if env vars are not configured - caller should catch this
 */
export function makeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return getSupabaseAdmin();
}

export function makeMailchimpError(status: number, json: any): MailchimpError {
  return {
    isMailchimpError: true,
    status,
    title: json?.title,
    detail: json?.detail,
  };
}

/**
 * Get Mailchimp connection for a specific user
 *
 * @param supabase - Supabase client
 * @param userId - User ID to get connection for
 * @returns MailchimpConnection or null if not found
 */
export async function getMailchimpConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<MailchimpConnection | null> {
  // Query user_integrations table for this specific user's Mailchimp connection
  const { data, error } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "mailchimp")
    .maybeSingle();

  if (error) {
    console.error("[getMailchimpConnection] Error:", error);
    return null;
  }

  if (!data) {
    console.log("[getMailchimpConnection] No Mailchimp connection found for user", userId.substring(0, 8));
    return null;
  }

  if (!data.access_token) {
    console.log("[getMailchimpConnection] Mailchimp connection found but no access_token for user", userId.substring(0, 8));
    return null;
  }

  // Map user_integrations schema to MailchimpConnection type
  return {
    id: data.id,
    user_id: data.user_id,
    access_token: data.access_token,
    server_prefix: data.server_prefix || data.mailchimp_dc,
    data_center: data.mailchimp_dc,
    dc: data.mailchimp_dc,
    default_list_id: data.mailchimp_list_id,
  } as MailchimpConnection;
}

export async function withMailchimpApi(
  rawConnection: MailchimpConnection,
  supabase: SupabaseClient
) {
  const connection = rawConnection;
  if (!connection.access_token) {
    throw new Error("Mailchimp access token missing");
  }

  const server_prefix =
    connection.server_prefix ||
    connection.data_center ||
    connection.dc ||
    FALLBACK_MAILCHIMP_DC;

  if (!server_prefix) {
    throw new Error("Mailchimp data center not configured");
  }

  const apiBase = `https://${server_prefix}.api.mailchimp.com/3.0`;

  const mcFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
        ...(init?.headers || {}),
      },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw makeMailchimpError(res.status, json);
    }
    return json;
  };

  async function ensureListId(requestedListId?: string | null): Promise<string> {
    // 1) If caller explicitly passed a listId, trust and use it
    if (requestedListId && requestedListId.trim().length > 0) {
      return requestedListId;
    }

    // 2) If connection has default_list_id, use that
    if (
      connection.default_list_id &&
      connection.default_list_id.trim().length > 0
    ) {
      return connection.default_list_id;
    }

    // 3) Fallback: first existing list or create a new one
    const listsResp = await mcFetch(`/lists?count=1&offset=0`);
    if (listsResp.total_items > 0 && listsResp.lists?.[0]?.id) {
      const listId = listsResp.lists[0].id as string;
      await supabase
        .from("mailchimp_connections")
        .update({ default_list_id: listId })
        .eq("id", connection.id);
      return listId;
    }

    // Create new list
    const created = await mcFetch(`/lists`, {
      method: "POST",
      body: JSON.stringify({
        name: "Ghoste Fans",
        permission_reminder:
          "You are receiving this email because you signed up via Ghoste.",
        email_type_option: false,
        contact: {
          company: "Ghoste",
          address1: "N/A",
          city: "N/A",
          state: "N/A",
          zip: "00000",
          country: "US",
        },
        campaign_defaults: {
          from_name: "Ghoste",
          from_email: "no-reply@ghoste.one",
          subject: "",
          language: "en",
        },
      }),
    });

    const listId = created.id as string;
    await supabase
      .from("mailchimp_connections")
      .update({ default_list_id: listId })
      .eq("id", connection.id);

    return listId;
  }

  return { mcFetch, ensureListId };
}
