// NOTE: AUDD API calls should be made from serverless functions, not client-side
// This client will be refactored to use a Netlify function endpoint
const AUDD_API_KEY = ""; // Disabled - use serverless function instead
const AUDD_API_URL = "https://api.audd.io/";

if (!AUDD_API_KEY) {
  console.warn("[Audd] AUDD_API_KEY not set. Smart link auto-resolve is disabled.");
}

type StreamingInfo = {
  url?: string;
  link?: string;
  external_urls?: { spotify?: string };
  permalink_url?: string;
  id?: string;
};

export type AuddResult = {
  artist?: string;
  title?: string;
  album?: string;
  isrc?: string;
  spotify?: StreamingInfo | { album?: { images?: { url?: string }[]; external_urls?: { spotify?: string } } };
  apple_music?: StreamingInfo | { artwork?: { url?: string } };
  deezer?: StreamingInfo;
  tidal?: StreamingInfo;
  youtube?: StreamingInfo;
  youtube_music?: StreamingInfo;
  soundcloud?: StreamingInfo;
};

export type SmartLinksData = {
  artist: string | null;
  title: string | null;
  isrc: string | null;
  cover: string | null;
  links: {
    spotify: string | null;
    appleMusic: string | null;
    youtubeMusic: string | null;
    tidal: string | null;
    soundcloud: string | null;
    deezer: string | null;
  };
  deeplinks: {
    spotify: string | null;
    appleMusic: string | null;
    youtubeMusic: string | null;
    tidal: string | null;
    soundcloud: string | null;
  };
};

async function auddPost(params: Record<string, string>): Promise<any> {
  if (!AUDD_API_KEY) {
    throw new Error("AUDD_API_KEY is not configured.");
  }

  const body = new URLSearchParams({
    api_token: AUDD_API_KEY,
    ...params,
  });

  const res = await fetch(AUDD_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[Audd] Non-JSON response:", text.slice(0, 300));
    throw new Error(`[Audd] Invalid JSON response`);
  }

  if (!res.ok) {
    console.error("[Audd] HTTP error:", res.status, text.slice(0, 300));
    throw new Error(`[Audd] HTTP ${res.status}`);
  }

  if (json.error) {
    console.error("[Audd] API error:", json.error);
    throw new Error(
      json.error.error_message || `Audd error: ${JSON.stringify(json.error)}`
    );
  }

  return json;
}

export async function auddRecognizeByUrl(
  url: string
): Promise<any | null> {
  if (!url || !url.trim()) return null;

  const json = await auddPost({
    url: url.trim(),
    method: "recognize",
    return:
      "apple_music,spotify,youtube,youtube_music,soundcloud,tidal",
  });

  return json.result || null;
}

export async function auddSearchByText(
  query: string
): Promise<any | null> {
  if (!query || !query.trim()) return null;

  try {
    const json = await auddPost({
      method: "search",
      q: query.trim(),
      return:
        "apple_music,spotify,youtube,youtube_music,soundcloud,tidal",
    });
    if (json.result) return json.result;
  } catch (e) {
    console.warn("[Audd] search failed, falling back to recognize:", e);
  }

  const fallback = await auddPost({
    method: "recognize",
    q: query.trim(),
    return:
      "apple_music,spotify,youtube,youtube_music,soundcloud,tidal",
  });

  return fallback.result || null;
}

function getPrimaryUrl(info?: StreamingInfo | null): string | null {
  if (!info) return null;
  if (info.external_urls?.spotify) return info.external_urls.spotify;
  return info.url || info.link || info.permalink_url || null;
}

