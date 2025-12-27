import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Upload, Music, CheckCircle, Clock, Trash2 } from 'lucide-react';

interface Distribution {
  id: string;
  release_title: string;
  artist_name: string;
  release_type: string;
  cover_art_url: string;
  audio_file_url: string;
  release_date: string;
  platforms: string[];
  status: string;
  created_at: string;
}

export default function MusicDistribution() {
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    release_title: '',
    artist_name: '',
    release_type: 'single' as 'single' | 'ep' | 'album',
    release_date: '',
    platforms: [] as string[],
  });

  const platforms = ['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music', 'Tidal', 'Deezer', 'Pandora', 'SoundCloud'];

  useEffect(() => {
    if (user) {
      fetchDistributions();
    }
  }, [user]);

  const fetchDistributions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('distributions')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (data) {
      setDistributions(data);
    }
    setLoading(false);
  };

  const togglePlatform = (platform: string) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('distributions')
      .insert([{
        user_id: user?.id,
        ...formData,
        status: 'draft',
      }]);

    if (!error) {
      fetchDistributions();
      setFormData({
        release_title: '',
        artist_name: '',
        release_type: 'single',
        release_date: '',
        platforms: [],
      });
      setShowModal(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this distribution?')) {
      await supabase.from('distributions').delete().eq('id', id);
      fetchDistributions();
    }
  };

  const submitForReview = async (id: string) => {
    await supabase
      .from('distributions')
      .update({ status: 'submitted' })
      .eq('id', id);
    fetchDistributions();
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Music Distribution</h2>
          <p className="text-gray-400">Distribute your music to all major streaming platforms</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Release
        </button>
      </div>

      {distributions.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <Upload className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No distributions yet</h3>
          <p className="text-gray-400 mb-6">Upload and distribute your first release</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {distributions.map((dist) => (
            <div key={dist.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Music className="w-8 h-8 text-gray-600" />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">{dist.release_title}</h3>
                      <p className="text-gray-400 mb-2">{dist.artist_name}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">{dist.release_type.toUpperCase()}</span>
                        <span className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                          dist.status === 'live' ? 'bg-green-500/20 text-green-400' :
                          dist.status === 'submitted' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {dist.status === 'live' && <CheckCircle className="w-3 h-3" />}
                          {dist.status === 'submitted' && <Clock className="w-3 h-3" />}
                          {dist.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(dist.id)}
                      className="p-2 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm text-gray-500 mb-2">Release Date: {new Date(dist.release_date).toLocaleDateString()}</p>
                    <div className="flex flex-wrap gap-2">
                      {dist.platforms.map((platform) => (
                        <span key={platform} className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>

                  {dist.status === 'draft' && (
                    <button
                      onClick={() => submitForReview(dist.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                    >
                      Submit for Review
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">New Music Release</h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Release Title *</label>
                <input
                  type="text"
                  value={formData.release_title}
                  onChange={(e) => setFormData({ ...formData, release_title: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Artist Name *</label>
                <input
                  type="text"
                  value={formData.artist_name}
                  onChange={(e) => setFormData({ ...formData, artist_name: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Release Type *</label>
                <select
                  value={formData.release_type}
                  onChange={(e) => setFormData({ ...formData, release_type: e.target.value as any })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="single">Single</option>
                  <option value="ep">EP</option>
                  <option value="album">Album</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Release Date *</label>
                <input
                  type="date"
                  value={formData.release_date}
                  onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-3">Distribution Platforms *</label>
                <div className="grid grid-cols-2 gap-3">
                  {platforms.map((platform) => (
                    <label
                      key={platform}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.platforms.includes(platform)
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.platforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{platform}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Create Release
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
