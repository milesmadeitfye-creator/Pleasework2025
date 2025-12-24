import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { userId } = JSON.parse(event.body || "{}");
    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: "missing_userId" }) };

    const supabase = sb();
    const { data, error } = await supabase
      .from("meta_credentials")
      .select("pixel_id,page_id,instagram_actor_id,use_page_for_posting,use_instagram_for_posting")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { statusCode: 500, body: JSON.stringify({ error: "load_failed", details: error }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true, settings: data || {} }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", message: e?.message || String(e) }) };
  }
};
