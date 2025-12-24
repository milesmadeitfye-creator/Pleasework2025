import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[meta-get-pixels] Request received");

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    // Get Meta connection
    const { data: metaConnection, error: metaError } = await supabase
      .from("user_meta_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (metaError || !metaConnection) {
      return jsonResponse(400, { error: "Meta account not connected" });
    }

    const accessToken = metaConnection.access_token;

    // Get ad account ID from query params
    const adAccountId = event.queryStringParameters?.ad_account_id;
    if (!adAccountId) {
      return jsonResponse(400, { error: "Missing ad_account_id parameter" });
    }

    // Remove 'act_' prefix if present
    const normalizedAdAccountId = adAccountId.replace(/^act_/, "");

    console.log("[meta-get-pixels] Fetching pixels for ad account:", normalizedAdAccountId);

    // Fetch pixels from Meta API
    const pixelsRes = await fetch(
      `https://graph.facebook.com/v19.0/act_${normalizedAdAccountId}/adspixels`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    ).then((res) =>
      res.text().then((text) => {
        const url = new URL(res.url);
        url.searchParams.set("access_token", accessToken);
        url.searchParams.set("fields", "id,name");
        url.searchParams.set("limit", "100");
        return fetch(url.toString());
      })
    );

    // Simpler approach: construct URL with params
    const pixelUrl = new URL(`https://graph.facebook.com/v19.0/act_${normalizedAdAccountId}/adspixels`);
    pixelUrl.searchParams.set("access_token", accessToken);
    pixelUrl.searchParams.set("fields", "id,name");
    pixelUrl.searchParams.set("limit", "100");

    const pixelsResponse = await fetch(pixelUrl.toString());

    if (!pixelsResponse.ok) {
      const errorText = await pixelsResponse.text();
      console.error("[meta-get-pixels] Meta API error:", errorText);
      return jsonResponse(500, {
        success: false,
        error: "Failed to fetch pixels from Meta",
      });
    }

    const pixelsData: any = await pixelsResponse.json();

    console.log("[meta-get-pixels] Fetched pixels:", pixelsData.data?.length || 0);

    return jsonResponse(200, {
      success: true,
      pixels: pixelsData.data || [],
    });
  } catch (err: any) {
    console.error("[meta-get-pixels] Error:", err);
    return jsonResponse(500, {
      success: false,
      error: err.message || "Failed to fetch pixels",
    });
  }
};
