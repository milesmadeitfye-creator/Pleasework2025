import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, Tag as TagIcon, Users, CheckCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Tag {
  id: string;
  owner_user_id: string;
  name: string;
  color: string | null;
  created_at: string;
  conversation_count?: number;
}

interface OptIn {
  id: string;
  conversation_id: string;
  type: '24h' | 'otn' | 'recurring';
  topic: string | null;
  granted_at: string;
  expires_at: string | null;
  consumed: boolean;
  fan_name?: string;
  fan_username?: string;
  platform?: string;
}

export default function Audiences() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [optIns, setOptIns] = useState<OptIn[]>([]);
  const [view, setView] = useState<'tags' | 'optins'>('tags');
  const [loading, setLoading] = useState(true);
  const [showNewTagModal, setShowNewTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8b5cf6');

  useEffect(() => {
    if (user) {
      loadTags();
      loadOptIns();
    }
  }, [user]);

  const loadTags = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fan_dm_tags').select('*').eq('owner_user_id', user?.id);

    if (!error && data) {
      // Get conversation counts for each tag
      const tagsWithCounts = await Promise.all(
        data.map(async (tag) => {
          const { count } = await supabase
            .from('fan_dm_conversation_tags')
            .select('*', { count: 'exact', head: true })
            .eq('tag_id', tag.id);

          return {
            ...tag,
            conversation_count: count || 0,
          };
        })
      );

      setTags(tagsWithCounts);
    }
    setLoading(false);
  };

  const loadOptIns = async () => {
    const { data, error } = await supabase
      .from('fan_dm_opt_ins')
      .select(
        `
        *,
        conversation:fan_dm_conversations(
          fan_name,
          fan_username,
          platform
        )
      `
      )
      .eq('owner_user_id', user?.id)
      .order('granted_at', { ascending: false });

    if (!error && data) {
      const formatted = data.map((optin: any) => ({
        ...optin,
        fan_name: optin.conversation?.fan_name,
        fan_username: optin.conversation?.fan_username,
        platform: optin.conversation?.platform,
      }));

      setOptIns(formatted);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) {
      showToast('Tag name is required', 'error');
      return;
    }

    const { error } = await supabase.from('fan_dm_tags').insert([
      {
        owner_user_id: user?.id,
        name: newTagName,
        color: newTagColor,
      },
    ]);

    if (!error) {
      showToast('Tag created', 'success');
      setNewTagName('');
      setNewTagColor('#8b5cf6');
      setShowNewTagModal(false);
      loadTags();
    } else {
      showToast('Failed to create tag', 'error');
    }
  };

  const deleteTag = async (tagId: string, tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"? This will remove it from all conversations.`)) return;

    const { error } = await supabase.from('fan_dm_tags').delete().eq('id', tagId);

    if (!error) {
      showToast('Tag deleted', 'success');
      loadTags();
    } else {
      showToast('Failed to delete tag', 'error');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setView('tags')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            view === 'tags' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <TagIcon className="w-4 h-4 inline mr-2" />
          Tags ({tags.length})
        </button>
        <button
          onClick={() => setView('optins')}
          className={`px-4 py-2 rounded-lg transition-colors ${
            view === 'optins' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <CheckCircle className="w-4 h-4 inline mr-2" />
          Opt-Ins ({optIns.length})
        </button>
      </div>

      {/* Tags View */}
      {view === 'tags' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Manage Tags</h3>
            <button
              onClick={() => setShowNewTagModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Tag
            </button>
          </div>

          {tags.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
              <TagIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">No tags yet</p>
              <p className="text-gray-500 text-sm">Tags are created by automations or manually</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tags.map((tag) => (
                <div key={tag.id} className="bg-gray-900 rounded-lg border border-gray-800 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color || '#8b5cf6' }}
                      />
                      <h4 className="font-semibold">{tag.name}</h4>
                    </div>
                    <button
                      onClick={() => deleteTag(tag.id, tag.name)}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Users className="w-4 h-4" />
                    <span>{tag.conversation_count} conversations</span>
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    Created {new Date(tag.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Opt-Ins View */}
      {view === 'optins' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Opt-In Status</h3>

          {optIns.length === 0 ? (
            <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
              <CheckCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">No opt-ins yet</p>
              <p className="text-gray-500 text-sm">Opt-ins are granted by automations</p>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="text-left p-4 text-sm font-medium text-gray-300">Fan</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-300">Type</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-300">Topic</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-300">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-300">Granted</th>
                  </tr>
                </thead>
                <tbody>
                  {optIns.map((optin) => (
                    <tr key={optin.id} className="border-t border-gray-800">
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{optin.fan_name || optin.fan_username || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">
                            {optin.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            optin.type === 'recurring'
                              ? 'bg-purple-500/20 text-purple-400'
                              : optin.type === 'otn'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
                        >
                          {optin.type === 'otn'
                            ? 'One-Time'
                            : optin.type === 'recurring'
                            ? 'Recurring'
                            : '24h Window'}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-gray-400">{optin.topic || '-'}</td>
                      <td className="p-4">
                        {optin.consumed ? (
                          <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">Consumed</span>
                        ) : optin.expires_at && new Date(optin.expires_at) < new Date() ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Expired</span>
                        ) : (
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Active</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-gray-400">
                        {new Date(optin.granted_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New Tag Modal */}
      {showNewTagModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Create New Tag</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tag Name</label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="VIP, Newsletter, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Color</label>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-full h-10 bg-black border border-gray-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createTag}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create Tag
              </button>
              <button
                onClick={() => setShowNewTagModal(false)}
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
