import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Music, ExternalLink } from 'lucide-react';
import type { BioLinkConfig } from '../types/links';

interface BioLink {
  id: string;
  title: string;
  slug: string;
  link_type: string;
  config: BioLinkConfig;
  cover_image_url?: string | null;
  user_id: string;
}

export default function BioLinkLanding() {
  const { slug } = useParams();
  const [link, setLink] = useState<BioLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchBioLink();
    }
  }, [slug]);

  const fetchBioLink = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('smart_links')
        .select('*')
        .eq('slug', slug)
        .eq('link_type', 'bio')
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Bio link not found');
      } else {
        setLink(data);
      }
    } catch (err: any) {
      console.error('Error fetching bio link:', err);
      setError(err.message || 'Failed to load bio');
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
          <p className="text-gray-400">{error || 'This bio link does not exist'}</p>
        </div>
      </div>
    );
  }

  const config = link.config || {};

  const musicPlatforms = [
    { name: 'Spotify', url: config.spotifyUrl, color: 'bg-green-600 hover:bg-green-700' },
    { name: 'Apple Music', url: config.appleMusicUrl, color: 'bg-pink-600 hover:bg-pink-700' },
    { name: 'YouTube Music', url: config.youtubeUrl, color: 'bg-red-600 hover:bg-red-700' },
    { name: 'SoundCloud', url: config.soundcloudUrl, color: 'bg-orange-600 hover:bg-orange-700' },
    { name: 'Tidal', url: config.tidalUrl, color: 'bg-blue-600 hover:bg-blue-700' },
  ].filter(platform => platform.url);

  const socialPlatforms = [
    { name: 'TikTok', url: config.tiktokUrl },
    { name: 'Instagram', url: config.instagramUrl },
    { name: 'Twitter', url: config.twitterUrl },
    { name: 'Other', url: config.otherSocialUrl },
  ].filter(platform => platform.url);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Profile Header */}
        <div className="text-center mb-8">
          {config.avatarUrl && (
            <div className="mb-6 flex justify-center">
              <img
                src={config.avatarUrl}
                alt={config.displayName || link.title}
                className="w-32 h-32 rounded-full border-4 border-gray-800 object-cover"
              />
            </div>
          )}

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            {config.displayName || link.title}
          </h1>

          {config.tagline && (
            <p className="text-lg text-gray-400">{config.tagline}</p>
          )}
        </div>

        {/* Main Content Card */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 space-y-6">
          {/* Primary Button */}
          {config.primaryButtonLabel && config.primaryButtonUrl && (
            <a
              href={config.primaryButtonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40"
            >
              {config.primaryButtonLabel}
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Highlighted Links */}
          {config.highlights && config.highlights.length > 0 && (
            <div className="space-y-3">
              {config.highlights.map((highlight, index) => (
                <a
                  key={index}
                  href={highlight.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-5 py-3.5 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 text-white rounded-xl transition-all group"
                >
                  <span className="font-medium">{highlight.label}</span>
                  <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                </a>
              ))}
            </div>
          )}

          {/* Music Platforms */}
          {musicPlatforms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                <Music className="w-4 h-4" />
                Listen Now
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {musicPlatforms.map((platform, index) => (
                  <a
                    key={index}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-4 py-3 ${platform.color} text-white font-medium rounded-lg transition-all text-center shadow-md hover:shadow-lg`}
                  >
                    {platform.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Social Media */}
          {socialPlatforms.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Connect
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {socialPlatforms.map((platform, index) => (
                  <a
                    key={index}
                    href={platform.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700 hover:border-gray-600 text-white font-medium rounded-lg transition-all"
                  >
                    {platform.name}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Create your own link in bio with{' '}
            <a href="https://ghoste.one" className="text-blue-400 hover:text-blue-300 transition-colors">
              Ghoste
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
