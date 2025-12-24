import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, Send, Tag, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Conversation {
  id: string;
  owner_user_id: string;
  platform: 'instagram' | 'facebook';
  page_id: string | null;
  ig_business_id: string | null;
  thread_id: string | null;
  fan_psid: string | null;
  fan_igid: string | null;
  fan_name: string | null;
  fan_username: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: Array<{ id: string; name: string; color: string | null }>;
  opt_ins?: Array<{ type: string; topic: string | null }>;
}

interface Message {
  id: string;
  conversation_id: string;
  owner_user_id: string;
  direction: 'inbound' | 'outbound';
  platform_message_id: string | null;
  message_type: string;
  text: string | null;
  payload: any;
  sent_at: string;
}

export default function Inbox() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fan_dm_conversations')
      .select(
        `
        *,
        tags:fan_dm_conversation_tags(
          tag:fan_dm_tags(id, name, color)
        ),
        opt_ins:fan_dm_opt_ins(type, topic)
      `
      )
      .eq('owner_user_id', user?.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      // Flatten tags
      const formatted = data.map((conv: any) => ({
        ...conv,
        tags: conv.tags?.map((t: any) => t.tag).filter(Boolean) || [],
        opt_ins: conv.opt_ins || [],
      }));

      setConversations(formatted);
      if (formatted.length > 0 && !selectedConversation) {
        setSelectedConversation(formatted[0]);
      }
    }
    setLoading(false);
  };

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('fan_dm_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageText.trim() || !selectedConversation || !user) return;

    setSending(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const response = await fetch('/.netlify/functions/fan-send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: selectedConversation.id,
          message: messageText,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessageText('');
        loadMessages(selectedConversation.id);
        showToast('Message sent', 'success');
      } else {
        showToast(result.message || 'Failed to send message', 'error');
      }
    } catch (err: any) {
      showToast('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(
    (conv) =>
      !searchQuery ||
      conv.fan_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.fan_username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canSend = selectedConversation && selectedConversation.last_inbound_at
    ? new Date().getTime() - new Date(selectedConversation.last_inbound_at).getTime() < 24 * 60 * 60 * 1000
    : false;

  const hasOptIn = (selectedConversation?.opt_ins?.length || 0) > 0;

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading conversations...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
      {/* Left: Conversations List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex flex-col">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No conversations yet. Messages from fans will appear here.
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedConversation?.id === conversation.id
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="font-medium truncate">
                    {conversation.fan_name || conversation.fan_username || 'Unknown Fan'}
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      conversation.platform === 'instagram'
                        ? 'bg-pink-500/20 text-pink-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {conversation.platform === 'instagram' ? 'IG' : 'FB'}
                  </span>
                </div>

                {conversation.tags && conversation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {conversation.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-xs text-gray-500 mt-1">
                  {conversation.updated_at && new Date(conversation.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Message Thread */}
      <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedConversation.fan_name || selectedConversation.fan_username || 'Unknown Fan'}
                  </h3>
                  {selectedConversation.fan_username && (
                    <div className="text-sm text-gray-400">@{selectedConversation.fan_username}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedConversation.tags && selectedConversation.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Tag className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-purple-400">{selectedConversation.tags.length}</span>
                    </div>
                  )}

                  {hasOptIn && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                      <CheckCircle className="w-3 h-3" />
                      Opt-in Active
                    </div>
                  )}

                  {canSend && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                      <Clock className="w-3 h-3" />
                      24h Window
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">No messages yet</div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        message.direction === 'outbound'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-100'
                      }`}
                    >
                      {message.text && <div className="text-sm">{message.text}</div>}
                      <div
                        className={`text-xs mt-1 ${
                          message.direction === 'outbound' ? 'text-blue-200' : 'text-gray-500'
                        }`}
                      >
                        {new Date(message.sent_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="p-4 border-t border-gray-800">
              {!canSend && !hasOptIn && (
                <div className="mb-3 text-xs text-yellow-500 flex items-center gap-1 bg-yellow-500/10 p-2 rounded">
                  <Clock className="w-3 h-3" />
                  Outside 24h window. Message requires opt-in or may be blocked.
                </div>
              )}

              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sending ? (
                    <>Sending...</>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a conversation to view messages
          </div>
        )}
      </div>
    </div>
  );
}
