import { useEffect, useState } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Music, Calendar, ExternalLink } from 'lucide-react';
import ShowLinkLanding from '../pages/ShowLinkLanding';
import BioLinkLanding from '../pages/BioLinkLanding';
import type { UnifiedLinkType } from '../types/links';
import { trackOutboundAndNavigate } from '../utils/trackOutboundAndNavigate';

interface Link {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  slug: string;
  link_type?: UnifiedLinkType;
  cover_image_url: string | null;
  spotify_url: string | null;
  apple_music_url: string | null;
  youtube_url: string | null;
  tidal_url: string | null;
  soundcloud_url: string | null;
  deezer_url: string | null;
  audiomack_url: string | null;
  is_active: boolean;
  total_clicks: number;
  pre_save_enabled: boolean;
  pre_save_date: string | null;
  created_at: string;
}

export default function LinkLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [link, setLink] = useState<Link | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState<string | null>(null);
  const [testEventCode, setTestEventCode] = useState<string | null>(null);
  const isDebug = searchParams.get('debug') === '1';

  useEffect(() => {
    if (slug) {
      fetchLink();
    }
  }, [slug]);

  useEffect(() => {
    if (link && metaPixelId) {
      initializeTracking();
    }
  }, [link, metaPixelId]);

  const initializeTracking = async () => {
    if (!link || !metaPixelId) return;

    try {
      const { track } = await import('../lib/metaTracking');
      const ctx = {
        userId: link.user_id,
        linkType: 'smart' as const,
        linkId: link.id,
        pixelId: metaPixelId,
        pixelEnabled: true,
        capiEnabled: true,
      };

      // Fire PageView + ViewContent with stable event_ids
      const pageViewEventId = `sl_${link.id}_pageview_${Date.now()}`;
      const viewContentEventId = `sl_${link.id}_viewcontent_${Date.now()}`;

      await Promise.all([
        track(ctx, 'PageView', {}, {}, { eventId: pageViewEventId }),
        track(ctx, 'ViewContent', {
          content_name: link.title,
          content_category: 'smart_link',
          content_type: 'music',
        }, {}, { eventId: viewContentEventId }),
      ]);
    } catch (e) {
      console.warn('[LinkLanding] Tracking init failed:', e);
    }
  };


  const fetchLink = async () => {
    try {
      // First try to fetch directly from database to check link_type
      const { data: linkData, error: dbError } = await supabase
        .from('smart_links')
        .select('*')
        .eq('slug', slug!)
        .maybeSingle();

      if (dbError) throw dbError;

      if (linkData) {
        setLink(linkData);
        // Fetch meta pixel config via public-safe endpoint
        try {
          const resp = await fetch('/.netlify/functions/smartlink-meta-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug }),
          });
          const json = await resp.json();

          if (json?.success && json?.pixel_id) {
            setMetaPixelId(json.pixel_id);
            setTestEventCode(json.test_event_code || null);
            console.log('[LinkLanding] Meta pixel loaded:', json.pixel_id);
          } else {
            console.log('[LinkLanding] No pixel configured for this link');
          }
        } catch (e) {
          console.warn('[LinkLanding] Could not fetch meta pixel config:', e);
        }
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('[LinkLanding] Error fetching link:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePlatformClick = async (url: string, platform: string) => {
    if (!url || !link) return;

    await trackOutboundAndNavigate(
      url,
      async () => {
        // Database tracking (best-effort)
        fetch('/.netlify/functions/track-smart-link-click', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            link_id: link.id,
            platform,
          }),
        }).catch((error) => {
          console.error('Failed to track click:', error);
        });

        // Meta Pixel + CAPI with keepalive for guaranteed delivery
        if (metaPixelId) {
          try {
            const { trackOutbound } = await import('../lib/metaTracking');
            const eventId = `sl_${link.id}_${platform.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
            await trackOutbound(
              {
                userId: link.user_id,
                linkType: 'smart',
                linkId: link.id,
                pixelId: metaPixelId,
                pixelEnabled: true,
                capiEnabled: true,
              },
              platform,
              url,
              { eventId, keepalive: true }
            );
          } catch (e) {
            console.warn('Meta tracking failed:', e);
          }
        }
      },
      { target: "_self", timeoutMs: 650 }
    );
  };

  const handlePresave = async (platform: string) => {
    if (!link) return;

    const email = prompt('Enter your email to pre-save:');
    if (!email) return;

    await supabase.from('presave_actions').insert([
      {
        link_id: link.id,
        email,
        platform
      }
    ]);

    alert('Thanks for pre-saving! We\'ll remind you when it drops.');

    if (platform === 'spotify' && link.spotify_url) {
      window.open(`/api/presave/spotify?linkId=${link.id}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Music className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Link Not Found</h1>
          <p className="text-gray-400">This link doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  // Route to appropriate landing page based on link_type
  if (link.link_type === 'show') {
    return <ShowLinkLanding />;
  }

  if (link.link_type === 'bio') {
    return <BioLinkLanding />;
  }

  if (link.link_type === 'presave') {
    return <Navigate to={`/presave/${slug}`} replace />;
  }

  if (link.link_type === 'email_capture') {
    return <Navigate to={`/capture/${slug}`} replace />;
  }

  // Default: Smart link view (or other link types)
  const isPresave = link.pre_save_enabled;
  const isBeforeRelease = isPresave && link.pre_save_date &&
    new Date(link.pre_save_date) > new Date();

  const platforms = [
    { name: 'Spotify', url: link.spotify_url, color: 'bg-green-500 hover:bg-green-600', icon: '🎵' },
    { name: 'Apple Music', url: link.apple_music_url, color: 'bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600', icon: '🍎' },
    { name: 'YouTube', url: link.youtube_url, color: 'bg-red-600 hover:bg-red-700', icon: '▶️' },
    { name: 'Tidal', url: link.tidal_url, color: 'bg-black hover:bg-gray-900', icon: '🌊' },
    { name: 'SoundCloud', url: link.soundcloud_url, color: 'bg-orange-500 hover:bg-orange-600', icon: '☁️' },
    { name: 'Deezer', url: link.deezer_url, color: 'bg-purple-600 hover:bg-purple-700', icon: '🎶' },
    { name: 'Audiomack', url: link.audiomack_url, color: 'bg-yellow-600 hover:bg-yellow-700', icon: '🔊' },
  ].filter((platform) => platform.url);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
          {link.cover_image_url && (
            <div className="w-full aspect-square bg-gray-800">
              <img
                src={link.cover_image_url}
                alt={link.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-8">
            <h1 className="text-3xl font-bold text-white mb-2 text-center">{link.title}</h1>
            {link.description && (
              <p className="text-gray-400 text-center mb-4">{link.description}</p>
            )}

            {isPresave && isBeforeRelease ? (
              <>
                <div className="flex items-center justify-center gap-2 text-blue-400 mb-6">
                  <Calendar className="w-5 h-5" />
                  <span>Releases {new Date(link.pre_save_date!).toLocaleDateString()}</span>
                </div>
                <p className="text-gray-400 text-center mb-6">Pre-save now to get it automatically when it drops!</p>
                <div className="space-y-3">
                  {platforms.filter(p => p.url).map((platform) => (
                    <button
                      key={platform.name}
                      onClick={() => handlePresave(platform.name.toLowerCase().replace(' ', '_'))}
                      className={`w-full ${platform.color} text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 flex items-center justify-between group`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-2xl">{platform.icon}</span>
                        <span>Pre-save on {platform.name}</span>
                      </span>
                      <ExternalLink className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-center mb-6">
                  {isPresave ? 'Now available!' : 'Listen now on your favorite platform'}
                </p>
                <div className="space-y-3">
                  {platforms.filter(p => p.url).map((platform) => (
                    <button
                      key={platform.name}
                      onClick={() => handlePlatformClick(platform.url!, platform.name)}
                      className={`w-full ${platform.color} text-white font-semibold py-4 px-6 rounded-xl transition-all transform hover:scale-105 flex items-center justify-between group`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-2xl">{platform.icon}</span>
                        <span>Play on {platform.name}</span>
                      </span>
                      <ExternalLink className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {platforms.filter(p => p.url).length === 0 && (
              <div className="text-center text-gray-400 py-8">
                <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No links available</p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            Powered by Ghoste
          </p>
        </div>
      </div>

      {/* Debug Overlay - Show with ?debug=1 */}
      {isDebug && (
        <div className="fixed bottom-4 right-4 w-80 max-h-[400px] overflow-y-auto bg-black/95 border border-green-500 rounded-lg p-4 text-xs font-mono text-white shadow-2xl z-50">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/20">
            <h3 className="font-bold text-green-400">Smart Link Debug</h3>
            <button
              onClick={() => window.location.href = window.location.href.replace('?debug=1', '').replace('&debug=1', '')}
              className="text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-green-400 font-semibold mb-1">Pixel Status</div>
              <div className="bg-white/5 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">Pixel ID:</span>
                  <span className={metaPixelId ? 'text-green-400' : 'text-red-400'}>
                    {metaPixelId || 'Not set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">fbq() Loaded:</span>
                  <span className={typeof (window as any).fbq === 'function' ? 'text-green-400' : 'text-red-400'}>
                    {typeof (window as any).fbq === 'function' ? '✓ Yes' : '✗ No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Test Code:</span>
                  <span className="text-yellow-400">
                    {testEventCode || 'None'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-green-400 font-semibold mb-1">Link Info</div>
              <div className="bg-white/5 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/60">Slug:</span>
                  <span className="text-white">{slug}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Link ID:</span>
                  <span className="text-white/80 text-[10px]">{link?.id?.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Type:</span>
                  <span className="text-white">{link?.link_type || 'smart'}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/20 text-white/40 text-[10px]">
              <div>Using smartlink-meta-config endpoint</div>
              <div className="mt-1">No user_profiles.meta_* queries</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
