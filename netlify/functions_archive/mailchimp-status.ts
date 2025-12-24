import { Handler, HandlerEvent } from "@netlify/functions";
import {
  createServiceSupabase,
  getUserIdFromRequest,
} from "./_supabaseMailchimpUtils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const userId = await getUserIdFromRequest(event);

    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "not_authenticated" }),
      };
    }

    const supabase = createServiceSupabase();

    const { data, error } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "mailchimp")
      .maybeSingle();

    if (error) {
      console.error("[mailchimp-status] Supabase error:", error);

      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "db_error" }),
      };
    }

    if (!data) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ connected: false }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        connected: true,
        external_account_id: data.external_account_id,
        meta: data.meta,
      }),
    };
  } catch (err: any) {
    console.error("[mailchimp-status] Unexpected error:", err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "unexpected_error" }),
    };
  }
};

export { handler };
