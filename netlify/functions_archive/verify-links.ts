import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDD_ENDPOINT = process.env.AUDD_ENDPOINT ?? "https://api.audd.io/";
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN!;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY);

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return r.status;
  } catch {
    return 599;
  }
}

async function auddReResolve(title: string, artist: string, isrc?: string) {
  const params = new URLSearchParams({
    api_token: AUDD_API_TOKEN,
    return: "apple_music,spotify,deezer",
  });
  if (isrc) params.set("isrc", isrc);
  else params.set("q", `${title} ${artist}`);

  const r = await fetch(AUDD_ENDPOINT, { method: "POST", body: params });
  if (!r.ok) return null;
  const json = await r.json();
  return json?.result ?? null;
}

export const handler: Handler = async (event) => {
  try {
    // Support targeted runs via ?track_id=uuid query param
    const url = new URL(
      (event as any).rawUrl ??
      `https://local${event.path || ""}${event.rawQuery ? "?" + event.rawQuery : ""}`
    );
    const trackIdFilter = url.searchParams.get("track_id");

    // Pull a small batch to keep runtime short; schedule runs nightly
    let query = supabase
      .from("public_track_links")
      .select(`
        id,
        track_id,
        platform,
        url_web,
        confidence,
        tracks:track_id (
          title,
          artist,
          isrc
        )
      `)
      .order("last_verified_at", { ascending: true, nullsFirst: true });

    if (trackIdFilter) {
      query = query.eq("track_id", trackIdFilter).limit(10);
    } else {
      query = query.limit(200);
    }

    const { data: links, error } = await query;

    if (error) {
      console.error("[verify-links] Query failed:", error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    let ok = 0,
      fixed = 0,
      dropped = 0;

    for (const row of links ?? []) {
      const track = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks;
      if (!track) {
        dropped++;
        continue;
      }

      const status = await head(row.url_web);

      if (status >= 200 && status < 400) {
        ok++;
        await supabase
          .from("public_track_links")
          .update({
            last_checked_status: status,
            last_verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }

      // Degrade confidence first
      await supabase
        .from("public_track_links")
        .update({
          last_checked_status: status,
          confidence: Math.max(0, Number(row.confidence) - 0.15),
        })
        .eq("id", row.id);

      // Try to re-resolve with AudD quickly
      const core = await auddReResolve(track.title, track.artist, track.isrc);
      if (!core) {
        dropped++;
        continue;
      }

      // Map back best urls (spotify/apple)
      const updates: any[] = [];
      if (core.spotify?.id) {
        updates.push({
          platform: "spotify",
          url_web: `https://open.spotify.com/track/${core.spotify.id}`,
        });
      }
      if (core.apple_music?.id) {
        const storefront = (core.apple_music.country || "US").toLowerCase();
        updates.push({
          platform: "apple",
          url_web:
            core.apple_music.url ||
            `https://music.apple.com/${storefront}/song/${encodeURIComponent(
              core.title ?? ""
            )}/${core.apple_music.id}`,
        });
      }

      for (const u of updates) {
        await supabase
          .from("public_track_links")
          .update({
            url_web: u.url_web,
            confidence: 0.95,
            last_checked_status: 200,
            last_verified_at: new Date().toISOString(),
          })
          .eq("track_id", row.track_id)
          .eq("platform", u.platform);
        fixed++;
      }
    }

    console.log(`[verify-links] ok=${ok}, fixed=${fixed}, dropped=${dropped}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok, fixed, dropped }),
    };
  } catch (e: any) {
    console.error("[verify-links] Fatal error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || "Internal error" }),
    };
  }
};
