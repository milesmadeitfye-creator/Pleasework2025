import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ExternalLink, Copy, BarChart3, Trash2, Edit2, Link2 } from 'lucide-react';
import { useToast } from './Toast';

function generateShortCode(length = 7): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

interface SmartLink {
  id: string;
  title: string;
  description: string | null;
  slug: string;
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
  created_at: string;
}

export default function SmartLinks() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLink, setEditingLink] = useState<SmartLink | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    slug: '',
    cover_image_url: '',
    spotify_url: '',
    apple_music_url: '',
    youtube_url: '',
    tidal_url: '',
    soundcloud_url: '',
    deezer_url: '',
    audiomack_url: '',
  });

  useEffect(() => {
    if (user) {
      fetchLinks();
    }
  }, [user]);

  const fetchLinks = async () => {
    setLoading(true);

    if (!supabase) {
      console.warn('[SmartLinks] Supabase not ready, returning empty');
      setLinks([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('smart_links')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[SmartLinks] Error fetching:', error);
      setLinks([]);
    } else {
      setLinks(data ?? []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[SmartLinks] Starting smart link creation...');

    // Verify authentication with Supabase directly
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('[SmartLinks] Auth check result:', authUser ? `user ${authUser.id}` : 'no user', userError);

    if (userError) {
      console.error('[SmartLinks] Auth error:', userError);
      showToast('Authentication error. Please log in again.', 'error');
      return;
    }

    if (!authUser) {
      console.error('[SmartLinks] No authenticated user found');
      showToast('You must be logged in to create a smart link', 'error');
      return;
    }

    if (!formData.title.trim()) {
      showToast('Please enter a title for your smart link', 'warning');
      return;
    }

    // Auto-generate slug if not provided
    const finalSlug = formData.slug.trim() || generateShortCode();

    const { normalizeAllPlatformUrls } = await import('../lib/platformLinks');

    const normalizedUrls = normalizeAllPlatformUrls({
      spotify_url: formData.spotify_url || null,
      apple_music_url: formData.apple_music_url || null,
      youtube_url: formData.youtube_url || null,
      tidal_url: formData.tidal_url || null,
      soundcloud_url: formData.soundcloud_url || null,
      deezer_url: formData.deezer_url || null,
      audiomack_url: formData.audiomack_url || null,
    });

    const linkData: any = {
      title: formData.title,
      description: formData.description,
      slug: finalSlug,
      cover_image_url: formData.cover_image_url || null,
      ...normalizedUrls,
      is_active: true,
      total_clicks: 0,
      total_views: 0,
    };

    if (editingLink) {
      const { error } = await supabase
        .from('smart_links')
        .update(linkData)
        .eq('id', editingLink.id);

      if (error) {
        console.error('Error updating link:', error);
        showToast('Error updating link: ' + error.message, 'error');
      } else {
        showToast('Smart link updated successfully!', 'success');
        await fetchLinks();
        resetForm();
      }
    } else {
      linkData.user_id = authUser.id;

      const { data, error } = await supabase
        .from('smart_links')
        .insert([linkData])
        .select('*');

      if (error) {
        console.error('Error creating link:', error);
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          showToast('A smart link with this slug already exists. Please choose a different slug.', 'error');
        } else if (error.message.includes('schema cache') || error.message.includes('not find the table')) {
          showToast('Database table missing. Run CREATE_ALL_TABLES.sql in Supabase SQL Editor.', 'error');
        } else if (error.message.includes('permission') || error.message.includes('RLS')) {
          showToast('Permission denied. Check your Supabase RLS policies.', 'error');
        } else {
          showToast('Error creating link: ' + error.message, 'error');
        }
      } else {
        console.log('[SmartLinks] Smart link created successfully!', data);
        showToast('Smart link created successfully!', 'success');
        await fetchLinks();
        resetForm();
        console.log('[SmartLinks] Post-creation cleanup complete, staying on dashboard');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this smart link?')) {
      const { error } = await supabase.from('smart_links').delete().eq('id', id);
      if (error) {
        showToast('Error deleting link: ' + error.message, 'error');
      } else {
        showToast('Smart link deleted successfully', 'success');
        fetchLinks();
      }
    }
  };

  const copyLink = (slug: string) => {
    const baseUrl = import.meta.env.VITE_SITE_URL || 'https://ghoste.one';
    // Use /s/ for direct redirects
    navigator.clipboard.writeText(`${baseUrl}/s/${slug}`);
    showToast('Link copied to clipboard!', 'success');
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      slug: '',
      cover_image_url: '',
      spotify_url: '',
      apple_music_url: '',
      youtube_url: '',
      tidal_url: '',
      soundcloud_url: '',
      deezer_url: '',
      audiomack_url: '',
    });
    setEditingLink(null);
    setShowModal(false);
  };

  const startEdit = (link: SmartLink) => {
    setFormData({
      title: link.title,
      description: link.description || '',
      slug: link.slug,
      cover_image_url: link.cover_image_url || '',
      spotify_url: link.spotify_url || '',
      apple_music_url: link.apple_music_url || '',
      youtube_url: link.youtube_url || '',
      tidal_url: link.tidal_url || '',
      soundcloud_url: link.soundcloud_url || '',
      deezer_url: link.deezer_url || '',
      audiomack_url: link.audiomack_url || '',
    });
    setEditingLink(link);
    setShowModal(true);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-400">Create smart links for your music releases</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Link
        </button>
      </div>

      {links.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Link2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No smart links yet</h3>
          <p className="text-gray-500 mb-4">Create your first smart link to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {links.map((link) => (
            <div
              key={link.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4 flex-1">
                  {link.cover_image_url && (
                    <img
                      src={link.cover_image_url}
                      alt={link.title}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{link.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-4 h-4" />
                        {link.total_clicks} clicks
                      </span>
                      <span className="flex items-center gap-1">
                        <ExternalLink className="w-4 h-4" />
                        /l/{link.slug}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {link.spotify_url && (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                          Spotify
                        </span>
                      )}
                      {link.apple_music_url && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                          Apple Music
                        </span>
                      )}
                      {link.youtube_url && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                          YouTube
                        </span>
                      )}
                      {link.tidal_url && (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                          Tidal
                        </span>
                      )}
                      {link.soundcloud_url && (
                        <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded">
                          SoundCloud
                        </span>
                      )}
                      {link.deezer_url && (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                          Deezer
                        </span>
                      )}
                      {link.audiomack_url && (
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                          Audiomack
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(link.slug)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => startEdit(link)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(link.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              {editingLink ? 'Edit Smart Link' : 'Create Smart Link'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Slug (URL path) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })
                  }
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-awesome-song"
                  required
                  disabled={!!editingLink}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tell your fans about this track..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Cover Image URL</label>
                <input
                  type="url"
                  value={formData.cover_image_url}
                  onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Spotify URL</label>
                  <input
                    type="url"
                    value={formData.spotify_url}
                    onChange={(e) => setFormData({ ...formData, spotify_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://open.spotify.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Apple Music URL</label>
                  <input
                    type="url"
                    value={formData.apple_music_url}
                    onChange={(e) => setFormData({ ...formData, apple_music_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://music.apple.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">YouTube URL</label>
                  <input
                    type="url"
                    value={formData.youtube_url}
                    onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://youtube.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tidal URL</label>
                  <input
                    type="url"
                    value={formData.tidal_url}
                    onChange={(e) => setFormData({ ...formData, tidal_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://tidal.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">SoundCloud URL</label>
                  <input
                    type="url"
                    value={formData.soundcloud_url}
                    onChange={(e) => setFormData({ ...formData, soundcloud_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://soundcloud.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Deezer URL</label>
                  <input
                    type="url"
                    value={formData.deezer_url}
                    onChange={(e) => setFormData({ ...formData, deezer_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://deezer.com/..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Audiomack URL</label>
                  <input
                    type="url"
                    value={formData.audiomack_url}
                    onChange={(e) => setFormData({ ...formData, audiomack_url: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://audiomack.com/..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  {editingLink ? 'Update Link' : 'Create Link'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
