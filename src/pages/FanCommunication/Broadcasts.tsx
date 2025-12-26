import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Send, Eye, Trash2, Calendar, Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Broadcast {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  sent_count: number;
  failed_count: number;
  created_at: string;
  scheduled_for: string | null;
}

interface Template {
  id: string;
  name: string;
  body: string;
  category: string;
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export default function Broadcasts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    body_override: '',
    audience: {
      tags: [] as string[],
      platform: '',
      has_24h_window: false,
    },
  });

  useEffect(() => {
    if (user) {
      loadBroadcasts();
      loadTemplates();
      loadTags();
    }
  }, [user]);

  const loadBroadcasts = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-broadcasts-crud', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok && result.broadcasts) {
        setBroadcasts(result.broadcasts);
      }
    } catch (error) {
      console.error('[Broadcasts] Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-templates-crud', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok && result.templates) {
        setTemplates(result.templates);
      }
    } catch (error) {
      console.error('[Broadcasts] Load templates error:', error);
    }
  };

  const loadTags = async () => {
    const { data } = await supabase.from('fan_dm_tags').select('*').eq('owner_user_id', user?.id);
    if (data) setTags(data);
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      template_id: '',
      body_override: '',
      audience: { tags: [], platform: '', has_24h_window: false },
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const createBroadcast = async () => {
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    if (!formData.template_id && !formData.body_override.trim()) {
      showToast('Select a template or enter custom message', 'error');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-broadcasts-crud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        showToast('Broadcast created', 'success');
        closeModal();
        loadBroadcasts();
      } else {
        showToast(result.error || 'Failed to create broadcast', 'error');
      }
    } catch (error) {
      showToast('Failed to create broadcast', 'error');
    }
  };

  const sendBroadcast = async (id: string) => {
    if (!confirm('Send this broadcast now? This will message all fans in the audience segment.')) return;

    setSending(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-broadcast-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ broadcast_id: id }),
      });

      const result = await response.json();

      if (response.ok) {
        showToast(`Broadcast sent to ${result.sent_count} fans`, 'success');
        loadBroadcasts();
      } else {
        showToast(result.error || 'Failed to send broadcast', 'error');
      }
    } catch (error) {
      showToast('Failed to send broadcast', 'error');
    } finally {
      setSending(null);
    }
  };

  const deleteBroadcast = async (id: string, name: string) => {
    if (!confirm(`Delete broadcast "${name}"?`)) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch(`/.netlify/functions/fan-broadcasts-crud?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        showToast('Broadcast deleted', 'success');
        loadBroadcasts();
      } else {
        showToast('Failed to delete broadcast', 'error');
      }
    } catch (error) {
      showToast('Failed to delete broadcast', 'error');
    }
  };

  const getStatusBadge = (broadcast: Broadcast) => {
    const badges = {
      draft: { icon: Clock, color: 'gray', label: 'Draft' },
      scheduled: { icon: Calendar, color: 'blue', label: 'Scheduled' },
      sending: { icon: Send, color: 'yellow', label: 'Sending...' },
      sent: { icon: CheckCircle, color: 'green', label: 'Sent' },
      failed: { icon: XCircle, color: 'red', label: 'Failed' },
    };

    const badge = badges[broadcast.status];
    const Icon = badge.icon;

    return (
      <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 bg-${badge.color}-500/20 text-${badge.color}-400`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading broadcasts...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Broadcasts</h2>
          <p className="text-gray-400 text-sm mt-1">Send bulk messages to fan segments</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Broadcast
        </button>
      </div>

      {/* Broadcasts List */}
      {broadcasts.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <Send className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-2">No broadcasts yet</p>
          <p className="text-gray-500 text-sm mb-4">
            Create a broadcast to message multiple fans at once
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Create Broadcast
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {broadcasts.map((broadcast) => (
            <div key={broadcast.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{broadcast.name}</h3>
                    {getStatusBadge(broadcast)}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    {broadcast.status === 'sent' && (
                      <>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          {broadcast.sent_count} sent
                        </div>
                        {broadcast.failed_count > 0 && (
                          <div className="flex items-center gap-1">
                            <XCircle className="w-4 h-4 text-red-400" />
                            {broadcast.failed_count} failed
                          </div>
                        )}
                      </>
                    )}
                    <div>Created {new Date(broadcast.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {broadcast.status === 'draft' && (
                    <button
                      onClick={() => sendBroadcast(broadcast.id)}
                      disabled={sending === broadcast.id}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      {sending === broadcast.id ? 'Sending...' : 'Send Now'}
                    </button>
                  )}
                  <button
                    onClick={() => deleteBroadcast(broadcast.id, broadcast.name)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create Broadcast</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Broadcast Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="New Release Promo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
                <select
                  value={formData.template_id}
                  onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                >
                  <option value="">-- Select Template --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mb-2">Or enter custom message:</p>
                <textarea
                  value={formData.body_override}
                  onChange={(e) => setFormData({ ...formData, body_override: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-24"
                  placeholder="Custom message..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Audience</label>
                <div className="space-y-3 bg-black border border-gray-700 rounded-lg p-4">
                  {tags.length > 0 && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => {
                          const isSelected = formData.audience.tags.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => {
                                const newTags = isSelected
                                  ? formData.audience.tags.filter((t) => t !== tag.id)
                                  : [...formData.audience.tags, tag.id];
                                setFormData({
                                  ...formData,
                                  audience: { ...formData.audience, tags: newTags },
                                });
                              }}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                isSelected
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-800 text-gray-400 hover:text-white'
                              }`}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Platform</label>
                    <select
                      value={formData.audience.platform}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          audience: { ...formData.audience, platform: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
                    >
                      <option value="">All Platforms</option>
                      <option value="instagram">Instagram Only</option>
                      <option value="facebook">Facebook Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.audience.has_24h_window}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            audience: { ...formData.audience, has_24h_window: e.target.checked },
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm text-gray-300">Only fans within 24h window</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createBroadcast}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create Broadcast
              </button>
              <button
                onClick={closeModal}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
