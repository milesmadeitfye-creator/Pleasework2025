/**
 * Mailchimp Sync function
 * File: netlify/functions/mailchimp-sync-contacts.ts
 *
 * Syncs Ghoste fan_contacts to user's Mailchimp audience
 */
import type { Handler } from "@netlify/functions";
import {
  makeSupabase,
  getMailchimpConnection,
  withMailchimpApi,
} from "./_mailchimp";

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type FanContact = {
  id: string;
  email: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  mailchimp_status?: string | null;
  mailchimp_error?: string | null;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const requestedListId: string | undefined = body.listId;

    const supabase = makeSupabase();

    // Get authenticated user from JWT
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required",
        }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[Mailchimp Sync] Auth error:", authError);
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "UNAUTHORIZED",
          message: "Invalid authentication token",
        }),
      };
    }

    console.log("[Mailchimp Sync] Loading Mailchimp connection for user:", user.id.substring(0, 8));

    const connection = await getMailchimpConnection(supabase, user.id);

    if (!connection) {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: false,
          code: "MAILCHIMP_NOT_CONNECTED",
          message: "Mailchimp is not connected. Please connect your account first.",
        }),
      };
    }

    console.log("[Mailchimp Sync] Loading pending contacts for user...");

    // Load contacts for this specific user only
    const { data: allContacts, error: contactsError } = await supabase
      .from("fan_contacts")
      .select("*")
      .eq("user_id", connection.user_id);

    if (contactsError) {
      console.error("[Mailchimp Sync] Supabase contacts error:", contactsError);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: false,
          error: "DATABASE_ERROR",
          message: "Failed to load contacts from database",
          details: contactsError.message,
        }),
      };
    }

    // Filter pending contacts (null or "pending" mailchimp_status)
    const pendingContacts =
      allContacts?.filter(
        (c) => !c.mailchimp_status || c.mailchimp_status === "pending"
      ) ?? [];

    console.log(
      `[Mailchimp Sync] Found ${pendingContacts.length} pending contacts (${
        allContacts?.length || 0
      } total)`
    );

    if (pendingContacts.length === 0) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          success: true,
          message: "No pending contacts to sync",
          synced: 0,
          newSynced: 0,
          alreadySynced: 0,
          failed: 0,
          total: 0,
        }),
      };
    }

    console.log("[Mailchimp Sync] Connection found, initializing API...");

    const { mcFetch, ensureListId } = await withMailchimpApi(
      connection,
      supabase
    );

    const listId = await ensureListId(requestedListId);

    console.log(`[Mailchimp Sync] Using list: ${listId}`);

    let newSynced = 0;
    let alreadySynced = 0;
    let failed = 0;

    for (const contact of pendingContacts) {
      try {
        if (!contact.email) {
          console.log(
            `[Mailchimp Sync] Skipping contact without email: ${contact.id}`
          );
          failed++;
          continue;
        }

        const nameParts = (contact.name || "").split(" ");
        const firstName = contact.first_name || nameParts[0] || "";
        const lastName = contact.last_name || nameParts.slice(1).join(" ") || "";

        console.log(`[Mailchimp Sync] Syncing: ${contact.email}`);

        await mcFetch(`/lists/${listId}/members`, {
          method: "POST",
          body: JSON.stringify({
            email_address: contact.email,
            status: "subscribed",
            merge_fields: {
              FNAME: firstName,
              LNAME: lastName,
              SOURCE: contact.source || "Ghoste",
            },
          }),
        });

        newSynced++;

        await supabase
          .from("fan_contacts")
          .update({
            mailchimp_status: "synced",
            mailchimp_error: null,
            mailchimp_synced_at: new Date().toISOString(),
          })
          .eq("id", contact.id);

        console.log(`[Mailchimp Sync] ✓ Synced: ${contact.email}`);
      } catch (err: any) {
        const errTitle = err.title || "";
        const errDetail = err.detail || err.message || "";

        // Check if this is a "Member Exists" error
        if (
          errTitle === "Member Exists" ||
          errDetail.includes("already a list member") ||
          errDetail.includes("is already a list member")
        ) {
          console.log(`[Mailchimp Sync] ⚠ Already exists: ${contact.email}`);
          alreadySynced++;

          await supabase
            .from("fan_contacts")
            .update({
              mailchimp_status: "synced",
              mailchimp_error: null,
              mailchimp_synced_at: new Date().toISOString(),
            })
            .eq("id", contact.id);

          continue;
        }

        // Real failure
        console.error(
          `[Mailchimp Sync] ✗ Failed to sync ${contact.email}:`,
          err.message
        );
        failed++;

        await supabase
          .from("fan_contacts")
          .update({
            mailchimp_status: "pending",
            mailchimp_error: err?.message || "Mailchimp sync failed",
          })
          .eq("id", contact.id);
      }
    }

    const synced = newSynced + alreadySynced;

    console.log(
      `[Mailchimp Sync] Complete: ${newSynced} new, ${alreadySynced} existing, ${failed} failed, ${pendingContacts.length} total`
    );

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        message: `Synced ${synced} contacts successfully`,
        synced,
        newSynced,
        alreadySynced,
        failed,
        total: pendingContacts.length,
      }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Sync] Fatal error:", err);

    const errorMessage = err?.title
      ? `${err.title}: ${err.detail || err.message}`
      : err?.message || String(err);

    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "MAILCHIMP_SYNC_FAILED",
        message: errorMessage,
        details: err?.detail || err?.message || String(err),
      }),
    };
  }
};
