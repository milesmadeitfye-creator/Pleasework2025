import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabaseAdmin";

async function getUserIdFromAuthHeader(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice("Bearer ".length);
  const sb = supabaseAdmin;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error) return null;
  return data.user?.id ?? null;
}

export const handler: Handler = async (event) => {
  try {
    const userId = await getUserIdFromAuthHeader(event.headers.authorization);
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { spotifyArtistId, artistName, artistImage } = body;

    if (!spotifyArtistId || !artistName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing spotifyArtistId or artistName" }),
      };
    }

    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("saved_artists")
      .upsert(
        {
          user_id: userId,
          spotify_artist_id: spotifyArtistId,
          artist_name: artistName,
          artist_image: artistImage || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,spotify_artist_id" }
      )
      .select("user_id, spotify_artist_id, artist_name, artist_image, updated_at")
      .maybeSingle();

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, saved: data }),
    };
  } catch (e: any) {
    console.error("[analytics-save-artist] Error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e?.message || "Save failed" }),
    };
  }
};
