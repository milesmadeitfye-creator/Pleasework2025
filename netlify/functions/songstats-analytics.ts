import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabaseAdmin";

async function getSongstatsKey() {
  const { data, error } = await supabaseAdmin
    .from("integration_keys")
    .select("api_key,is_test,updated_at")
    .eq("provider", "songstats")
    .maybeSingle();

  if (error) throw error;
  if (!data?.api_key) throw new Error("Songstats key not configured");
  return data;
}

export const handler: Handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { entityType = "artist", query } = body;

    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing query" })
      };
    }

    const { api_key } = await getSongstatsKey();

    const searchUrl = `https://api.songstats.com/v1/search?type=${encodeURIComponent(entityType)}&q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${api_key}` },
    });

    const searchJson = await searchRes.json();
    if (!searchRes.ok) {
      return {
        statusCode: searchRes.status,
        body: JSON.stringify({
          error: "Songstats search failed",
          details: searchJson
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        entityType,
        query,
        results: searchJson,
      }),
    };
  } catch (e: any) {
    console.error("[songstats-analytics] Error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e?.message || "Server error" })
    };
  }
};
