import { supabaseAdmin } from "../_supabaseAdmin";

export type SongstatsSource =
  | "spotify"
  | "apple_music"
  | "youtube"
  | "tidal"
  | "amazon"
  | "deezer"
  | "soundcloud"
  | "tiktok"
  | "instagram"
  | "shazam";

export async function getSongstatsKey() {
  const { data, error } = await supabaseAdmin
    .from("integration_keys")
    .select("api_key")
    .eq("provider", "songstats")
    .maybeSingle();

  if (error) throw error;
  if (!data?.api_key) throw new Error("Songstats key not configured in Supabase");
  return data.api_key as string;
}

export async function songstatsFetch(path: string) {
  const apiKey = await getSongstatsKey();
  const res = await fetch(`https://api.songstats.com/enterprise/v1${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Songstats ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

export async function songstatsGet(path: string) {
  const key = await getSongstatsKey();
  const url = `https://api.songstats.com/enterprise/v1${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Accept: "application/json",
    } as any,
    redirect: "follow",
  });

  const json = await res.json().catch(() => ({}));

  // Handle 302 as pending/indexing (do not throw)
  if (res.status === 302) {
    return { __songstats_pending: true, ...json };
  }

  if (!res.ok) {
    throw new Error(`Songstats ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }

  return json;
}
