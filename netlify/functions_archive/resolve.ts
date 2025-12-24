import type { Handler } from "@netlify/functions";
import { isCanonical } from "../../src/lib/linkPatterns";
import { extractCoreFromSeed } from "../../src/lib/resolver/extract";
import { resolveAll } from "../../src/lib/resolver/resolveAll";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Supabase env missing");
  throw new Error("Server misconfigured: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const okHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: okHeaders, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: okHeaders,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const { seed_url, storefront } = JSON.parse(event.body || "{}");

    if (typeof seed_url !== "string" || !seed_url.trim()) {
      return {
        statusCode: 400,
        headers: okHeaders,
        body: JSON.stringify({ error: "Missing seed_url" }),
      };
    }

    if (!isCanonical(seed_url)) {
      return {
        statusCode: 400,
        headers: okHeaders,
        body: JSON.stringify({
          error: "Seed must be a canonical track URL (no search links)",
        }),
      };
    }

    // 1) Extract core meta (should include ISRC if possible)
    const core = await extractCoreFromSeed(seed_url);

    // Guardrails
    if (!core.title || !core.artist) {
      return {
        statusCode: 422,
        headers: okHeaders,
        body: JSON.stringify({
          error: "Unable to extract basic metadata from seed",
        }),
      };
    }

    // 2) Fan-out resolution
    const { links } = await resolveAll(core);

    if (!links.length) {
      return {
        statusCode: 424,
        headers: okHeaders,
        body: JSON.stringify({
          error: "Could not resolve canonical links with high confidence",
        }),
      };
    }

    // 2.5) If track is already confirmed, skip overwrite unless client sent overwrite=true
    const body = JSON.parse(event.body || "{}");
    const overwrite = !!body.overwrite;
    if (core.isrc) {
      const { data: existing } = await supabase
        .from("public_tracks")
        .select("id, user_confirmed")
        .eq("isrc", core.isrc)
        .maybeSingle();
      if (existing?.user_confirmed && !overwrite) {
        return {
          statusCode: 200,
          headers: okHeaders,
          body: JSON.stringify({
            note: "track confirmed; not overwriting",
            core,
            links: [],
          }),
        };
      }
    }

    // 3) Upsert into DB via RPC
    const payload = {
      p_isrc: core.isrc ?? null,
      p_title: core.title,
      p_artist: core.artist,
      p_album: core.album ?? null,
      p_duration_ms: core.duration_ms ?? null,
      p_release_date: core.release_date ?? null,
      p_canonical_platform: null,
      p_canonical_id: null,
      p_links: links.map((l) => ({
        platform: l.platform,
        platform_id: l.platform_id,
        url_web: l.url_web,
        url_app: l.url_app ?? null,
        storefront: l.platform === "apple" ? (storefront || l.storefront || "US") : l.storefront ?? null,
        confidence: l.confidence,
      })),
    };

    const { data, error } = await supabase.rpc(
      "upsert_track_with_links",
      payload
    );

    if (error) {
      console.error("[resolve] DB upsert failed:", error);
      return {
        statusCode: 500,
        headers: okHeaders,
        body: JSON.stringify({ error: "DB upsert failed" }),
      };
    }

    // Claim ownership if user is authenticated
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (token && data) {
      try {
        const { data: userRes } = await supabase.auth.getUser(token);
        const userId = userRes?.user?.id;

        if (userId) {
          await supabase
            .from("track_owners")
            .upsert(
              { track_id: data, user_id: userId },
              { onConflict: "track_id,user_id" }
            );
        }
      } catch (authErr) {
        console.warn("[resolve] Auth token validation failed:", authErr);
      }
    }

    return {
      statusCode: 200,
      headers: okHeaders,
      body: JSON.stringify({ track_id: data, core, links }),
    };
  } catch (e: any) {
    console.error("[resolve] Fatal error:", e);
    return {
      statusCode: 500,
      headers: okHeaders,
      body: JSON.stringify({ error: e.message || "Internal error" }),
    };
  }
};
