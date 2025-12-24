import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Users, Lock, Send, ArrowLeft, UserPlus, Trash2, User } from 'lucide-react';

interface Group {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  avatar_url: string;
  is_private: boolean;
  created_at: string;
  member_count?: number;
}

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_profiles: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user_profiles: {
    username: string;
    display_name: string;
  };
}

export default function FanGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    is_private: false,
  });

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user]);

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages();
      fetchMembers();
      subscribeToGroupMessages();
    }
  }, [selectedGroup]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchGroups = async () => {
    setLoading(true);
    const { data: groupsData } = await supabase
      .from('fan_groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (groupsData) {
      const groupsWithCount = await Promise.all(
        groupsData.map(async (group) => {
          const { count } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);

          return { ...group, member_count: (count || 0) + 1 };
        })
      );
      setGroups(groupsWithCount);
    }
    setLoading(false);
  };

  const fetchMessages = async () => {
    if (!selectedGroup) return;

    const { data } = await supabase
      .from('group_messages')
      .select(`
        *,
        user_profiles (username, display_name, avatar_url)
      `)
      .eq('group_id', selectedGroup)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      setMessages(data as GroupMessage[]);
    }
  };

  const fetchMembers = async () => {
    if (!selectedGroup) return;

    const { data } = await supabase
      .from('group_members')
      .select(`
        *,
        user_profiles (username, display_name)
      `)
      .eq('group_id', selectedGroup);

    const group = groups.find(g => g.id === selectedGroup);
    const { data: creatorProfile } = await supabase
      .from('user_profiles')
      .select('username, display_name')
      .eq('id', group?.creator_id)
      .maybeSingle();

    const allMembers = [
      ...(creatorProfile ? [{
        id: 'creator',
        user_id: group?.creator_id || '',
        role: 'creator',
        joined_at: group?.created_at || '',
        user_profiles: creatorProfile,
      }] : []),
      ...(data || [])
    ];

    setMembers(allMembers as Member[]);
  };

  const subscribeToGroupMessages = () => {
    if (!selectedGroup) return;

    const channel = supabase
      .channel(`group_messages_${selectedGroup}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${selectedGroup}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('group_messages')
            .select(`
              *,
              user_profiles (username, display_name, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data as GroupMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data, error } = await supabase
      .from('fan_groups')
      .insert([{
        creator_id: user?.id,
        ...createForm,
      }])
      .select()
      .single();

    if (!error && data) {
      fetchGroups();
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', is_private: false });
      setSelectedGroup(data.id);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;

    await supabase
      .from('group_messages')
      .insert([{
        group_id: selectedGroup,
        user_id: user?.id,
        message: newMessage.trim(),
      }]);

    setNewMessage('');
  };

  const joinGroup = async (groupId: string) => {
    await supabase
      .from('group_members')
      .insert([{
        group_id: groupId,
        user_id: user?.id,
        role: 'member',
      }]);

    fetchGroups();
    setSelectedGroup(groupId);
  };

  const leaveGroup = async (groupId: string) => {
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', user?.id);

    fetchGroups();
    setSelectedGroup(null);
  };

  const deleteGroup = async (groupId: string) => {
    if (confirm('Delete this group? This cannot be undone.')) {
      await supabase.from('fan_groups').delete().eq('id', groupId);
      fetchGroups();
      setSelectedGroup(null);
    }
  };

  const currentGroup = groups.find(g => g.id === selectedGroup);
  const isCreator = currentGroup?.creator_id === user?.id;
  const isMember = members.some(m => m.user_id === user?.id);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (selectedGroup && currentGroup) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedGroup(null)}
              className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{currentGroup.name}</h2>
                {currentGroup.is_private && <Lock className="w-5 h-5 text-gray-400" />}
              </div>
              <p className="text-gray-400">{currentGroup.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMembersModal(true)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              {members.length}
            </button>
            {isCreator && (
              <button
                onClick={() => deleteGroup(selectedGroup)}
                className="p-2 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            {!isCreator && isMember && (
              <button
                onClick={() => leaveGroup(selectedGroup)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Leave
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    {message.user_profiles?.avatar_url ? (
                      <img
                        src={message.user_profiles.avatar_url}
                        alt={message.user_profiles.display_name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold">{message.user_profiles?.display_name || 'User'}</span>
                      <span className="text-sm text-gray-500">@{message.user_profiles?.username || 'unknown'}</span>
                      <span className="text-xs text-gray-600">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-gray-300 break-words">{message.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="border-t border-gray-800 p-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                <Send className="w-5 h-5" />
                Send
              </button>
            </div>
          </form>
        </div>

        {showMembersModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-2xl font-bold mb-6">Members ({members.length})</h3>

              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="bg-black rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{member.user_profiles?.display_name || 'User'}</div>
                      <div className="text-sm text-gray-400">@{member.user_profiles?.username || 'unknown'}</div>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      member.role === 'creator' ? 'bg-yellow-500/20 text-yellow-400' :
                      member.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {member.role.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowMembersModal(false)}
                className="w-full mt-6 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Fan Groups</h2>
          <p className="text-gray-400">Create and join groups to connect with your community</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Group
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No groups yet</h3>
          <p className="text-gray-400 mb-6">Create the first group to get started</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold">{group.name}</h3>
                    {group.is_private && <Lock className="w-4 h-4 text-gray-400" />}
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{group.description}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Users className="w-4 h-4" />
                    <span>{group.member_count} members</span>
                  </div>
                </div>
              </div>

              {group.creator_id === user?.id ? (
                <button
                  onClick={() => setSelectedGroup(group.id)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Open
                </button>
              ) : members.some(m => m.user_id === user?.id) ? (
                <button
                  onClick={() => setSelectedGroup(group.id)}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  Open
                </button>
              ) : (
                <button
                  onClick={() => joinGroup(group.id)}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Join Group
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full">
            <h3 className="text-2xl font-bold mb-6">Create Fan Group</h3>

            <form onSubmit={createGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Group Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Fan Group"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="What's this group about?"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_private"
                  checked={createForm.is_private}
                  onChange={(e) => setCreateForm({ ...createForm, is_private: e.target.checked })}
                  className="w-5 h-5 bg-black border border-gray-700 rounded"
                />
                <label htmlFor="is_private" className="text-sm">Make this group private</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