export function mapAuddToSmartLinks(result: any): SmartLinksData {
  if (!result) {
    return {
      artist: null,
      title: null,
      isrc: null,
      cover: null,
      links: {
        spotify: null,
        appleMusic: null,
        youtubeMusic: null,
        tidal: null,
        soundcloud: null,
        deezer: null,
      },
      deeplinks: {
        spotify: null,
        appleMusic: null,
        youtubeMusic: null,
        tidal: null,
        soundcloud: null,
      },
    };
  }

  const artist =
    (typeof result.artist === "string" && result.artist.trim()) || null;
  const title =
    (typeof result.title === "string" && result.title.trim()) || null;

  const isrc =
    result.apple_music?.isrc ||
    result.spotify?.external_ids?.isrc ||
    result.isrc ||
    null;

  const query = [artist, title].filter(Boolean).join(" ").trim() || null;
  const songLink =
    typeof result.song_link === "string" ? result.song_link : null;

  const spotifyFromObj =
    result.spotify?.external_urls?.spotify ||
    getPrimaryUrl(result.spotify as StreamingInfo) ||
    null;

  const spotifyFromSongLink =
    songLink && songLink.includes("open.spotify.com/track/")
      ? songLink
      : null;

  const spotifyUrl = spotifyFromObj || spotifyFromSongLink || null;

  const appleFromObj =
    result.apple_music?.url ||
    getPrimaryUrl(result.apple_music as StreamingInfo) ||
    null;

  const appleFromSongLink =
    songLink && songLink.includes("music.apple.com") ? songLink : null;

  const appleUrl = appleFromObj || appleFromSongLink || null;

  const ytDirect =
    getPrimaryUrl(result.youtube_music as StreamingInfo) ||
    getPrimaryUrl(result.youtube as StreamingInfo) ||
    null;

  const ytSearch =
    !ytDirect && query
      ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
      : null;

  const youtubeMusicUrl = ytDirect || ytSearch;

  const scDirect =
    getPrimaryUrl(result.soundcloud as StreamingInfo) || null;

  const scSearch =
    !scDirect && query
      ? `https://soundcloud.com/search/sounds?q=${encodeURIComponent(query)}`
      : null;

  const soundcloudUrl = scDirect || scSearch;

  const tidalDirect = getPrimaryUrl(result.tidal as StreamingInfo) || null;

  const tidalSearch =
    !tidalDirect && query
      ? `https://listen.tidal.com/search?q=${encodeURIComponent(query)}`
      : null;

  const tidalUrl = tidalDirect || tidalSearch;

  const deezerUrl = getPrimaryUrl(result.deezer as StreamingInfo);

  const cover =
    result.spotify?.album?.images?.[0]?.url ||
    result.apple_music?.artwork?.url ||
    null;

  let spotifyDeep: string | null = null;
  if (spotifyUrl && spotifyUrl.includes("open.spotify.com/track/")) {
    const id = spotifyUrl.split("open.spotify.com/track/")[1]?.split(/[?]/)[0];
    if (id) spotifyDeep = `spotify:track:${id}`;
  }
  if (!spotifyDeep && spotifyUrl) {
    spotifyDeep = spotifyUrl;
  }

  const appleDeep = appleUrl || null;

  const ytDeep = youtubeMusicUrl || null;

  let tidalDeep: string | null = null;
  if (tidalUrl && tidalUrl.includes("/track/")) {
    const id = tidalUrl.split("/track/")[1]?.split(/[?]/)[0];
    if (id) tidalDeep = `tidal://track/${id}`;
  }
  if (!tidalDeep && tidalUrl) {
    tidalDeep = tidalUrl;
  }

  const scDeep = soundcloudUrl || null;

  return {
    artist,
    title,
    isrc,
    cover,
    links: {
      spotify: spotifyUrl,
      appleMusic: appleUrl,
      youtubeMusic: youtubeMusicUrl,
      tidal: tidalUrl,
      soundcloud: soundcloudUrl,
      deezer: deezerUrl,
    },
    deeplinks: {
      spotify: spotifyDeep,
      appleMusic: appleDeep,
      youtubeMusic: ytDeep,
      tidal: tidalDeep,
      soundcloud: scDeep,
    },
  };
}
