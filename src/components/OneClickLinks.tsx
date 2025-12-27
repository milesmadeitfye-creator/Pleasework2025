import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Link2, Copy, Check, ExternalLink, Trash2, BarChart3 } from 'lucide-react';
import { useToast } from './Toast';
import { useSpendCredits } from '../features/wallet/useSpendCredits';
import { CreditCostBadge } from '../features/wallet/CreditCostBadge';

interface DeepLink {
  id: string;
  title: string;
  target_url: string;
  short_code: string;
  clicks: number;
  created_at: string;
}

export default function OneClickLinks() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { spendForFeature, isSpending } = useSpendCredits();
  const [links, setLinks] = useState<DeepLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    target_url: '',
  });

  useEffect(() => {
    if (user) {
      fetchLinks();
    }
  }, [user]);

  const fetchLinks = async () => {
    setLoading(true);

    if (!supabase) {
      console.warn('[OneClickLinks] Supabase not ready, returning empty');
      setLinks([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('oneclick_links')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    setLinks(data ?? []);
    setLoading(false);
  };

  const generateShortCode = () => {
    return Math.random().toString(36).substring(2, 8);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.target_url) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    try {
      new URL(formData.target_url);
    } catch {
      showToast('Please enter a valid URL', 'error');
      return;
    }

    // Spend credits before creating link
    try {
      await spendForFeature('link_create_oneclick');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('PRO_REQUIRED')) {
        showToast('Ghoste Pro required for this feature', 'error');
      } else if (msg.includes('INSUFFICIENT')) {
        showToast('Not enough Tools credits. Top up your wallet to keep creating.', 'error');
      } else {
        showToast('Could not reserve credits for this action', 'error');
      }
      return;
    }

    const shortCode = generateShortCode();

    const insertPayload = {
      user_id: user?.id,
      title: formData.title,
      target_url: formData.target_url,
      short_code: shortCode,
      clicks: 0,
    };

    const { data, error } = await supabase
      .from('oneclick_links')
      .insert([insertPayload])
      .select('*');

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const isNoRows = msg.includes('no rows returned');

      if (!isNoRows) {
        showToast('Error creating link: ' + error.message, 'error');
        return;
      }
    }

    showToast('Deep link created successfully! 🎉', 'success');
    await fetchLinks();
    setFormData({
      title: '',
      target_url: '',
    });
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this deep link?')) {
      await supabase.from('oneclick_links').delete().eq('id', id);
      showToast('Link deleted', 'success');
      fetchLinks();
    }
  };

  const copyLink = (shortCode: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ghoste.one';
    const url = `${origin}/.netlify/functions/oneclick-redirect?code=${shortCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(shortCode);
    showToast('Link copied to clipboard! 📋', 'success');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="text-gray-400">
            Create short links that open content in native apps (Spotify, YouTube, etc.)
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Paste any URL and get a ghoste.one short link with automatic deep linking
          </p>
        </div>
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
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No deep links yet</h3>
          <p className="text-gray-500 mb-4">Create your first deep link to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {links.map((link) => (
            <div
              key={link.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{link.title}</h3>
                  <p className="text-sm text-gray-400 mb-2 break-all">{link.target_url}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" />
                      {link.clicks} clicks
                    </span>
                    <span className="flex items-center gap-1">
                      <ExternalLink className="w-4 h-4" />
                      <span className="truncate max-w-xs">
                        {typeof window !== 'undefined' ? window.location.origin : 'https://ghoste.one'}/.netlify/functions/oneclick-redirect?code={link.short_code}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(link.short_code)}
                    className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                    title="Copy link"
                  >
                    {copiedCode === link.short_code ? (
                      <Check className="w-5 h-5 text-green-400" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(link.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete link"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-2xl font-bold text-white">Create Deep Link</h2>
              <p className="text-gray-400 mt-1">
                Shorten any URL and enable automatic deep linking
              </p>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Link Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="My Spotify Song"
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Target URL *
                </label>
                <input
                  type="url"
                  value={formData.target_url}
                  onChange={(e) => setFormData({ ...formData, target_url: e.target.value })}
                  placeholder="https://open.spotify.com/track/..."
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Works with Spotify, Apple Music, YouTube, and more
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <div className="flex items-center justify-between px-1 mb-3">
                  <span className="text-xs text-slate-400">Link creation cost:</span>
                  <CreditCostBadge featureKey="link_create_oneclick" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ title: '', target_url: '' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSpending}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSpending ? 'Processing...' : 'Create Deep Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
