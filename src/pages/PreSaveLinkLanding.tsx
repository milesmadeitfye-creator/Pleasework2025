import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Calendar, Music, ExternalLink, Mail } from 'lucide-react';
import type { PreSaveLinkConfig } from '../types/links';

interface PreSaveLink {
  id: string;
  title: string;
  slug: string;
  link_type: string;
  config: PreSaveLinkConfig;
  cover_image_url?: string | null;
  user_id: string;
}

export default function PreSaveLinkLanding() {
  const { slug } = useParams();
  const [link, setLink] = useState<PreSaveLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [foreverSave, setForeverSave] = useState(true);

  useEffect(() => {
    if (slug) {
      fetchPreSaveLink();
    }
  }, [slug]);

  const fetchPreSaveLink = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('smart_links')
        .select('*')
        .eq('slug', slug)
        .eq('link_type', 'presave')
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Pre-save link not found');
      } else {
        setLink(data);
      }
    } catch (err: any) {
      console.error('Error fetching pre-save link:', err);
      setError(err.message || 'Failed to load pre-save');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !link) return;

    try {
      // Store in presave_leads table
      const { error: insertError } = await supabase
        .from('presave_leads')
        .insert({
          presave_id: link.id,
          owner_id: link.user_id,
          email: email,
          source: 'presave_link',
          metadata: { slug: link.slug, forever_save: foreverSave }
        });

      if (insertError) throw insertError;

      setEmailSubmitted(true);
    } catch (err: any) {
      console.error('Error submitting email:', err);
      // Allow duplicate emails gracefully
      if (err.message?.includes('duplicate') || err.code === '23505') {
        setEmailSubmitted(true);
      } else {
        alert('Failed to save your email. Please try again.');
      }
    }
  };

  const formatReleaseDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const isReleased = (isoString: string) => {
    return new Date(isoString) <= new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Pre-Save Not Found</h1>
          <p className="text-gray-400">{error || 'This pre-save link does not exist'}</p>
        </div>
      </div>
    );
  }

  const config = link.config || {};
  const released = config.releaseDateIso ? isReleased(config.releaseDateIso) : false;

  const handleSpotifyPreSave = async () => {
    // Require email first
    if (!emailSubmitted) {
      alert('Please enter your email first to continue');
      return;
    }

    // Start Spotify OAuth flow with forever_save preference
    const authUrl = `/.netlify/functions/spotify-auth-start?mode=presave&slug=${slug}&email=${encodeURIComponent(email)}&forever_save=${foreverSave}`;
    window.location.href = authUrl;
  };

  const handleApplePreAdd = async () => {
    // Require email first
    if (!emailSubmitted) {
      alert('Please enter your email first to continue');
      return;
    }

    // TODO: Start Apple Music OAuth flow
    alert('Apple Music pre-add coming soon! Your email has been saved.');
  };

  // Check for OAuth result in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const presaveStatus = urlParams.get('presave');

    if (presaveStatus === 'success') {
      setEmailSubmitted(true);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (presaveStatus && presaveStatus !== 'success') {
      alert(`Pre-save ${presaveStatus}. Please try again.`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // OAuth platforms (Pre-Save/Pre-Add)
  const oauthPlatforms = [
    {
      name: 'Spotify',
      enabled: config.spotify?.enabled,
      onClick: handleSpotifyPreSave,
      color: 'from-green-600 to-green-700',
      hoverColor: 'hover:from-green-700 hover:to-green-800',
      description: released ? 'Listen on Spotify' : 'Connect & Pre-Save'
    },
    {
      name: 'Apple Music',
      enabled: config.appleMusic?.enabled,
      onClick: handleApplePreAdd,
      color: 'from-pink-600 to-pink-700',
      hoverColor: 'hover:from-pink-700 hover:to-pink-800',
      description: released ? 'Listen on Apple Music' : 'Connect & Pre-Add'
    }
  ].filter(p => p.enabled);

  // One-click links (direct platform links)
  const oneClickLinks = [
    {
      name: 'Tidal',
      enabled: config.tidal?.enabled,
      url: config.tidal?.url,
      color: 'from-blue-600 to-blue-700',
      hoverColor: 'hover:from-blue-700 hover:to-blue-800'
    },
    {
      name: 'YouTube Music',
      enabled: config.youtubeMusic?.enabled,
      url: config.youtubeMusic?.url,
      color: 'from-red-600 to-red-700',
      hoverColor: 'hover:from-red-700 hover:to-red-800'
    },
    {
      name: 'Deezer',
      enabled: config.deezer?.enabled,
      url: config.deezer?.url,
      color: 'from-purple-600 to-purple-700',
      hoverColor: 'hover:from-purple-700 hover:to-purple-800'
    }
  ].filter(p => p.enabled && p.url);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Cover Image */}
        {config.coverImageUrl && (
          <div className="mb-6 rounded-2xl overflow-hidden shadow-2xl">
            <img
              src={config.coverImageUrl}
              alt={config.releaseTitle || link.title}
              className="w-full aspect-square object-cover"
            />
          </div>
        )}

        {/* Main Content Card */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 space-y-6">
          {/* Title & Date */}
          <div className="text-center border-b border-gray-800 pb-6">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-3">
              <Calendar className="w-4 h-4" />
              <span>
                {released ? 'Released' : 'Releasing'}{' '}
                {config.releaseDateIso && formatReleaseDate(config.releaseDateIso)}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
              {config.releaseTitle || link.title}
            </h1>
            {config.description && (
              <p className="text-gray-400 leading-relaxed max-w-xl mx-auto">
                {config.description}
              </p>
            )}
          </div>

          {/* Email Capture (Required First) */}
          {config.captureEmail !== false && !emailSubmitted && (
            <div className="p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Get Started</h3>
              </div>
              <p className="text-sm text-gray-300 mb-4">
                Enter your email to pre-save this release and stay updated.
              </p>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="w-full px-4 py-3 bg-gray-900/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                <div className="flex items-start gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                  <input
                    id="forever-save"
                    type="checkbox"
                    checked={foreverSave}
                    onChange={(e) => setForeverSave(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-emerald-500/50 bg-gray-900 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="forever-save" className="text-xs text-emerald-300/80 cursor-pointer">
                    <strong>Forever Save:</strong> Automatically save/add my future releases too (recommended)
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Continue
                </button>
              </form>
            </div>
          )}

          {/* OAuth Platform Buttons */}
          {emailSubmitted && oauthPlatforms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wide flex items-center gap-2">
                <Music className="w-4 h-4" />
                {released ? 'Listen Now' : 'Pre-Save / Pre-Add'}
              </h2>
              <div className="grid gap-3">
                {oauthPlatforms.map((platform, index) => (
                  <button
                    key={index}
                    onClick={platform.onClick}
                    className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r ${platform.color} ${platform.hoverColor} text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl group`}
                  >
                    <span>{platform.description}</span>
                    <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
              {foreverSave && (
                <p className="text-xs text-emerald-400/80 text-center">
                  Forever Save active - you'll auto-save future releases too
                </p>
              )}
            </div>
          )}

          {/* One-Click Links */}
          {oneClickLinks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                {released ? 'Also Available On' : 'One-Click Links'}
              </h2>
              <div className="grid gap-3">
                {oneClickLinks.map((platform, index) => (
                  <a
                    key={index}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r ${platform.color} ${platform.hoverColor} text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl group`}
                  >
                    <span>{released ? 'Listen on' : 'Open on'} {platform.name}</span>
                    <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Success state */}
          {emailSubmitted && oauthPlatforms.length === 0 && oneClickLinks.length === 0 && (
            <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
              <div className="flex items-center justify-center gap-2 text-green-400 mb-2">
                <Mail className="w-5 h-5" />
                <span className="font-semibold">Thanks for pre-saving!</span>
              </div>
              <p className="text-sm text-gray-300">
                You'll be notified when this release drops.
              </p>
            </div>
          )}

          {/* No platforms warning */}
          {!emailSubmitted && oauthPlatforms.length === 0 && oneClickLinks.length === 0 && (
            <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-xl text-center">
              <p className="text-gray-400">
                Pre-save links coming soon! Check back later.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Create your own pre-save campaign with{' '}
            <a href="https://ghoste.one" className="text-blue-400 hover:text-blue-300 transition-colors">
              Ghoste
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
