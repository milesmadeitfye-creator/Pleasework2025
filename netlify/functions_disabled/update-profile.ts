import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    const authHeader =
      event.headers.authorization || event.headers.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[update-profile] Missing auth header");
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          error: "Missing auth token",
        }),
      };
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const {
      data: userData,
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      console.error("[update-profile] Invalid user:", userError);
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          error: "Invalid user",
        }),
      };
    }

    const user = userData.user;
    console.log("[update-profile] User ID:", user.id);

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "Missing request body",
        }),
      };
    }

    const body = JSON.parse(event.body) as {
      meta_pixel_id?: string;
      tiktok_pixel_id?: string;
      meta_conversions_token?: string;
    };

    const updateData: Record<string, string | null> = {};

    if (body.meta_pixel_id !== undefined) {
      updateData.meta_pixel_id = (body.meta_pixel_id || "").trim() || null;
    }
    if (body.tiktok_pixel_id !== undefined) {
      updateData.tiktok_pixel_id = (body.tiktok_pixel_id || "").trim() || null;
    }
    if (body.meta_conversions_token !== undefined) {
      updateData.meta_conversions_token =
        (body.meta_conversions_token || "").trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: "No fields to update",
        }),
      };
    }

    console.log(
      "[update-profile] Upserting fields:",
      Object.keys(updateData),
      "for user:",
      user.id
    );

    const upsertPayload = {
      id: user.id,
      ...updateData,
    };

    const { data, error } = await supabaseAdmin
      .from("user_profiles")
      .upsert(upsertPayload, { onConflict: "id" })
      .select(
        "id, meta_pixel_id, tiktok_pixel_id, meta_conversions_token, updated_at"
      )
      .single();

    console.log("[update-profile] upsert result:", { data, error });

    if (error) {
      console.error("[update-profile] upsert error:", error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          error: error.message || "Failed to update profile",
        }),
      };
    }

    if (!data) {
      console.error("[update-profile] upsert returned no data");
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "No profile returned after upsert",
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        profile: data,
      }),
    };
  } catch (err: any) {
    console.error("[update-profile] Fatal error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: err.message || "Unexpected error",
      }),
    };
  }
};
