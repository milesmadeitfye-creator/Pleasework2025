import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import multiparty from "multiparty";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const {
      file_url,
      creative_type,
      caption,
      duration_seconds,
      file_size_bytes,
      mime_type,
      width,
      height,
    } = body;

    if (!file_url || !creative_type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_file_url_or_type" }),
      };
    }

    const { data: creative, error: insertError } = await supabase
      .from('ad_creatives')
      .insert([{
        owner_user_id: user.id,
        creative_type,
        storage_path: file_url,
        public_url: file_url,
        caption: caption || null,
        caption_generated: false,
        duration_seconds: duration_seconds || null,
        file_size_bytes: file_size_bytes || null,
        mime_type: mime_type || null,
        width: width || null,
        height: height || null,
        analysis_complete: false,
      }])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log('[run-ads-upload-creative] ✅ Creative uploaded:', creative.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        creative,
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-upload-creative] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "upload_error" }),
    };
  }
};
