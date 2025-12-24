/**
 * Mailchimp Import function
 * File: netlify/functions/mailchimp-import-contacts.ts
 *
 * Imports contacts from user's Mailchimp audience into Ghoste
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
      console.error("[Mailchimp Import] Auth error:", authError);
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

    console.log("[Mailchimp Import] Loading Mailchimp connection for user:", user.id.substring(0, 8));

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

    console.log("[Mailchimp Import] Connection found, initializing API...");

    const { mcFetch, ensureListId } = await withMailchimpApi(
      connection,
      supabase
    );

    const listId = await ensureListId(requestedListId);

    console.log(`[Mailchimp Import] Using list: ${listId}`);

    // Fetch all members from Mailchimp (paginated)
    let offset = 0;
    const count = 500;
    const allMembers: any[] = [];
    const maxMembers = 1000; // Limit for now

    console.log("[Mailchimp Import] Fetching members from Mailchimp...");

    while (allMembers.length < maxMembers) {
      const page = await mcFetch(
        `/lists/${listId}/members?count=${count}&offset=${offset}&status=subscribed`
      );

      if (page.members && page.members.length > 0) {
        allMembers.push(...page.members);
        console.log(
          `[Mailchimp Import] Fetched ${page.members.length} members (total: ${allMembers.length})`
        );
      }

      if (!page.members || page.members.length < count) {
        break; // Last page
      }

      offset += count;

      if (allMembers.length >= maxMembers) {
        console.log(
          `[Mailchimp Import] Reached limit of ${maxMembers} members`
        );
        break;
      }
    }

    console.log(
      `[Mailchimp Import] Total members fetched: ${allMembers.length}`
    );

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const member of allMembers) {
      try {
        const email = member.email_address;

        if (!email) {
          console.log("[Mailchimp Import] Skipping member without email");
          skipped++;
          continue;
        }

        const firstName = member.merge_fields?.FNAME || "";
        const lastName = member.merge_fields?.LNAME || "";

        // Check if contact already exists for THIS user
        const { data: existing } = await supabase
          .from("fan_contacts")
          .select("id, first_name, last_name, source")
          .eq("user_id", connection.user_id)
          .eq("email", email)
          .maybeSingle();

        if (existing) {
          // Update existing contact
          const { error: updateError } = await supabase
            .from("fan_contacts")
            .update({
              first_name: firstName || existing.first_name,
              last_name: lastName || existing.last_name,
              mailchimp_status: "synced",
              mailchimp_error: null,
              mailchimp_synced_at: new Date().toISOString(),
              source: existing.source || "Mailchimp Import",
            })
            .eq("id", existing.id);

          if (updateError) {
            console.error(
              `[Mailchimp Import] Failed to update ${email}:`,
              updateError
            );
            skipped++;
          } else {
            updated++;
          }
        } else {
          // Insert new contact
          const name =
            [firstName, lastName].filter(Boolean).join(" ") ||
            email.split("@")[0];

          const { error: insertError } = await supabase
            .from("fan_contacts")
            .insert({
              user_id: connection.user_id,
              owner_id: connection.user_id,
              email,
              name,
              first_name: firstName || null,
              last_name: lastName || null,
              source: "Mailchimp Import",
              consent_email: true,
              consent_sms: false,
              mailchimp_status: "synced",
              mailchimp_error: null,
              mailchimp_synced_at: new Date().toISOString(),
            });

          if (insertError) {
            console.error(
              `[Mailchimp Import] Failed to insert ${email}:`,
              insertError
            );
            skipped++;
          } else {
            imported++;
          }
        }
      } catch (err: any) {
        console.error("[Mailchimp Import] Error processing member:", err);
        skipped++;
      }
    }

    console.log(
      `[Mailchimp Import] Complete: ${imported} imported, ${updated} updated, ${skipped} skipped, ${allMembers.length} total`
    );

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: true,
        message: `Imported ${imported} new contacts, updated ${updated} existing`,
        imported,
        updated,
        skipped,
        total: allMembers.length,
      }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Import] Fatal error:", err);

    const errorMessage = err?.title
      ? `${err.title}: ${err.detail || err.message}`
      : err?.message || String(err);

    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        success: false,
        error: "MAILCHIMP_IMPORT_FAILED",
        message: errorMessage,
        details: err?.detail || err?.message || String(err),
      }),
    };
  }
};
