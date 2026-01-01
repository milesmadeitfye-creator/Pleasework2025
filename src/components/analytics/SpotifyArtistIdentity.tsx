import { useState, useEffect } from 'react';
import { Music, CheckCircle, AlertCircle, Search, X, Loader } from 'lucide-react';
import {
  ArtistIdentity,
  SpotifyArtist,
  getPrimaryArtistIdentity,
  hasSpotifyConnected,
  startSpotifyAuth,
  completeSpotifyAuth,
  searchSpotifyArtists,
  saveSpotifyArtist,
  linkSongstatsArtist,
} from '../../lib/spotify/artistIdentity';

interface SpotifyArtistIdentityProps {
  onIdentityChange?: (identity: ArtistIdentity | null) => void;
}

export function SpotifyArtistIdentity({ onIdentityChange }: SpotifyArtistIdentityProps) {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<ArtistIdentity | null>(null);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [showArtistPicker, setShowArtistPicker] = useState(false);
  const [showSongstatsPicker, setShowSongstatsPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadIdentity();
    checkOAuthCallback();
  }, []);

  async function loadIdentity() {
    setLoading(true);
    const [identityData, connected] = await Promise.all([
      getPrimaryArtistIdentity(),
      hasSpotifyConnected(),
    ]);

    setIdentity(identityData);
    setSpotifyConnected(connected);
    setLoading(false);

    if (onIdentityChange) {
      onIdentityChange(identityData);
    }
  }

  async function checkOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state && params.get('spotify') === 'callback') {
      const success = await completeSpotifyAuth(code, state);
      if (success) {
        window.history.replaceState({}, '', window.location.pathname);
        await loadIdentity();
        setShowArtistPicker(true);
      }
    }
  }

  async function handleConnectSpotify() {
    const authUrl = await startSpotifyAuth();
    if (authUrl) {
      window.location.href = authUrl;
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;

    setSearching(true);
    const results = await searchSpotifyArtists(searchQuery);
    setSearchResults(results);
    setSearching(false);
  }

  async function handleSelectArtist(artist: SpotifyArtist) {
    setSaving(true);
    const success = await saveSpotifyArtist(artist);
    if (success) {
      await loadIdentity();
      setShowArtistPicker(false);
      setSearchQuery('');
      setSearchResults([]);
    }
    setSaving(false);
  }

  async function handleLinkSongstats(artistId: string, artistName: string) {
    setSaving(true);
    const success = await linkSongstatsArtist(artistId, artistName);
    if (success) {
      await loadIdentity();
      setShowSongstatsPicker(false);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-white/5 border border-ghoste-border p-6">
        <div className="flex items-center gap-2 text-ghoste-grey">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading artist identity...</span>
        </div>
      </div>
    );
  }

  // State: Not connected to Spotify
  if (!spotifyConnected) {
    return (
      <div className="rounded-lg bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/30 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-green-500/20">
            <Music className="w-6 h-6 text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-ghoste-white mb-1">
              Connect Your Artist Identity
            </h3>
            <p className="text-sm text-ghoste-grey mb-4">
              Confirm your artist identity and enable release detection.
            </p>
            <button
              onClick={handleConnectSpotify}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
            >
              Connect Spotify
            </button>
          </div>
        </div>
      </div>
    );
  }

  // State: Connected but no artist selected
  if (!identity?.spotify_artist_id) {
    return (
      <div className="rounded-lg bg-white/5 border border-ghoste-border p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-blue-500/20">
            <AlertCircle className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-ghoste-white mb-1">
              Select Your Artist
            </h3>
            <p className="text-sm text-ghoste-grey mb-4">
              Search and choose your Spotify artist profile.
            </p>
            <button
              onClick={() => setShowArtistPicker(true)}
              className="px-4 py-2 bg-ghoste-blue hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Select Artist
            </button>
          </div>
        </div>

        {/* Artist Picker Modal */}
        {showArtistPicker && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-ghoste-card rounded-xl border border-ghoste-border max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-ghoste-border">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-ghoste-white">Select Your Artist</h2>
                  <button
                    onClick={() => setShowArtistPicker(false)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-ghoste-grey" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search artist name..."
                    className="flex-1 px-4 py-2 bg-ghoste-bg border border-ghoste-border rounded-lg text-ghoste-white placeholder-ghoste-grey focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="px-4 py-2 bg-ghoste-blue hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {searching ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {searchResults.length === 0 ? (
                  <div className="text-center py-8 text-ghoste-grey">
                    Search for your artist name to get started
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((artist) => (
                      <button
                        key={artist.id}
                        onClick={() => handleSelectArtist(artist)}
                        disabled={saving}
                        className="w-full p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-ghoste-border transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-4">
                          {artist.image ? (
                            <img
                              src={artist.image}
                              alt={artist.name}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center">
                              <Music className="w-8 h-8 text-ghoste-grey" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="text-base font-semibold text-ghoste-white">
                              {artist.name}
                            </div>
                            <div className="text-sm text-ghoste-grey mt-1">
                              {artist.followers.toLocaleString()} followers
                            </div>
                            {artist.genres.length > 0 && (
                              <div className="text-xs text-ghoste-grey mt-1">
                                {artist.genres.slice(0, 3).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // State: Artist selected but Songstats not linked
  if (!identity.songstats_artist_id) {
    return (
      <div className="rounded-lg bg-white/5 border border-ghoste-border p-6">
        <div className="flex items-start gap-4">
          {identity.spotify_artist_image && (
            <img
              src={identity.spotify_artist_image}
              alt={identity.spotify_artist_name || ''}
              className="w-16 h-16 rounded-lg object-cover"
            />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-ghoste-white">
                {identity.spotify_artist_name}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                Spotify Connected
              </span>
            </div>
            <p className="text-sm text-ghoste-grey mb-3">
              Match your analytics profile so Ghoste knows this data is yours.
            </p>
            <button
              onClick={() => setShowSongstatsPicker(true)}
              className="px-4 py-2 bg-ghoste-blue hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Link Songstats
            </button>
          </div>
        </div>

        {/* Songstats Picker Modal (simplified) */}
        {showSongstatsPicker && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-ghoste-card rounded-xl border border-ghoste-border max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-ghoste-white">Link Songstats Artist</h2>
                <button
                  onClick={() => setShowSongstatsPicker(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-ghoste-grey" />
                </button>
              </div>
              <p className="text-sm text-ghoste-grey mb-4">
                Enter your Songstats artist ID or name to link your analytics.
              </p>
              <input
                type="text"
                placeholder="Songstats Artist ID"
                className="w-full px-4 py-2 mb-4 bg-ghoste-bg border border-ghoste-border rounded-lg text-ghoste-white placeholder-ghoste-grey focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) {
                      handleLinkSongstats(target.value.trim(), identity.spotify_artist_name || '');
                    }
                  }
                }}
              />
              <div className="text-xs text-ghoste-grey">
                Find your artist ID in your Songstats dashboard URL
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // State: Fully connected
  return (
    <div className="rounded-lg bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/30 p-6">
      <div className="flex items-start gap-4">
        {identity.spotify_artist_image && (
          <img
            src={identity.spotify_artist_image}
            alt={identity.spotify_artist_name || ''}
            className="w-16 h-16 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-ghoste-white">
              {identity.spotify_artist_name}
            </h3>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
              Spotify Connected
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              Songstats Linked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
