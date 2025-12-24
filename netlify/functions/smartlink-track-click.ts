import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side admin client (service role)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const slug = String(body.slug || "").trim();
    const platform = body.platform ? String(body.platform) : "unknown";
    const url = body.url ? String(body.url) : null;
    const referrer = body.referrer ? String(body.referrer) : null;
    const metadata = body.metadata ?? {};
    const viewer_user_id = body.user_id ? String(body.user_id) : null;

    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "missing_slug" }) };
    }

    // Find the smart link by slug
    const { data: smartlink, error: slErr } = await supabaseAdmin
      .from("smart_links")
      .select("id, user_id, slug")
      .eq("slug", slug)
      .maybeSingle();

    if (slErr) throw slErr;

    // If no link, don't hard fail (avoid breaking redirect UX)
    if (!smartlink) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: "smart_link_not_found" }) };
    }

    // Insert click event (owner_user_id is the creator of the smart link)
    const { error: insErr } = await supabaseAdmin
      .from("link_click_events")
      .insert([{
        owner_user_id: smartlink.user_id,
        user_id: viewer_user_id, // nullable (anonymous clicks OK)
        link_id: smartlink.id,
        link_type: "smart_link",
        platform,
        slug: smartlink.slug,
        url,
        referrer,
        metadata,
      }]);

    if (insErr) throw insErr;

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e: any) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: e?.message || "unknown_error" }) };
  }
};
