import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Music, ExternalLink, Users, TrendingUp, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface SpotifyArtistConnection {
  id: string;
  artist_id: string;
  artist_name: string;
  image_url: string | null;
  followers: number;
  popularity: number;
  last_synced_at: string;
}

interface TopTrack {
  id: string;
  name: string;
  previewUrl: string | null;
  albumImage: string | null;
  url: string | null;
}

interface SpotifyArtistConnectProps {
  onOpenSettings?: () => void;
}

export default function SpotifyArtistConnect({ onOpenSettings }: SpotifyArtistConnectProps) {
  const { user } = useAuth();
  const [connection, setConnection] = useState<SpotifyArtistConnection | null>(null);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statsWarning, setStatsWarning] = useState<string | null>(null);
  const [spotifyStats, setSpotifyStats] = useState<{
    followers?: number | null;
    popularity?: number | null;
    artistName?: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      loadSpotifyData();
    }
  }, [user]);

  const loadSpotifyData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      console.log('[SpotifyArtist] Loading data for user:', user.id);

      // Load saved URL from user_profiles
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('spotify_artist_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[SpotifyArtist] Error loading profile:', profileError);
      } else if (profileData?.spotify_artist_url) {
        console.log('[SpotifyArtist] Loaded saved URL');
        setSpotifyUrl(profileData.spotify_artist_url);
      }

      // Load artist stats if they exist (non-fatal)
      try {
        const { data: connectionData, error: connectionError } = await supabase
          .from('spotify_artist_stats')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (connectionError) {
          console.warn('[SpotifyArtist] Stats table query failed (non-fatal):', connectionError);
        } else if (connectionData) {
          console.log('[SpotifyArtist] Connection found:', connectionData.artist_name);
          setConnection(connectionData);
        } else {
          console.log('[SpotifyArtist] No stats connection found');
        }
      } catch (statsErr) {
        console.warn('[SpotifyArtist] Stats connection check failed (non-fatal):', statsErr);
      }
    } catch (err) {
      console.error('[SpotifyArtist] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const syncSpotifyStats = async () => {
    setError(null);
    setSuccess(null);
    setStatsWarning(null);
    setSaving(true);

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      console.error("[SpotifyArtist] No user for stats sync", userError);
      setError("Could not sync stats (no user).");
      setSaving(false);
      return;
    }

    try {
      console.log('[SpotifyArtist] Syncing stats via Netlify function');

      const res = await fetch("/.netlify/functions/spotify-artist-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[SpotifyArtist] stats sync error", json);
        setError("Stats sync failed. Please check your URL in Platform Analytics Settings.");
        setSaving(false);
        return;
      }

      const s = json.stats;
      setSpotifyStats({
        followers: s?.followers ?? null,
        popularity: s?.popularity ?? null,
        artistName: s?.artist_name ?? null,
      });
      console.log('[SpotifyArtist] Stats synced:', s?.artist_name);
      setSuccess('Stats synced successfully!');
    } catch (err) {
      console.error("[SpotifyArtist] stats sync exception", err);
      setError("Stats sync failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (!user?.id) return;

    setError(null);
    setSuccess(null);
    setStatsWarning(null);
    setSaving(true);

    try {
      console.log('[SpotifyArtist] Refreshing stats for user:', user.id);

      const response = await fetch('/.netlify/functions/spotify-refresh-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('[SpotifyArtist] Refresh failed:', data);
        throw new Error(data.details || data.error || 'Failed to refresh stats');
      }

      setSuccess('Stats refreshed successfully!');
      await loadSpotifyData();
    } catch (err: any) {
      console.error('[SpotifyArtist] Refresh error:', err);
      setError(err.message || 'Failed to refresh stats');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
          <Music className="w-6 h-6 text-black" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-white">Spotify Artist Profile</h3>
          <p className="text-sm text-gray-400">Connect your Spotify artist page to see stats</p>
        </div>
      </div>

      {/* Success/Error/Warning Messages */}
      {success && !error && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {statsWarning && !error && (
        <div className="mb-4 p-3 bg-yellow-900/40 border border-yellow-500/30 rounded-lg flex items-center gap-2 text-yellow-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{statsWarning}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Sync Stats Button */}
      {!connection && spotifyUrl && (
        <div className="space-y-4">
          <div className="text-sm text-gray-400">
            Spotify URL configured. Click below to sync your latest stats.
          </div>
          <button
            onClick={syncSpotifyStats}
            disabled={saving}
            className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Music className="w-5 h-5" />
                Sync Stats
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            Edit Spotify URL in Platform Analytics Settings
          </button>
        </div>
      )}

      {/* No URL configured */}
      {!connection && !spotifyUrl && (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400 mb-4">
            Configure your Spotify Artist URL to view stats
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-sm text-green-400 hover:text-green-300 underline"
          >
            Open Platform Analytics Settings
          </button>
        </div>
      )}

      {/* Spotify Stats Display */}
      {spotifyStats && !connection && (
        <div className="mt-4 p-4 bg-black/40 rounded-lg border border-gray-800 space-y-2">
          <div className="text-sm font-semibold text-gray-300 mb-2">Artist Stats</div>
          {spotifyStats.artistName && (
            <div className="text-xs text-slate-200/80">
              <span className="font-semibold text-gray-400">Artist:</span>{" "}
              {spotifyStats.artistName}
            </div>
          )}
          {typeof spotifyStats.followers === "number" && (
            <div className="text-xs text-slate-200/80">
              <span className="font-semibold text-gray-400">Followers:</span>{" "}
              {spotifyStats.followers.toLocaleString()}
            </div>
          )}
          {typeof spotifyStats.popularity === "number" && (
            <div className="text-xs text-slate-200/80">
              <span className="font-semibold text-gray-400">Spotify popularity:</span>{" "}
              {spotifyStats.popularity}/100
            </div>
          )}
        </div>
      )}

      {/* Connected State */}
      {connection && (
        <div className="space-y-6">
          {/* Artist Info */}
          <div className="flex items-center gap-4">
            {connection.image_url && (
              <img
                src={connection.image_url}
                alt={connection.artist_name}
                className="w-20 h-20 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-white">{connection.artist_name}</h4>
              <a
                href={`https://open.spotify.com/artist/${connection.artist_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-400 hover:text-green-300 flex items-center gap-1 mt-1"
              >
                View on Spotify
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <button
              onClick={handleRefresh}
              disabled={saving}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-black/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">Followers</span>
              </div>
              <div className="text-2xl font-bold text-white">
                {connection.followers.toLocaleString()}
              </div>
            </div>

            <div className="bg-black/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs">Popularity</span>
              </div>
              <div className="text-2xl font-bold text-white">{connection.popularity}/100</div>
            </div>

            <div className="bg-black/50 rounded-lg p-4 col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs">Status</span>
              </div>
              <div className="text-sm font-semibold text-green-400">Connected</div>
            </div>
          </div>

          {/* Top Tracks */}
          {topTracks.length > 0 && (
            <div>
              <h5 className="text-sm font-semibold text-gray-300 mb-3">Top Tracks</h5>
              <div className="space-y-2">
                {topTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-3 bg-black/50 rounded-lg hover:bg-black/70 transition-colors"
                  >
                    <span className="text-sm text-gray-500 w-4">{idx + 1}</span>
                    {track.albumImage && (
                      <img
                        src={track.albumImage}
                        alt={track.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{track.name}</div>
                    </div>
                    {track.url && (
                      <a
                        href={track.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-green-400 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last Updated */}
          <p className="text-xs text-gray-500 text-center">
            Last updated: {new Date(connection.last_synced_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
