import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Music, ExternalLink } from 'lucide-react';
import { getMetaCookies } from '../lib/metaCookies';
import { trackSmartLinkEvent } from '../lib/smartlinkSession';
import { getPlatformClickEventName } from '../lib/metaPlatformEvents';

interface SmartLink {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  spotify_url: string | null;
  apple_music_url: string | null;
  youtube_url: string | null;
  tidal_url: string | null;
  soundcloud_url: string | null;
  user_id: string;
}

interface MetaCredentials {
  pixel_id: string | null;
  conversion_api_token: string | null;
  pixel_enabled: boolean;
  capi_enabled: boolean;
  test_event_code: string | null;
}

interface DebugInfo {
  pixelId: string | null;
  fbqLoaded: boolean;
  lastEvent: string | null;
  lastEventTime: number | null;
  lastError: string | null;
  cookies: { fbp: string | null; fbc: string | null };
  capiResponses: any[];
  trackingTimes: { event: string; elapsed: number }[];
}

function loadPixel(pixelId: string) {
  if ((window as any).fbq) return;

  (function(f: any, b: any, e: any, v: any) {
    if (f.fbq) return;
    const n: any = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  (window as any).fbq("init", pixelId);
}

// Generate unique event ID for deduplication
function generateEventId(prefix: string = 'sl'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export default function SmartLinkLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [link, setLink] = useState<SmartLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metaCreds, setMetaCreds] = useState<MetaCredentials | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    pixelId: null,
    fbqLoaded: false,
    lastEvent: null,
    lastEventTime: null,
    lastError: null,
    cookies: { fbp: null, fbc: null },
    capiResponses: [],
    trackingTimes: [],
  });

  const isDebug = searchParams.get('debug') === '1';
  const cookies = useMemo(() => getMetaCookies(), []);

  useEffect(() => {
    if (slug) {
      fetchLink();
    }
  }, [slug]);

  useEffect(() => {
    if (link) {
      initializeTracking();
    }
  }, [link]);

  const fetchLink = async () => {
    const { data, error } = await supabase
      .from('smart_links')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      setError(true);
    } else {
      setLink(data);
    }
    setLoading(false);
  };

  const initializeTracking = async () => {
    if (!link || !slug) return;

    console.log('[SmartLink] Initializing tracking for link:', link.id);

    // Track page view event
    trackSmartLinkEvent({
      smartlink_id: link.id,
      owner_user_id: link.user_id,
      event_type: 'page_view',
      meta: { slug }
    });

    // Load Meta credentials via backend endpoint (public-safe)
    try {
      const metaConfigResp = await fetch('/.netlify/functions/smartlink-meta-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });

      const metaConfig = await metaConfigResp.json();

      if (metaConfig.success && metaConfig.pixel_id) {
        const credData = {
          pixel_id: metaConfig.pixel_id,
          conversion_api_token: null, // Not exposed to frontend
          pixel_enabled: metaConfig.pixel_enabled ?? true,
          capi_enabled: metaConfig.capi_enabled ?? false,
          test_event_code: metaConfig.test_event_code || null,
        };

        console.log('[SmartLink] Meta config loaded:', {
          user_id: link.user_id,
          pixel_id: credData.pixel_id,
          has_pixel: !!credData.pixel_id,
          pixel_enabled: credData.pixel_enabled,
          capi_enabled: credData.capi_enabled,
          has_test_code: !!credData.test_event_code,
        });

        setMetaCreds(credData);

        // Continue with tracking initialization
        await setupPixelTracking(credData);
      } else {
        console.log('[SmartLink] No Meta pixel configured for this link');
      }
    } catch (err) {
      console.error('[SmartLink] Failed to load Meta config:', err);
    }
  };

  const setupPixelTracking = async (credData: MetaCredentials) => {
    if (!credData || !link) return;

    // Load and init Meta Pixel if available
    if (credData.pixel_id && credData.pixel_enabled !== false) {
      try {
        loadPixel(credData.pixel_id);

        console.log('[SmartLink] Pixel loaded:', credData.pixel_id);

        // Update debug info
        if (isDebug) {
          setDebugInfo(prev => ({
            ...prev,
            pixelId: credData.pixel_id,
            fbqLoaded: !!(window as any).fbq,
            cookies,
          }));
        }

        // Fire PageView (standard event) with event_id
        if ((window as any).fbq) {
          const pageViewEventId = generateEventId('pv');
          (window as any).fbq('track', 'PageView', {}, { eventID: pageViewEventId });
          console.log('[SmartLink] Pixel PageView fired', { event_id: pageViewEventId });

          if (isDebug) {
            setDebugInfo(prev => ({
              ...prev,
              lastEvent: `PageView (${pageViewEventId})`,
              lastEventTime: Date.now(),
            }));
          }

          // Fire PageView CAPI with same event_id for deduplication
          if (credData.capi_enabled) {
            fireCapiEvent({
              user_id: link.user_id,
              event_name: 'PageView',
              event_id: pageViewEventId,
              event_source_url: window.location.href,
              fbp: cookies.fbp,
              fbc: cookies.fbc,
              slug,
              link_id: link.id,
              track_title: link.title,
            });
          }
        }

        // Fire SmartLinkViewed (custom event) with event_id
        if ((window as any).fbq) {
          const viewEventId = generateEventId('slv');
          (window as any).fbq('trackCustom', 'SmartLinkViewed', {
            slug,
            track_title: link.title,
            link_id: link.id,
          }, { eventID: viewEventId });
          console.log('[SmartLink] Pixel SmartLinkViewed fired', { event_id: viewEventId });

          if (isDebug) {
            setDebugInfo(prev => ({
              ...prev,
              lastEvent: `SmartLinkViewed (${viewEventId})`,
              lastEventTime: Date.now(),
            }));
          }

          // Fire SmartLinkViewed CAPI with same event_id
          if (credData.capi_enabled) {
            fireCapiEvent({
              user_id: link.user_id,
              event_name: 'SmartLinkViewed',
              event_id: viewEventId,
              event_source_url: window.location.href,
              fbp: cookies.fbp,
              fbc: cookies.fbc,
              slug,
              link_id: link.id,
              track_title: link.title,
            });
          }
        }
      } catch (err: any) {
        console.error('[SmartLink] Pixel initialization error:', err);
        if (isDebug) {
          setDebugInfo(prev => ({
            ...prev,
            lastError: `Pixel init: ${err.message}`,
          }));
        }
      }
    }

    // Track click count in database
    await supabase.rpc('increment_smart_link_clicks', { link_id: link.id }).catch(() => {});

    // Load TikTok pixel if available (from user_profiles)
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('tiktok_pixel_id')
      .eq('user_id', link.user_id)
      .maybeSingle();

    if (profileData?.tiktok_pixel_id) {
      const { initTikTokPixel } = await import('../lib/tiktokPixel');
      initTikTokPixel(profileData.tiktok_pixel_id);
    }
  };

  const fireCapiEvent = async (payload: any): Promise<void> => {
    const url = `/.netlify/functions/meta-track-event`;

    console.log(`[SmartLinkTracking] Sending CAPI ${payload.event_name} via meta-track-event`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          link_type: 'smart_link',
          test_mode: isDebug, // Enables TEST62806 in debug mode
        }),
        keepalive: true,
      });

      const data = await res.json();
      console.log(`[SmartLinkTracking] CAPI ${payload.event_name} response:`, data);

      if (data.test_event_code) {
        console.log(`[SmartLinkTracking] ✓ Test code: ${data.test_event_code}`);
      }

      if (isDebug) {
        setDebugInfo(prev => ({
          ...prev,
          capiResponses: [...prev.capiResponses, { event: payload.event_name, data }],
        }));
      }

      if (!data.success) {
        console.error(`[SmartLink] CAPI ${payload.event_name} failed:`, data);
        if (isDebug) {
          setDebugInfo(prev => ({
            ...prev,
            lastError: `CAPI ${payload.event_name}: ${data.error || 'Failed'}`,
          }));
        }
      }
    } catch (err: any) {
      console.error(`[SmartLink] CAPI ${payload.event_name} error:`, err);
      if (isDebug) {
        setDebugInfo(prev => ({
          ...prev,
          lastError: `CAPI ${payload.event_name}: ${err.message}`,
        }));
      }
    }
  };

  // Fallback using sendBeacon for reliability during navigation
  const fireCapiEventWithBeacon = (payload: any): boolean => {
    const url = `/.netlify/functions/smartlink-capi-track`;

    if (!navigator.sendBeacon) {
      console.warn('[SmartLink] sendBeacon not available, using fetch with keepalive');
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_user_id: payload.user_id,
          event_name: payload.event_name,
          event_id: payload.event_id,
          event_source_url: payload.event_source_url,
          custom_data: {
            slug: payload.slug,
            link_id: payload.link_id,
            track_title: payload.track_title,
            platform: payload.platform,
            destination_url: payload.destination_url,
            value: 0.00,
            currency: 'USD',
          },
          fbp: payload.fbp,
          fbc: payload.fbc,
        }),
        keepalive: true,
      }).catch((err) => {
        console.warn('[SmartLink] CAPI fetch failed:', err);
      });
      return false;
    }

    try {
      const capiPayload = {
        owner_user_id: payload.user_id,
        event_name: payload.event_name,
        event_id: payload.event_id,
        event_source_url: payload.event_source_url,
        custom_data: {
          slug: payload.slug,
          link_id: payload.link_id,
          track_title: payload.track_title,
          platform: payload.platform,
          destination_url: payload.destination_url,
          value: 0.00,
          currency: 'USD',
        },
        fbp: payload.fbp,
        fbc: payload.fbc,
      };
      const blob = new Blob([JSON.stringify(capiPayload)], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      console.log(`[SmartLink] CAPI ${payload.event_name} sent via beacon:`, sent);
      return sent;
    } catch (err) {
      console.error(`[SmartLink] Beacon error:`, err);
      return false;
    }
  };

  const formatPlatformName = (platform: string): string => {
    // Convert platform name to TitleCase and remove spaces
    return platform
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  };

  // Fire-and-forget click tracking via Netlify function (uses service role)
  async function fireAndForgetTrackClick(payload: any) {
    try {
      fetch("/.netlify/functions/smartlink-track-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true, // helps when navigating away
      }).catch(() => {});
    } catch {
      // ignore
    }
  }

  // Ensure visitor ID exists
  const ensureVisitorId = (): string => {
    let visitorId = localStorage.getItem('ghoste_visitor_id');
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem('ghoste_visitor_id', visitorId);
    }
    return visitorId;
  };

  // Track link click via Netlify function (uses service role for anonymous access)
  async function trackLinkClickViaFunction(args: {
    owner_user_id: string;
    link_id?: string;
    platform: string;
  }) {
    try {
      const visitorId = ensureVisitorId();

      console.log("[ClickTrack] Sending click to server", {
        owner_user_id: args.owner_user_id,
        link_id: args.link_id,
        platform: args.platform,
        visitor_id: visitorId,
      });

      // Fire-and-forget (don't block navigation)
      fetch("/.netlify/functions/track-link-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_user_id: args.owner_user_id,
          link_id: args.link_id,
          link_type: "smart_link",
          platform: args.platform,
          referrer: document.referrer || null,
          visitor_id: visitorId,
        }),
        keepalive: true, // Important for "click then leave page"
      }).catch((err) => {
        console.warn("[ClickTrack] Failed to track click:", err);
      });
    } catch (err) {
      console.warn("[ClickTrack] Error tracking click:", err);
    }
  }

  const handlePlatformClick = async (url: string, platform: string) => {
    if (!url || !link || !slug) return;

    const normalizedPlatform = platform.toLowerCase().replace(/\s+/g, '_');

    console.log('[SmartLinkTracking] Platform click:', {
      platform: normalizedPlatform,
      url,
      slug,
      owner_user_id: link.user_id,
      link_id: link.id,
    });

    // ✅ FIRE META PIXEL + CAPI EVENTS BEFORE REDIRECT
    const genericEventId = generateEventId('click');
    const platformEventName = getPlatformClickEventName(platform);
    const platformEventId = generateEventId('plat');

    const eventParams = {
      slug,
      platform: normalizedPlatform,
      destination_url: url,
      track_title: link.title,
      link_id: link.id,
      value: 0.00,
      currency: 'USD',
    };

    // Fire Meta Pixel events (if pixel loaded)
    if ((window as any).fbq && metaCreds?.pixel_enabled !== false) {
      console.log('[SmartLinkTracking] Firing Pixel events:', {
        generic: 'SmartLinkClicked',
        platform: platformEventName,
      });

      // Generic click event
      (window as any).fbq('trackCustom', 'SmartLinkClicked', eventParams, { eventID: genericEventId });

      // Platform-specific click event
      (window as any).fbq('trackCustom', platformEventName, eventParams, { eventID: platformEventId });
    }

    // Fire CAPI events (if CAPI enabled) using sendBeacon for reliability
    if (metaCreds?.capi_enabled) {
      console.log('[SmartLinkTracking] Firing CAPI events via beacon');

      // Generic click event
      fireCapiEventWithBeacon({
        user_id: link.user_id,
        event_name: 'SmartLinkClicked',
        event_id: genericEventId,
        event_source_url: window.location.href,
        fbp: cookies.fbp,
        fbc: cookies.fbc,
        slug,
        link_id: link.id,
        track_title: link.title,
        platform: normalizedPlatform,
        destination_url: url,
      });

      // Platform-specific click event
      fireCapiEventWithBeacon({
        user_id: link.user_id,
        event_name: platformEventName,
        event_id: platformEventId,
        event_source_url: window.location.href,
        fbp: cookies.fbp,
        fbc: cookies.fbc,
        slug,
        link_id: link.id,
        track_title: link.title,
        platform: normalizedPlatform,
        destination_url: url,
      });
    }

    // Track click via service role function (fire-and-forget)
    fireAndForgetTrackClick({
      slug: slug ?? null,
      platform: normalizedPlatform,
      url: url,
      referrer: document.referrer || null,
      metadata: {
        ua: navigator.userAgent,
        ts: new Date().toISOString(),
        page: window.location.href,
      },
      user_id: null, // Anonymous click (public page)
    });

    // Track outbound click event with new analytics system
    trackSmartLinkEvent({
      smartlink_id: link.id,
      owner_user_id: link.user_id,
      event_type: 'outbound_click',
      platform: normalizedPlatform,
      outbound_url: url,
      meta: { slug }
    });

    // Track in legacy database tables (fire and forget)
    Promise.all([
      supabase.from('smart_link_clicks').insert([
        {
          smart_link_id: link.id,
          platform: normalizedPlatform,
          clicked_at: new Date().toISOString(),
        },
      ]),
      supabase.from('analytics_events').insert([
        {
          user_id: link.user_id,
          event_type: 'platform_click',
          smart_link_id: link.id,
          metadata: { platform, url },
        },
      ]),
    ]).catch(() => {});

    // TikTok pixel if available
    if (typeof window !== 'undefined' && (window as any).ttq) {
      try {
        const { trackTikTokSmartLinkClick } = await import('../lib/tiktokPixel');
        trackTikTokSmartLinkClick(link.title, platform);
      } catch {}
    }

    // ✅ SMALL DELAY BEFORE REDIRECT (allows tracking to fire)
    // Using setTimeout instead of routing through exit page for simpler flow
    console.log('[SmartLinkTracking] Redirecting in 250ms...');
    setTimeout(() => {
      window.location.href = url;
    }, 250);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-ghoste-black via-ghoste-navy to-ghoste-black flex items-center justify-center">
        <div className="text-ghoste-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-ghoste-black via-ghoste-navy to-ghoste-black flex items-center justify-center p-4">
        <div className="text-center">
          <Music className="w-16 h-16 text-ghoste-grey/40 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-ghoste-white mb-2">Link Not Found</h1>
          <p className="text-ghoste-grey">This smart link doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const extractSpotifyTrackId = (url: string) => {
    const match = url?.match(/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  };

  const extractYouTubeVideoId = (url: string) => {
    const match = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const spotifyTrackId = extractSpotifyTrackId(link.spotify_url || '');
  const youtubeVideoId = extractYouTubeVideoId(link.youtube_url || '');

  const getPlatformLogo = (platform: string) => {
    const logos: Record<string, JSX.Element> = {
      'Spotify': <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>,
      'Apple Music': <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18-.006.235-.009.47-.009.706v11.06c0 .05.003.1.004.15.004.387.01.773.046 1.157.076.81.27 1.58.646 2.29.645 1.224 1.609 2.05 2.952 2.488.542.177 1.097.267 1.66.323.24.024.48.035.721.044.05.002.1.007.15.01h12.042c.057-.002.114-.01.171-.01.52-.007 1.04-.02 1.557-.082.98-.116 1.91-.37 2.729-.93 1.162-.795 1.916-1.857 2.225-3.235.11-.49.156-.99.174-1.493.014-.4.02-.8.02-1.2V6.124zM7.874 14.873c0 .695-.008 1.39.002 2.085.004.25-.047.31-.292.297-.656-.038-1.32-.065-1.888-.445-.912-.612-1.356-1.62-1.116-2.722.19-.872.635-1.547 1.39-1.976 1.01-.574 2.188-.422 3.227.063-.006.672-.013 1.344-.018 2.015l-.006 1.637v.046zm8.753 2.06c-.003.448-.007.896-.01 1.345 0 .143-.05.21-.196.245-.825.195-1.656.32-2.506.29-.745-.026-1.448-.184-2.08-.57-1.16-.712-1.826-1.74-1.98-3.128-.088-.784.1-1.53.478-2.224.478-.88 1.164-1.545 2.09-1.95 1.358-.594 2.77-.496 4.13.15-.004.72-.007 1.438-.01 2.158-.003.72-.005 1.44-.008 2.16l-.003.524h-.005zm-.005-8.07c-.003.284-.005.568-.007.852-.003.736-.005 1.473-.01 2.21 0 .078-.034.14-.116.172-.17.066-.333.143-.506.202-.68.23-1.372.367-2.09.31-.827-.066-1.574-.35-2.203-.9-.66-.575-.995-1.29-1.015-2.16-.03-1.425.78-2.53 2.12-3.088 1.097-.457 2.227-.435 3.355-.036.068.024.106.083.104.155-.01.34-.007.68-.01 1.02.002.42.004.84.006 1.26l-.003.525-.02.478z"/></svg>,
      'YouTube': <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
      'Tidal': <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l-4.004 4.004 4.004 4.004 4.004-4.004L20.02 20.008l4.004-4.004-4.004-4.004 4.004-4.004-4.004-4.004-4.004 4.004z"/></svg>,
      'SoundCloud': <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c0-.057-.045-.1-.09-.1m-.899.828c-.051 0-.09.04-.099.09l-.182 1.324.182 1.283c.009.051.048.09.099.09.05 0 .09-.039.098-.09l.209-1.283-.209-1.324c-.009-.05-.048-.09-.098-.09m1.79-1.707c-.05 0-.081.039-.09.087l-.281 3.05.281 2.953c.009.049.04.09.09.09.05 0 .09-.041.099-.09l.307-2.953-.307-3.05c-.009-.048-.05-.087-.099-.087m.899-.231c-.059 0-.091.039-.101.088l-.265 3.28.265 3.17c.01.05.042.089.101.089.05 0 .089-.039.099-.089l.294-3.17-.294-3.28c-.01-.049-.05-.088-.099-.088m.899-.231c-.05 0-.09.04-.099.098l-.255 3.511.255 3.405c.009.059.049.099.099.099.059 0 .099-.04.108-.099l.281-3.405-.281-3.511c-.009-.058-.05-.098-.108-.098m.89-.281c-.059 0-.099.049-.108.107l-.24 3.792.24 3.695c.009.059.049.108.108.108.05 0 .099-.049.099-.108l.265-3.695-.265-3.792c0-.058-.049-.107-.099-.107m.899-.075c-.059 0-.099.058-.108.116l-.216 3.867.216 3.796c.009.059.049.108.108.108.059 0 .108-.049.116-.108l.242-3.796-.242-3.867c-.008-.058-.057-.116-.116-.116m.899.024c-.059 0-.099.049-.107.107l-.209 3.843.209 3.862c.008.059.048.108.107.108.06 0 .099-.049.108-.108l.233-3.862-.233-3.843c-.009-.058-.048-.107-.108-.107m.9.166c-.06 0-.1.049-.109.107l-.191 3.678.191 3.87c.009.058.049.107.109.107.058 0 .098-.049.108-.107l.216-3.87-.216-3.678c-.01-.058-.05-.107-.108-.107m.899.41c-.059 0-.099.049-.108.108l-.182 3.27.182 3.862c0 .059.049.108.108.108.059 0 .108-.049.116-.108l.209-3.862-.209-3.27c-.008-.059-.057-.108-.116-.108m.9.498c-.059 0-.108.058-.117.117l-.165 2.772.165 3.87c.009.058.058.116.117.116s.108-.058.116-.116l.191-3.87-.191-2.772c-.008-.059-.057-.117-.116-.117m.891.58c-.058 0-.108.057-.116.115l-.149 2.191.149 3.862c.008.059.058.116.116.116.059 0 .117-.057.117-.116l.174-3.862-.174-2.191c0-.058-.058-.115-.117-.115m.9.64c-.059 0-.108.058-.117.116l-.141 1.551.141 3.87c.009.057.058.115.117.115.058 0 .116-.058.116-.115l.165-3.87-.165-1.551c0-.058-.058-.116-.116-.116m.899.78c-.059 0-.116.057-.116.115l-.133.771.133 3.862c0 .058.057.116.116.116.059 0 .116-.058.125-.116l.149-3.862-.149-.771c-.009-.058-.066-.115-.125-.115m.9.078c-.059 0-.116.058-.116.116v3.87c0 .057.057.115.116.115.059 0 .116-.058.116-.115v-3.87c0-.058-.057-.116-.116-.116m13.775-5.956c-.58 0-1.141.108-1.645.298-1.107-2.639-3.695-4.496-6.717-4.496-2.313 0-4.379 1.09-5.717 2.795-.132.165-.182.373-.132.565.05.199.182.365.365.464l10.563 5.818c.108.05.216.075.332.075.108 0 .216-.025.315-.075l.016-.008c.191-.099.348-.266.398-.457.017-.058.025-.116.025-.174v-.017a2.925 2.925 0 0 1-.049-.548c0-1.654 1.339-3.001 2.993-3.001a2.997 2.997 0 0 1 2.993 3.001c0 1.655-1.339 3.001-2.993 3.001-.299 0-.582-.041-.856-.116-.041-.008-.083-.016-.116-.016-.175-.033-.358.016-.515.124-.141.1-.233.249-.249.415l-.124 1.332a.666.666 0 0 0 .682.715c.232 0 .465-.025.698-.066 2.746-.43 4.845-2.822 4.845-5.689 0-3.178-2.572-5.75-5.75-5.75z"/></svg>
    };
    return logos[platform] || <Music className="w-6 h-6" />;
  };

  const platforms = [
    { name: 'Spotify', url: link.spotify_url, color: 'bg-[#1DB954] hover:bg-[#1ed760]' },
    { name: 'Apple Music', url: link.apple_music_url, color: 'bg-gradient-to-r from-[#fa2d48] to-[#f44336] hover:from-[#fb4458] hover:to-[#f55545]' },
    { name: 'YouTube', url: link.youtube_url, color: 'bg-[#FF0000] hover:bg-[#ff1a1a]' },
    { name: 'Tidal', url: link.tidal_url, color: 'bg-[#000000] hover:bg-[#1a1a1a]' },
    { name: 'SoundCloud', url: link.soundcloud_url, color: 'bg-[#ff5500] hover:bg-[#ff6619]' },
  ].filter((platform) => platform.url);

  return (
    <div className="min-h-screen bg-gradient-to-b from-ghoste-black via-ghoste-navy to-ghoste-black text-ghoste-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between text-[10px] text-ghoste-grey">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
            Powered by Ghoste One
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {/* Large Hero Cover Art */}
          <div className="relative h-[280px] w-[280px] sm:h-[320px] sm:w-[320px] overflow-hidden rounded-3xl border border-white/10 bg-ghoste-black/80 shadow-[0_0_60px_rgba(26,108,255,0.15),0_24px_80px_rgba(0,0,0,0.9)]">
            {link.cover_image_url ? (
              <img
                src={link.cover_image_url}
                alt={link.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music className="h-20 w-20 text-ghoste-grey/40" />
              </div>
            )}
          </div>

          {/* Track Info */}
          <div className="text-center px-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ghoste-grey">
              Out now
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold leading-tight">{link.title}</h1>
            <p className="mt-1 text-[13px] text-ghoste-grey">Listen across all platforms</p>
          </div>

          {/* Platform Buttons */}
          <div className="w-full space-y-2.5 px-2 sm:px-0">
            {platforms.map((platform) => (
              <button
                key={platform.name}
                onClick={() => handlePlatformClick(platform.url!, platform.name)}
                className="flex w-full items-center justify-between gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-3 text-[13px] font-medium text-ghoste-white shadow-[0_18px_45px_rgba(0,0,0,0.7)] transition hover:border-ghoste-blue/70 hover:bg-ghoste-black/70 hover:shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
              >
                <div className="flex items-center gap-3">
                  {getPlatformLogo(platform.name)}
                  <span className="truncate">Play on {platform.name}</span>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ghoste-blue/90 text-[10px] shadow-[0_0_16px_rgba(26,108,255,0.9)]">
                  <ExternalLink className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>

          {platforms.length === 0 && (
            <div className="text-center text-ghoste-grey py-8">
              <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No streaming links available</p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-[10px] text-ghoste-grey">
          © {new Date().getFullYear()} · Powered by Ghoste One
        </div>
      </div>

      {/* Debug Overlay - Show with ?debug=1 */}
      {isDebug && (
        <div className="fixed bottom-4 right-4 w-96 max-h-[600px] overflow-y-auto bg-black/95 border border-blue-500 rounded-lg p-4 text-xs font-mono text-white shadow-2xl z-50">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/20">
            <h3 className="font-bold text-blue-400">Meta Tracking Debug</h3>
            <button
              onClick={() => window.location.href = window.location.href.replace('?debug=1', '').replace('&debug=1', '')}
              className="text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {/* Test Code Banner */}
            <div className="bg-purple-900/40 border border-purple-500 rounded p-2">
              <div className="text-purple-300 text-[10px] font-bold mb-1">🔬 TEST MODE ACTIVE</div>
              <div className="text-white/90 text-xs">
                test_event_code: <span className="text-purple-400 font-bold">TEST62806</span>
              </div>
              <div className="text-white/50 text-[10px] mt-1">
                All CAPI events include this test code for Meta Test Events dashboard
              </div>
            </div>

            <div>
              <div className="text-blue-400 font-semibold mb-1">Pixel Status</div>
              <div className="bg-white/5 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">Pixel ID:</span>
                  <span className="text-green-400">{debugInfo.pixelId || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">fbq() Loaded:</span>
                  <span className={debugInfo.fbqLoaded ? 'text-green-400' : 'text-red-400'}>
                    {debugInfo.fbqLoaded ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Last Event:</span>
                  <span className="text-yellow-400 text-right break-all max-w-[200px]">
                    {debugInfo.lastEvent || 'None'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-blue-400 font-semibold mb-1">Cookies</div>
              <div className="bg-white/5 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">_fbp:</span>
                  <span className={debugInfo.cookies.fbp ? 'text-green-400' : 'text-red-400'}>
                    {debugInfo.cookies.fbp ? '✓ Set' : '✗ Missing'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">_fbc:</span>
                  <span className={debugInfo.cookies.fbc ? 'text-green-400' : 'text-yellow-400'}>
                    {debugInfo.cookies.fbc ? '✓ Set' : '○ Optional'}
                  </span>
                </div>
              </div>
            </div>

            {debugInfo.lastError && (
              <div>
                <div className="text-red-400 font-semibold mb-1">Last Error</div>
                <div className="bg-red-950/40 border border-red-800/60 rounded p-2 text-red-300 break-words">
                  {debugInfo.lastError}
                </div>
              </div>
            )}

            <div>
              <div className="text-blue-400 font-semibold mb-1">
                CAPI Responses ({debugInfo.capiResponses.length})
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {debugInfo.capiResponses.length === 0 ? (
                  <div className="bg-white/5 rounded p-2 text-white/40 italic">
                    No CAPI events fired yet
                  </div>
                ) : (
                  debugInfo.capiResponses.map((resp, idx) => (
                    <div key={idx} className="bg-white/5 rounded p-2 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-yellow-400">{resp.event}</span>
                        <span className={resp.data.ok ? 'text-green-400' : 'text-red-400'}>
                          {resp.data.ok ? '✓' : '✗'}
                        </span>
                      </div>
                      {resp.data.error && (
                        <div className="text-red-400 text-[10px]">
                          Error: {resp.data.error}
                        </div>
                      )}
                      {resp.data.event_id && (
                        <div className="text-white/40 text-[10px]">
                          ID: {resp.data.event_id}
                        </div>
                      )}
                      {resp.data.test_event_code && (
                        <div className="text-purple-400 text-[10px]">
                          Test Code: {resp.data.test_event_code}
                        </div>
                      )}
                      {resp.data.diagnostics && (
                        <details className="mt-1">
                          <summary className="text-white/60 text-[10px] cursor-pointer">
                            Diagnostics
                          </summary>
                          <pre className="mt-1 text-[9px] text-white/60 overflow-x-auto">
                            {JSON.stringify(resp.data.diagnostics, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-white/20 text-white/40 text-[10px]">
              <div>Current URL: {window.location.href}</div>
              <div className="mt-1">
                Meta Credentials: {metaCreds ?
                  `Pixel ${metaCreds.pixel_enabled ? 'ON' : 'OFF'} / CAPI ${metaCreds.capi_enabled ? 'ON' : 'OFF'}` :
                  'Not loaded'
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
