import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : null;
    const { userId, email, name, source } = body || {};

    if (!userId || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing userId or email" }),
      };
    }

    console.log("[add-fan-contact] Adding contact:", { userId: userId.substring(0, 8), email, source });

    const { error } = await supabase
      .from("fan_contacts")
      .upsert(
        {
          user_id: userId,
          email,
          name: name || null,
          source: source || "unknown",
          mailchimp_status: "pending",
        },
        {
          onConflict: "user_id,email",
        }
      );

    if (error) {
      console.error("[add-fan-contact] upsert error", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Failed to save fan contact" }),
      };
    }

    console.log("[add-fan-contact] Contact saved successfully");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("[add-fan-contact] unexpected error", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Unexpected server error" }),
    };
  }
};
