export function getDeepLink(url: string, platform: string): string {
  if (!url) return '';

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (!isMobile) {
    if (platform === 'Spotify') {
      const match = url.match(/track\/([a-zA-Z0-9]+)/);
      if (match && !url.includes('?')) {
        return `${url}?autoplay=true`;
      }
    }
    if (platform === 'YouTube' && !url.includes('autoplay')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}autoplay=1`;
    }
    return url;
  }

  try {
    if (platform === 'Spotify') {
      const match = url.match(/track\/([a-zA-Z0-9]+)/);
      if (match) {
        return `spotify:track:${match[1]}:play`;
      }
      const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);
      if (albumMatch) {
        return `spotify:album:${albumMatch[1]}:play`;
      }
    }

    if (platform === 'Apple Music') {
      return url.replace('https://music.apple.com', 'music://');
    }

    if (platform === 'YouTube') {
      const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (match) {
        return `vnd.youtube://${match[1]}?autoplay=1`;
      }
    }

    if (platform === 'Tidal') {
      return url.replace('https://tidal.com', 'tidal://');
    }

    if (platform === 'SoundCloud') {
      return url.replace('https://soundcloud.com', 'soundcloud://');
    }
  } catch (e) {
    console.warn('Deep link parsing failed:', e);
  }

  return url;
}

export function toDeepLink(url: string): string {
  if (!url) return url;

  try {
    const u = new URL(url);

    if (u.hostname.includes("open.spotify.com") && u.pathname.startsWith("/track/")) {
      const id = u.pathname.split("/track/")[1]?.split("/")[0];
      if (id) return `spotify:track:${id}`;
    }

    if (u.hostname.includes("music.apple.com")) {
      return url;
    }

    if (
      (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) &&
      (u.searchParams.get("v") || u.pathname.length > 1)
    ) {
      const id =
        u.searchParams.get("v") ||
        (u.hostname === "youtu.be" ? u.pathname.substring(1) : "");
      if (id) return `youtubemusic://watch?v=${id}`;
    }

    if (u.hostname.includes("tidal.com") && u.pathname.includes("/track/")) {
      const id = u.pathname.split("/track/")[1]?.split("/")[0];
      if (id) return `tidal://track/${id}`;
    }

    if (u.hostname.includes("soundcloud.com")) {
      return url;
    }

    return url;
  } catch {
    return url;
  }
}

export function openPlatformLink(url: string, platform: string) {
  if (!url) return;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (isMobile) {
    const deepLink = getDeepLink(url, platform);

    if (deepLink !== url) {
      const now = Date.now();
      window.location.href = deepLink;

      setTimeout(() => {
        if (Date.now() - now < 2000) {
          window.open(url, '_blank');
        }
      }, 1500);
    } else {
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank');
  }
}
