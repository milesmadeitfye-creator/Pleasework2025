/**
 * Deep Link & Platform Detection Utilities
 * Handles platform detection, deep link generation, and auto-redirect logic for OneClick links
 */

export type Platform =
  | 'spotify'
  | 'youtube'
  | 'applemusic'
  | 'soundcloud'
  | 'audiomack'
  | 'tidal'
  | 'amazonmusic'
  | 'deezer'
  | 'pandora'
  | 'unknown';

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): Platform {
  if (!url) return 'unknown';

  const lower = url.toLowerCase();

  if (lower.includes('spotify.com') || lower.includes('spotify:')) return 'spotify';
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vnd.youtube:'))
    return 'youtube';
  if (lower.includes('music.apple.com') || lower.includes('itunes.apple.com')) return 'applemusic';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  if (lower.includes('audiomack.com')) return 'audiomack';
  if (lower.includes('tidal.com')) return 'tidal';
  if (lower.includes('music.amazon.com')) return 'amazonmusic';
  if (lower.includes('deezer.com')) return 'deezer';
  if (lower.includes('pandora.com')) return 'pandora';

  return 'unknown';
}

/**
 * Get platform display name
 */
export function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    spotify: 'Spotify',
    youtube: 'YouTube',
    applemusic: 'Apple Music',
    soundcloud: 'SoundCloud',
    audiomack: 'Audiomack',
    tidal: 'TIDAL',
    amazonmusic: 'Amazon Music',
    deezer: 'Deezer',
    pandora: 'Pandora',
    unknown: 'Link',
  };

  return names[platform] || 'Link';
}

/**
 * Build deep link scheme for app opening
 * Returns app scheme URL or null if not supported
 */
export function buildDeepLinkScheme(url: string): string | null {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const platform = detectPlatform(url);

    switch (platform) {
      case 'spotify': {
        if (urlObj.hostname.includes('open.spotify.com')) {
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const [type, id] = parts;
            const cleanId = id.split('?')[0];
            return `spotify://${type}/${cleanId}`;
          }
        }
        break;
      }

      case 'youtube': {
        let videoId = '';

        if (urlObj.hostname.includes('youtu.be')) {
          videoId = urlObj.pathname.replace('/', '').split('?')[0];
        } else if (urlObj.searchParams.has('v')) {
          videoId = urlObj.searchParams.get('v') || '';
        }

        if (videoId) {
          return `vnd.youtube://${videoId}`;
        }
        break;
      }

      default:
        return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt deep link redirect with fallback
 * Tries app scheme first, then falls back to https after timeout
 */
export function attemptDeepLinkRedirect(url: string, onRedirect?: () => void): void {
  if (!url) return;

  const deepLinkScheme = buildDeepLinkScheme(url);
  const platform = detectPlatform(url);

  console.log('[DeepLink]', {
    original: url,
    deepLink: deepLinkScheme,
    platform,
  });

  if (onRedirect) {
    try {
      onRedirect();
    } catch (err) {
      console.error('[DeepLink] onRedirect callback error:', err);
    }
  }

  if (deepLinkScheme && (platform === 'spotify' || platform === 'youtube')) {
    const startTime = Date.now();
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = deepLinkScheme;
    document.body.appendChild(iframe);

    setTimeout(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed < 1200) {
        console.log('[DeepLink] App scheme timeout, falling back to https');
        window.location.href = url;
      }

      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 1000);
  } else {
    window.location.href = url;
  }
}

/**
 * Get Meta event name for platform
 */
export function getOneClickEventName(platform: Platform): string {
  const eventNames: Record<Platform, string> = {
    spotify: 'oneclickspotify',
    youtube: 'oneclickyoutube',
    applemusic: 'oneclickapplemusic',
    soundcloud: 'oneclicksoundcloud',
    audiomack: 'oneclickaudiomack',
    tidal: 'oneclicktidal',
    amazonmusic: 'oneclickamazon',
    deezer: 'oneclickdeezer',
    pandora: 'oneclickpandora',
    unknown: 'oneclicklink',
  };

  return eventNames[platform] || 'oneclicklink';
}

/**
 * Legacy Spotify deep link function (kept for backward compatibility)
 */
export function openSpotify(trackId: string) {
  const scheme = `spotify://track/${trackId}`;
  const universal = `https://open.spotify.com/track/${trackId}`;

  const a = document.createElement('a');
  a.href = scheme;
  a.style.display = 'none';
  a.setAttribute('rel', 'noopener');
  a.setAttribute('target', '_self');
  document.body.appendChild(a);

  const t = setTimeout(() => {
    window.location.href = universal;
  }, 800);

  const onVis = () => {
    if (document.hidden) {
      clearTimeout(t);
      cleanup();
    }
  };
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVis);
    a.remove();
  };

  document.addEventListener('visibilitychange', onVis, { passive: true });

  a.click();
  setTimeout(cleanup, 2000);
}
