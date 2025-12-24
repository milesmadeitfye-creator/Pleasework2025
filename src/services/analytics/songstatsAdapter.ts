// Converts unknown Songstats response shape into predictable UI objects.
// This avoids breaking when fields differ.

export function pickNumber(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function fmt(n: number | null, fallback = "—") {
  if (n === null) return fallback;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// Best-effort extraction across likely keys
export function buildGhosteAnalyticsView(raw: any) {
  const ig = raw?.instagram || raw?.ig || raw?.platformSignals?.instagram || {};
  const tt = raw?.tiktok || raw?.tt || raw?.platformSignals?.tiktok || {};
  const sp = raw?.spotify || raw?.streaming?.spotify || raw?.platformSignals?.spotify || {};
  const yt = raw?.youtube || raw?.streaming?.youtube || raw?.platformSignals?.youtube || {};
  const streams = raw?.streams || raw?.streaming || {};
  const core = raw?.core || {};
  const platformSignals = raw?.platformSignals || {};

  const followersIG = pickNumber(ig?.followers ?? ig?.follower_count ?? ig?.stats?.followers);
  const followersTT = pickNumber(tt?.followers ?? tt?.follower_count ?? tt?.stats?.followers);
  const monthlySpotify = pickNumber(
    core?.spotifyMonthlyListeners ?? sp?.monthly_listeners ?? sp?.monthlyListeners ?? sp?.stats?.monthly_listeners
  );
  const subsYT = pickNumber(yt?.subscribers ?? yt?.subscriber_count ?? yt?.stats?.subscribers);

  const totalStreams = pickNumber(
    core?.spotifyStreams ?? streams?.total_streams ?? streams?.total ?? streams?.stats?.streams_total
  );

  // Trends: accept either raw arrays or build from generic series
  const trend = raw?.trend || raw?.history || raw?.timeseries || raw?.series || [];
  const trendData =
    Array.isArray(trend) && trend.length
      ? trend.map((x: any) => ({
          date: x?.date || x?.day || x?.label || x?.t || "—",
          value: pickNumber(x?.value ?? x?.count ?? x?.streams ?? x?.followers) ?? 0,
        }))
      : [];

  // Platform breakdown
  const breakdown = raw?.platforms ?? raw?.breakdown ?? raw?.by_platform ?? [];
  const breakdownData =
    Array.isArray(breakdown) && breakdown.length
      ? breakdown.map((x: any) => ({
          label: x?.platform || x?.name || x?.label || "Platform",
          value: pickNumber(x?.value ?? x?.streams ?? x?.count ?? x?.followers) ?? 0,
        }))
      : [];

  const spotifyFollowers = pickNumber(sp?.followers ?? platformSignals?.spotify?.followers);
  const shazams = pickNumber(platformSignals?.shazam?.shazams);
  const tiktokViews = pickNumber(tt?.views ?? platformSignals?.tiktok?.views);

  const cards = [
    { title: "Total Streams", value: fmt(totalStreams), sub: "Spotify streams", key: "total_streams" },
    { title: "Spotify Monthly", value: fmt(monthlySpotify), sub: "Monthly listeners", key: "spotify_monthly" },
    { title: "Spotify Followers", value: fmt(spotifyFollowers), sub: "Followers on Spotify", key: "spotify_followers" },
    { title: "TikTok Followers", value: fmt(followersTT), sub: "Audience size", key: "tt_followers" },
    { title: "TikTok Views", value: fmt(tiktokViews), sub: "Video views", key: "tt_views" },
    { title: "Instagram Followers", value: fmt(followersIG), sub: "Profile growth", key: "ig_followers" },
    { title: "YouTube Subs", value: fmt(subsYT), sub: "Channel subscribers", key: "yt_subs" },
    { title: "Shazams", value: fmt(shazams), sub: "Track identifications", key: "shazams" },
  ].filter(c => c.value !== "—"); // Only show cards with data

  return { cards, trendData, breakdownData, raw };
}
