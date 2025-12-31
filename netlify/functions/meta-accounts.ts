import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    // Get user's Meta credentials (canonical source: meta_credentials table)
    const { data: metaConnection, error: connError } = await supabase
      .from("meta_credentials")
      .select("access_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connError) {
      console.error('[meta-accounts] Database error:', connError);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch Meta credentials" })
      };
    }

    // Auth check: Only require access_token (not assets like ad_account_id, page_id)
    // This allows fetching accounts for Configure Assets wizard
    if (!metaConnection || !metaConnection.access_token) {
      console.warn('[meta-accounts] No Meta token found for user:', user.id);
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "meta_auth_missing",
          message: "No Meta connection found. Please connect your Meta account first."
        })
      };
    }

    // Optional: Check token expiry if expires_at is set
    if (metaConnection.expires_at) {
      const expiresAt = new Date(metaConnection.expires_at);
      if (expiresAt < new Date()) {
        console.warn('[meta-accounts] Meta token expired for user:', user.id);
        return {
          statusCode: 401,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "meta_token_expired",
            message: "Meta token has expired. Please reconnect your Meta account."
          })
        };
      }
    }

    const response = await fetch(
      `https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_id,currency,business&access_token=${metaConnection.access_token}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Failed to fetch ad accounts");
    }

    const data: any = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        accounts: data.data || []
      })
    };

  } catch (err: any) {
    console.error('[meta-accounts] Error:', err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
