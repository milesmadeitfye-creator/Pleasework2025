import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link2, Plus, Calendar, Target, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { useToast } from '../components/Toast';

type LinkType = 'smart' | 'presave' | 'deep';

interface Link {
  id: string;
  type: LinkType;
  slug: string;
  title: string;
  description: string | null;
  url_spotify: string | null;
  url_apple: string | null;
  url_youtube: string | null;
  url_tiktok: string | null;
  url_soundcloud: string | null;
  presave_release_date: string | null;
  deep_link_target: string | null;
  clicks: number;
  is_active: boolean;
  created_at: string;
}

export default function LinksPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<LinkType>('smart');
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url_spotify: '',
    url_apple: '',
    url_youtube: '',
    url_tiktok: '',
    url_soundcloud: '',
    presave_release_date: '',
    deep_link_target: ''
  });

  useEffect(() => {
    if (user) {
      fetchLinks();
    }
  }, [user, activeTab]);

  const fetchLinks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .eq('owner_id', user?.id)
      .eq('type', activeTab)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLinks(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      showToast('Please enter a title', 'error');
      return;
    }

    let slug = formData.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data: existing } = await supabase
      .from('links')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    const linkData: any = {
      owner_id: user?.id,
      type: activeTab,
      slug,
      title: formData.title,
      description: formData.description || null,
      clicks: 0,
      is_active: true
    };

    if (activeTab === 'smart') {
      linkData.url_spotify = formData.url_spotify || null;
      linkData.url_apple = formData.url_apple || null;
      linkData.url_youtube = formData.url_youtube || null;
      linkData.url_tiktok = formData.url_tiktok || null;
      linkData.url_soundcloud = formData.url_soundcloud || null;
    } else if (activeTab === 'presave') {
      linkData.url_spotify = formData.url_spotify || null;
      linkData.url_apple = formData.url_apple || null;
      linkData.presave_release_date = formData.presave_release_date || null;
    } else if (activeTab === 'deep') {
      linkData.deep_link_target = formData.deep_link_target || null;
    }

    const { error } = await supabase.from('links').insert([linkData]);

    if (error) {
      showToast('Error creating link: ' + error.message, 'error');
    } else {
      showToast('Link created successfully!', 'success');
      resetForm();
      setShowModal(false);
      fetchLinks();
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      url_spotify: '',
      url_apple: '',
      url_youtube: '',
      url_tiktok: '',
      url_soundcloud: '',
      presave_release_date: '',
      deep_link_target: ''
    });
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`https://ghoste.one/s/${slug}`);
    showToast('Link copied to clipboard!', 'success');
  };

  const deleteLink = async (id: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    const { error } = await supabase.from('links').delete().eq('id', id);

    if (error) {
      showToast('Error deleting link', 'error');
    } else {
      showToast('Link deleted', 'success');
      fetchLinks();
    }
  };

  const tabs: Array<{ id: LinkType; label: string; icon: any }> = [
    { id: 'smart', label: 'Smart Links', icon: Link2 },
    { id: 'presave', label: 'Pre-save', icon: Calendar },
    { id: 'deep', label: 'Deep Links', icon: Target }
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Links</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus className="w-5 h-5" />
          Create Link
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Link2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No links yet</h3>
          <p className="text-gray-500">Create your first {activeTab} link to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {links.map((link) => (
            <div
              key={link.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-1">{link.title}</h3>
                  {link.description && (
                    <p className="text-gray-400 text-sm mb-2">{link.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{link.clicks} clicks</span>
                    <span>ghoste.one/s/{link.slug}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyLink(link.slug)}
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <a
                    href={`/s/${link.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                  <button
                    onClick={() => deleteLink(link.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Create {activeTab === 'smart' ? 'Smart Link' : activeTab === 'presave' ? 'Pre-save Link' : 'Deep Link'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  rows={2}
                />
              </div>

              {(activeTab === 'smart' || activeTab === 'presave') && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Spotify URL</label>
                    <input
                      type="url"
                      value={formData.url_spotify}
                      onChange={(e) => setFormData({ ...formData, url_spotify: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      placeholder="https://open.spotify.com/track/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Apple Music URL</label>
                    <input
                      type="url"
                      value={formData.url_apple}
                      onChange={(e) => setFormData({ ...formData, url_apple: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      placeholder="https://music.apple.com/..."
                    />
                  </div>
                </>
              )}

              {activeTab === 'smart' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">YouTube URL</label>
                    <input
                      type="url"
                      value={formData.url_youtube}
                      onChange={(e) => setFormData({ ...formData, url_youtube: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      placeholder="https://youtube.com/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">TikTok URL</label>
                    <input
                      type="url"
                      value={formData.url_tiktok}
                      onChange={(e) => setFormData({ ...formData, url_tiktok: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      placeholder="https://tiktok.com/..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">SoundCloud URL</label>
                    <input
                      type="url"
                      value={formData.url_soundcloud}
                      onChange={(e) => setFormData({ ...formData, url_soundcloud: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      placeholder="https://soundcloud.com/..."
                    />
                  </div>
                </>
              )}

              {activeTab === 'presave' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Release Date</label>
                  <input
                    type="datetime-local"
                    value={formData.presave_release_date}
                    onChange={(e) => setFormData({ ...formData, presave_release_date: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                  />
                </div>
              )}

              {activeTab === 'deep' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Target URL *</label>
                  <input
                    type="url"
                    value={formData.deep_link_target}
                    onChange={(e) => setFormData({ ...formData, deep_link_target: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                    placeholder="https://..."
                    required
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
                >
                  Create Link
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg"
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
