import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const TID = process.env.TIKTOK_CLIENT_ID!;
const TSEC = process.env.TIKTOK_CLIENT_SECRET!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const handler: Handler = async (event) => {
  try {
    const url = new URL((event as any).rawUrl || `https://ghoste.one${event.path}`);
    const code = url.searchParams.get("code");
    if (!code) return { statusCode: 400, body: "Missing code" };

    const scheme = (event.headers["x-forwarded-proto"] as string) || "https";
    const host = (event.headers["x-forwarded-host"] as string) || event.headers.host;
    const redirectUri = `${scheme}://${host}/.netlify/functions/tiktok-oauth-callback`;

    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type":"application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: TID,
        client_secret: TSEC,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });
    const tokenJson = await tokenRes.json();

    const owner_id = null;
    if (!owner_id) return { statusCode: 200, body: "TikTok connected (stub) — attach owner_id when wiring UI auth." };

    await supabase.from("user_profiles").update({
      tiktok_access_token: tokenJson.access_token,
      tiktok_refresh_token: tokenJson.refresh_token
    }).eq("user_id", owner_id);

    return { statusCode: 302, headers: { Location: `${scheme}://${host}/dashboard?tiktok=connected` }, body: "" };
  } catch (e:any) {
    return { statusCode: 500, body: e.message || "Internal error" };
  }
};
