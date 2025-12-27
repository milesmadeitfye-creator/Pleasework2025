import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Calendar, MapPin, Clock, Ticket, Info, ExternalLink } from 'lucide-react';
import type { ShowLinkConfig } from '../types/links';

interface ShowLink {
  id: string;
  title: string;
  slug: string;
  link_type: string;
  config: ShowLinkConfig;
  cover_image_url?: string | null;
  user_id: string;
}

export default function ShowLinkLanding() {
  const { slug } = useParams();
  const [link, setLink] = useState<ShowLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchShowLink();
    }
  }, [slug]);

  const fetchShowLink = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('smart_links')
        .select('*')
        .eq('slug', slug)
        .eq('link_type', 'show')
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Show not found');
      } else {
        setLink(data);
      }
    } catch (err: any) {
      console.error('Error fetching show link:', err);
      setError(err.message || 'Failed to load show');
    } finally {
      setLoading(false);
    }
  };

  const formatShowDate = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  };

  const formatDoorsTime = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
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
          <h1 className="text-2xl font-bold text-white mb-2">Show Not Found</h1>
          <p className="text-gray-400">{error || 'This show link does not exist'}</p>
        </div>
      </div>
    );
  }

  const config = link.config || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Cover Image */}
        {link.cover_image_url && (
          <div className="mb-6 rounded-2xl overflow-hidden">
            <img
              src={link.cover_image_url}
              alt={link.title}
              className="w-full h-64 object-cover"
            />
          </div>
        )}

        {/* Main Card */}
        <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 space-y-6">
          {/* Show Title */}
          <div className="text-center border-b border-gray-800 pb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
              {config.showTitle || link.title}
            </h1>
            {link.title !== config.showTitle && (
              <p className="text-lg text-gray-400">{link.title}</p>
            )}
          </div>

          {/* Date & Time */}
          {config.dateIso && (
            <div className="flex items-start gap-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <Calendar className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-400 mb-1">When</p>
                <p className="text-lg font-semibold text-white">
                  {formatShowDate(config.dateIso)}
                </p>
                {config.doorsTimeIso && (
                  <p className="text-sm text-gray-400 mt-2">
                    Doors open at {formatDoorsTime(config.doorsTimeIso)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Venue & Location */}
          {(config.venueName || config.city || config.address) && (
            <div className="flex items-start gap-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
              <MapPin className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-gray-400 mb-1">Where</p>
                {config.venueName && (
                  <p className="text-lg font-semibold text-white">{config.venueName}</p>
                )}
                {config.city && (
                  <p className="text-gray-300 mt-1">{config.city}</p>
                )}
                {config.address && (
                  <p className="text-sm text-gray-400 mt-2">{config.address}</p>
                )}
              </div>
            </div>
          )}

          {/* Ticket Button */}
          {config.ticketUrl && (
            <a
              href={config.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/40"
            >
              <Ticket className="w-5 h-5" />
              Get Tickets
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Additional Info */}
          {config.additionalInfo && (
            <div className="flex items-start gap-4 p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
              <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-gray-400 mb-1">Additional Information</p>
                <p className="text-gray-300 whitespace-pre-wrap">{config.additionalInfo}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Powered by{' '}
            <a href="https://ghoste.one" className="text-blue-400 hover:text-blue-300 transition-colors">
              Ghoste
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
