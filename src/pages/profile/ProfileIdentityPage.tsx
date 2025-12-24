import { useState, useEffect } from 'react';
import { PageShell } from '../../components/layout/PageShell';
import { ProfileTabs } from '../../components/profile/ProfileTabs';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const GENRE_OPTIONS = [
  'Pop', 'Rock', 'Hip Hop', 'R&B', 'Electronic', 'Country', 'Jazz', 'Classical',
  'Blues', 'Reggae', 'Metal', 'Punk', 'Indie', 'Folk', 'Soul', 'Funk', 'Disco',
  'House', 'Techno', 'Trance', 'Dubstep', 'Trap', 'Lo-Fi', 'Ambient', 'Alternative'
];

export default function ProfileIdentityPage() {
  const { user } = useAuth();
  const [genres, setGenres] = useState<string[]>([]);
  const [similarArtists, setSimilarArtists] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfileData();
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('genres, similar_artists')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setGenres(data.genres || []);
        setSimilarArtists(data.similar_artists || '');
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenreToggle = (genre: string) => {
    setGenres(prev => {
      if (prev.includes(genre)) {
        return prev.filter(g => g !== genre);
      } else if (prev.length < 5) {
        return [...prev, genre];
      }
      return prev;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          genres,
          similar_artists: similarArtists,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setMessage('Profile updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setMessage('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Profile">
        <ProfileTabs />
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ghoste-blue"></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Profile">
      <ProfileTabs />
      <div className="max-w-3xl space-y-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-ghoste-white mb-4">
            Your Music Genres
          </h3>
          <p className="text-sm text-ghoste-grey mb-4">
            Select up to 5 genres that best describe your music. This helps us personalize your experience.
          </p>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map(genre => (
              <button
                key={genre}
                onClick={() => handleGenreToggle(genre)}
                disabled={!genres.includes(genre) && genres.length >= 5}
                className={[
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  genres.includes(genre)
                    ? 'bg-ghoste-blue text-white shadow-[0_0_15px_rgba(26,108,255,0.5)]'
                    : 'bg-white/5 text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white',
                  !genres.includes(genre) && genres.length >= 5 && 'opacity-50 cursor-not-allowed'
                ].join(' ')}
              >
                {genre}
              </button>
            ))}
          </div>
          <p className="text-xs text-ghoste-grey mt-3">
            Selected: {genres.length}/5
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-ghoste-white mb-4">
            Similar Artists
          </h3>
          <p className="text-sm text-ghoste-grey mb-4">
            Enter up to 5 artists that your music sounds similar to. Separate them with commas.
            This is used for Meta Ads targeting keywords.
          </p>
          <textarea
            value={similarArtists}
            onChange={(e) => setSimilarArtists(e.target.value)}
            placeholder="e.g., Drake, The Weeknd, Post Malone"
            rows={3}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue focus:border-transparent resize-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="h-6">
            {message && (
              <p className={[
                'text-sm',
                message.includes('success') ? 'text-green-400' : 'text-red-400'
              ].join(' ')}>
                {message}
              </p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-ghoste-blue hover:bg-ghoste-blue/90 text-white rounded-full font-medium shadow-[0_0_20px_rgba(26,108,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
