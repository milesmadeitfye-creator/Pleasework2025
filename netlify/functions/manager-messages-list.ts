import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * List manager messages for a user
 * GET /.netlify/functions/manager-messages-list?user_id=xxx&limit=20
 */

const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const userId = event.queryStringParameters?.user_id;
    const limit = parseInt(event.queryStringParameters?.limit || "20", 10);

    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "user_id required" }),
      };
    }

    const supabase = getSupabaseAdmin();

    const { data: messages, error } = await supabase
      .from("ghoste_agent_messages")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[manager-messages-list] error", error);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Failed to fetch messages" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true, messages: messages || [] }),
    };
  } catch (err: any) {
    console.error("[manager-messages-list] error", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
