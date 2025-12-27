import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = process.env.SUPABASE_UPLOADS_BUCKET || "uploads";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    const body = JSON.parse(event.body || "{}");
    const { action, userId } = body;
    if (!action) return { statusCode: 400, body: JSON.stringify({ error: "missing_action" }) };
    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: "missing_userId" }) };

    const supabase = sb();

    if (action === "list_uploads") {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id,kind,filename,mime,public_url,storage_bucket,storage_key,created_at")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return { statusCode: 500, body: JSON.stringify({ error: "list_failed", details: error }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true, uploads: data || [] }) };
    }

    if (action === "resolve_upload") {
      const { uploadId, filename } = body;

      let q = supabase
        .from("media_assets")
        .select("id,kind,filename,mime,public_url,storage_bucket,storage_key,created_at")
        .eq("owner_user_id", userId);

      if (uploadId) q = q.eq("id", uploadId);
      else if (filename) q = q.ilike("filename", `%${filename}%`);
      else return { statusCode: 400, body: JSON.stringify({ error: "missing_uploadId_or_filename" }) };

      const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !data) return { statusCode: 404, body: JSON.stringify({ error: "not_found", details: error }) };

      let usableUrl = data.public_url;
      if (!usableUrl) {
        const bucket = data.storage_bucket || BUCKET;
        const { data: signed, error: signErr } = await supabase.storage
          .from(bucket)
          .createSignedUrl(data.storage_key, 60 * 30);

        if (signErr) return { statusCode: 500, body: JSON.stringify({ error: "signed_url_failed", details: signErr }) };
        usableUrl = signed?.signedUrl;
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true, upload: data, url: usableUrl }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "unknown_action" }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", message: e?.message || String(e) }) };
  }
};
