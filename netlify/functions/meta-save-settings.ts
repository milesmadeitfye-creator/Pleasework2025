import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const sb = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const body = JSON.parse(event.body || "{}");
    const {
      userId,
      pixelId,
      pageId,
      instagramActorId,
      usePageForPosting,
      useInstagramForPosting,
    } = body;

    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: "missing_userId" }) };

    const supabase = sb();

    const payload: any = { user_id: userId };
    if (pixelId !== undefined) payload.pixel_id = pixelId || null;
    if (pageId !== undefined) payload.page_id = pageId || null;
    if (instagramActorId !== undefined) payload.instagram_actor_id = instagramActorId || null;
    if (usePageForPosting !== undefined) payload.use_page_for_posting = !!usePageForPosting;
    if (useInstagramForPosting !== undefined) payload.use_instagram_for_posting = !!useInstagramForPosting;

    const { data, error } = await supabase
      .from("meta_credentials")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,pixel_id,page_id,instagram_actor_id,use_page_for_posting,use_instagram_for_posting,updated_at")
      .single();

    if (error) return { statusCode: 500, body: JSON.stringify({ error: "save_failed", details: error }) };

    return { statusCode: 200, body: JSON.stringify({ ok: true, settings: data }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", message: e?.message || String(e) }) };
  }
};
