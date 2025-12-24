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
  console.log("[meta-get-custom-conversions] Request received");

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

    // Get ad account ID and pixel ID from query params
    const adAccountId = event.queryStringParameters?.ad_account_id;
    const pixelId = event.queryStringParameters?.pixel_id;

    if (!adAccountId) {
      return jsonResponse(400, { error: "Missing ad_account_id parameter" });
    }

    console.log("[meta-get-custom-conversions] Fetching custom conversions for ad account:", adAccountId, "pixel:", pixelId);

    // Fetch custom conversions from Meta API (ad account endpoint)
    const ccUrl = new URL(`https://graph.facebook.com/v20.0/act_${adAccountId}/customconversions`);
    ccUrl.searchParams.set("access_token", accessToken);
    ccUrl.searchParams.set("fields", "id,name,event_type,custom_event_type,rule,pixel_id");
    ccUrl.searchParams.set("limit", "100");

    const ccResponse = await fetch(ccUrl.toString());

    if (!ccResponse.ok) {
      const errorText = await ccResponse.text();
      console.error("[meta-get-custom-conversions] Meta API error:", errorText);
      return jsonResponse(500, {
        success: false,
        error: "Failed to fetch custom conversions from Meta",
      });
    }

    const ccData: any = await ccResponse.json();
    const allConversions = ccData.data || [];

    console.log("[meta-get-custom-conversions] Fetched custom conversions:", allConversions.length);

    // Filter to selected pixel if provided
    let filteredConversions = allConversions;
    if (pixelId) {
      filteredConversions = allConversions.filter((cc: any) => {
        // Strategy 1: Direct pixel_id match
        if (cc.pixel_id === pixelId) {
          return true;
        }
        // Strategy 2: Fallback - check if rule contains the pixel ID
        if (cc.rule && typeof cc.rule === 'string' && cc.rule.includes(pixelId)) {
          return true;
        }
        // Strategy 3: Check if rule object contains pixel reference
        if (cc.rule && typeof cc.rule === 'object') {
          const ruleStr = JSON.stringify(cc.rule);
          if (ruleStr.includes(pixelId)) {
            return true;
          }
        }
        return false;
      });
      console.log("[meta-get-custom-conversions] Filtered to pixel:", pixelId, "count:", filteredConversions.length);
    }

    return jsonResponse(200, {
      success: true,
      customConversions: filteredConversions,
    });
  } catch (err: any) {
    console.error("[meta-get-custom-conversions] Error:", err);
    return jsonResponse(500, {
      success: false,
      error: err.message || "Failed to fetch custom conversions",
    });
  }
};
