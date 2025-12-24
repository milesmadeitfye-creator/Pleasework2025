import type { Handler } from "@netlify/functions";
import { corsHeaders } from "./_headers";
import {
  makeSupabase,
  getMailchimpConnection,
  withMailchimpApi,
} from "./_mailchimp";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { listId, newListName } = body as {
      listId?: string;
      newListName?: string;
    };

    const supabase = makeSupabase();
    const connection = await getMailchimpConnection(supabase);
    const { mcFetch } = await withMailchimpApi(connection, supabase);

    let finalListId: string;

    if (listId) {
      console.log(`[Mailchimp Set List] Using existing list: ${listId}`);
      finalListId = listId;
    } else if (newListName && newListName.trim().length > 0) {
      console.log(`[Mailchimp Set List] Creating new list: ${newListName}`);

      const created = await mcFetch(`/lists`, {
        method: "POST",
        body: JSON.stringify({
          name: newListName.trim(),
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

      finalListId = created.id as string;
      console.log(`[Mailchimp Set List] Created new list: ${finalListId}`);
    } else {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "listId or newListName required" }),
      };
    }

    // Update default_list_id in database
    await supabase
      .from("mailchimp_connections")
      .update({ default_list_id: finalListId })
      .eq("id", connection.id);

    console.log(`[Mailchimp Set List] Updated default_list_id to: ${finalListId}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ listId: finalListId }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Set List] error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to set Mailchimp list",
        details: err?.message || String(err),
      }),
    };
  }
};
