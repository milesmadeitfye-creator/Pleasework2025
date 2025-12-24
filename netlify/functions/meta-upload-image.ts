import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
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

    const body = JSON.parse(event.body || "{}");
    const { adAccountId, imageUrl } = body;

    console.log("[meta-upload-image] Uploading image for user:", user.id);

    const { data: metaConnection } = await supabase
      .from("user_meta_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!metaConnection || !metaConnection.access_token) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Meta account not connected" })
      };
    }

    const accessToken = metaConnection.access_token;

    const uploadRes = await fetch(
      `https://graph.facebook.com/v20.0/act_${adAccountId}/adimages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: imageUrl,
          access_token: accessToken
        })
      }
    );

    const uploadJson: any = await uploadRes.json();

    if (!uploadRes.ok || uploadJson.error) {
      console.error("[meta-upload-image] Upload error:", uploadJson);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: uploadJson.error?.message || "Failed to upload image"
        })
      };
    }

    const imageHash = uploadJson.images?.[imageUrl]?.hash;

    if (!imageHash) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No image hash returned" })
      };
    }

    console.log("[meta-upload-image] Image uploaded successfully:", imageHash);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        imageHash
      })
    };
  } catch (err: any) {
    console.error("[meta-upload-image] Fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
