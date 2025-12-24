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

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = makeSupabase();
    const connection = await getMailchimpConnection(supabase);
    const { mcFetch } = await withMailchimpApi(connection, supabase);

    console.log("[Mailchimp Get Lists] Fetching lists...");

    const listsResp = await mcFetch(`/lists?count=100&offset=0`);
    const lists = (listsResp.lists || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      member_count: l.stats?.member_count ?? 0,
    }));

    console.log(`[Mailchimp Get Lists] Found ${lists.length} lists`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        lists,
        default_list_id: connection.default_list_id || null,
      }),
    };
  } catch (err: any) {
    console.error("[Mailchimp Get Lists] error:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Failed to fetch Mailchimp lists",
        details: err?.message || String(err),
      }),
    };
  }
};
