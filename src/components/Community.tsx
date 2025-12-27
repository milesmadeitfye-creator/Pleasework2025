import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Send, User } from 'lucide-react';

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  user_profiles: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
}

interface UserProfile {
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
}

export default function Community() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const [profileForm, setProfileForm] = useState({
    username: '',
    display_name: '',
    bio: '',
  });

  useEffect(() => {
    if (user) {
      checkProfile();
      fetchMessages();
      subscribeToMessages();
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkProfile = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user?.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
      setShowProfileSetup(false);
    } else {
      setShowProfileSetup(true);
    }
    setLoading(false);
  };

  const createProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from('user_profiles')
      .insert([{
        id: user?.id,
        ...profileForm,
      }]);

    if (!error) {
      checkProfile();
    } else {
      alert('Username already taken or invalid. Please try another.');
    }
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('community_messages')
      .select(`
        *,
        user_profiles (username, display_name, avatar_url)
      `)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) {
      setMessages(data as Message[]);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('community_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
        },
        async (payload) => {
          const { data } = await supabase
            .from('community_messages')
            .select(`
              *,
              user_profiles (username, display_name, avatar_url)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => [...prev, data as Message]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    await supabase
      .from('community_messages')
      .insert([{
        user_id: user?.id,
        message: newMessage.trim(),
      }]);

    setNewMessage('');
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  if (showProfileSetup) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <h2 className="text-3xl font-bold mb-2">Set Up Your Profile</h2>
          <p className="text-gray-400 mb-8">Create your username and profile to join the community</p>

          <form onSubmit={createProfile} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Username (with @) *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                  className="w-full pl-10 pr-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="yourname"
                  pattern="[a-zA-Z0-9_]{3,20}"
                  required
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">3-20 characters, letters, numbers, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Display Name *</label>
              <input
                type="text"
                value={profileForm.display_name}
                onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })}
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Your Name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Bio</label>
              <textarea
                value={profileForm.bio}
                onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tell us about yourself..."
                rows={4}
              />
            </div>

            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Create Profile
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Community Chat</h2>
        <p className="text-gray-400">Connect with other artists and fans</p>
      </div>

      <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 flex flex-col" style={{ height: 'calc(100vh - 280px)' }}>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No messages yet. Be the first to say hello!</p>
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
    </div>
  );
}
