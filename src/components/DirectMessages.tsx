import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Send, Search, User, ArrowLeft } from 'lucide-react';

interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface Conversation {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
}

export default function DirectMessages() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages();
      markAsRead();
      subscribeToMessages();
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    setLoading(true);

    const { data: sentMessages } = await supabase
      .from('direct_messages')
      .select('receiver_id, message, created_at')
      .eq('sender_id', user?.id)
      .order('created_at', { ascending: false });

    const { data: receivedMessages } = await supabase
      .from('direct_messages')
      .select('sender_id, message, created_at, read')
      .eq('receiver_id', user?.id)
      .order('created_at', { ascending: false });

    const userIds = new Set<string>();
    [...(sentMessages || []).map(m => m.receiver_id), ...(receivedMessages || []).map(m => m.sender_id)].forEach(id => userIds.add(id));

    if (userIds.size === 0) {
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('id', Array.from(userIds));

    const conversationMap = new Map<string, Conversation>();

    profiles?.forEach(profile => {
      const userMessages = [
        ...(sentMessages || []).filter(m => m.receiver_id === profile.id),
        ...(receivedMessages || []).filter(m => m.sender_id === profile.id)
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const unreadCount = (receivedMessages || [])
        .filter(m => m.sender_id === profile.id && !m.read)
        .length;

      if (userMessages.length > 0) {
        conversationMap.set(profile.id, {
          user_id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          last_message: userMessages[0].message,
          last_message_time: userMessages[0].created_at,
          unread_count: unreadCount,
        });
      }
    });

    const sortedConversations = Array.from(conversationMap.values())
      .sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());

    setConversations(sortedConversations);
    setLoading(false);
  };

  const fetchMessages = async () => {
    if (!selectedConversation) return;

    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user?.id},receiver_id.eq.${selectedConversation}),and(sender_id.eq.${selectedConversation},receiver_id.eq.${user?.id})`)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const markAsRead = async () => {
    if (!selectedConversation) return;

    await supabase
      .from('direct_messages')
      .update({ read: true })
      .eq('sender_id', selectedConversation)
      .eq('receiver_id', user?.id)
      .eq('read', false);

    fetchConversations();
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('direct_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          if (
            (newMsg.sender_id === user?.id && newMsg.receiver_id === selectedConversation) ||
            (newMsg.sender_id === selectedConversation && newMsg.receiver_id === user?.id)
          ) {
            setMessages((prev) => [...prev, newMsg]);
            if (newMsg.receiver_id === user?.id) {
              markAsRead();
            }
          }
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    await supabase
      .from('direct_messages')
      .insert([{
        sender_id: user?.id,
        receiver_id: selectedConversation,
        message: newMessage.trim(),
      }]);

    setNewMessage('');
  };

  const searchUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', user?.id)
      .limit(10);

    if (data) {
      setSearchResults(data);
    }
  };

  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const startConversation = async (userId: string) => {
    setSelectedConversation(userId);
    setSearchQuery('');
    setSearchResults([]);
    setStartError(null);
    await fetchConversations();
  };

  const selectedUser = conversations.find(c => c.user_id === selectedConversation) ||
    searchResults.find(u => u.id === selectedConversation);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (selectedConversation && selectedUser) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedConversation(null)}
            className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            {selectedUser.avatar_url ? (
              <img
                src={selectedUser.avatar_url}
                alt={selectedUser.display_name}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{selectedUser.display_name}</h2>
              <p className="text-sm text-gray-400">@{selectedUser.username}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isSender = message.sender_id === user?.id;
                return (
                  <div key={message.id} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${isSender ? 'bg-blue-600' : 'bg-gray-800'} rounded-lg px-4 py-3`}>
                      <p className="text-white break-words">{message.message}</p>
                      <p className="text-xs mt-1 opacity-70">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                );
              })
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Direct Messages</h2>
        <p className="text-gray-400">Send private messages to other users</p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by @username..."
          className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {searchResults.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="font-semibold mb-3">Search Results</h3>
          <div className="space-y-2">
            {searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => startConversation(user.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-800 rounded-lg transition-colors text-left"
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{user.display_name}</div>
                  <div className="text-sm text-gray-400">@{user.username}</div>
                  {user.bio && <div className="text-sm text-gray-500 truncate">{user.bio}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <User className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No conversations yet</h3>
          <p className="text-gray-400 mb-6">Search for users to start a conversation</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold">Conversations</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {conversations.map((conversation) => (
              <button
                key={conversation.user_id}
                onClick={() => setSelectedConversation(conversation.user_id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-800 transition-colors text-left"
              >
                {conversation.avatar_url ? (
                  <img
                    src={conversation.avatar_url}
                    alt={conversation.display_name}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{conversation.display_name}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(conversation.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400 truncate">@{conversation.username}</p>
                    {conversation.unread_count > 0 && (
                      <span className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-1">{conversation.last_message}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
