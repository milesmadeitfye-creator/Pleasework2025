export type LinkUI = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badges?: { label: string; tone?: "blue" | "green" | "gray" }[];
  platforms?: { label: string; variant: "spotify" | "apple" | "youtube" | "tidal" | "soundcloud" | "deezer" | "amazon" | "default" }[];
};

function safeUrl(s?: string | null) {
  if (!s) return undefined;
  return s;
}

export function toLinkUI(link: any): LinkUI {
  const title =
    link.title ||
    link.name ||
    link.release_title ||
    "Untitled";

  const subtitle =
    link.public_url ||
    (link.slug ? `ghoste.one/s/${link.slug}` : undefined);

  const imageUrl =
    safeUrl(link.cover_image_url) ||
    safeUrl(link.artwork_url) ||
    safeUrl(link.image_url) ||
    safeUrl(link.thumbnail_url);

  const badges: LinkUI["badges"] = [];
  if (link.template) badges.push({ label: link.template, tone: "blue" });
  if (link.is_auto) badges.push({ label: "Auto", tone: "green" });
  if (link.status) badges.push({ label: String(link.status), tone: "gray" });
  if (link.link_type) {
    const typeLabel = link.link_type === "smart" ? "Smart Link" :
                      link.link_type === "presave" ? "Pre-Save" :
                      link.link_type === "bio" ? "Bio" :
                      link.link_type === "show" ? "Show" :
                      link.link_type === "one_click" ? "One-Click" :
                      link.link_type === "email_capture" ? "Email" : link.link_type;
    badges.push({ label: typeLabel, tone: "blue" });
  }

  // Add resolution info for smart links
  if (link.link_type === "smart" && link.resolver_confidence !== undefined && link.resolver_confidence !== null) {
    const confidence = Math.round(link.resolver_confidence * 100);
    const tone = confidence >= 75 ? "green" : confidence >= 50 ? "blue" : "gray";
    badges.push({ label: `${confidence}% resolved`, tone });
  }

  // Add ISRC badge if present
  if (link.resolved_isrc) {
    badges.push({ label: `ISRC: ${link.resolved_isrc}`, tone: "gray" });
  }

  const platforms: LinkUI["platforms"] = [];
  if (link.spotify_url) platforms.push({ label: "Spotify", variant: "spotify" });
  if (link.apple_music_url) platforms.push({ label: "Apple Music", variant: "apple" });
  if (link.youtube_url || link.youtube_music_url) platforms.push({ label: "YouTube", variant: "youtube" });
  if (link.tidal_url) platforms.push({ label: "Tidal", variant: "tidal" });
  if (link.soundcloud_url) platforms.push({ label: "SoundCloud", variant: "soundcloud" });
  if (link.deezer_url) platforms.push({ label: "Deezer", variant: "deezer" });
  if (link.amazon_music_url) platforms.push({ label: "Amazon Music", variant: "amazon" });

  if (!platforms.length && link.destination_url) {
    platforms.push({ label: "Link", variant: "default" });
  }

  return { id: link.id, title, subtitle, imageUrl, badges, platforms };
}
