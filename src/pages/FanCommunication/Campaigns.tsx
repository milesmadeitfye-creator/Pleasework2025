import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Send, Users, Tag, AlertCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  conversation_count?: number;
}

export default function Campaigns() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadTags();
    }
  }, [user]);

  useEffect(() => {
    if (selectedTags.length > 0) {
      countRecipients();
    } else {
      setRecipientCount(0);
    }
  }, [selectedTags]);

  const loadTags = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('fan_dm_tags')
      .select(
        `
        *,
        conversation_tags:fan_dm_conversation_tags(count)
      `
      )
      .eq('owner_user_id', user?.id);

    if (!error && data) {
      const formatted = data.map((tag: any) => ({
        ...tag,
        conversation_count: tag.conversation_tags?.[0]?.count || 0,
      }));

      setTags(formatted);
    }
    setLoading(false);
  };

  const countRecipients = async () => {
    if (selectedTags.length === 0) {
      setRecipientCount(0);
      return;
    }

    const { count, error } = await supabase
      .from('fan_dm_conversation_tags')
      .select('conversation_id', { count: 'exact', head: true })
      .in('tag_id', selectedTags);

    if (!error && count !== null) {
      setRecipientCount(count);
    }
  };

  const sendCampaign = async () => {
    if (!messageText.trim()) {
      showToast('Message is required', 'error');
      return;
    }

    if (selectedTags.length === 0) {
      showToast('Select at least one tag', 'error');
      return;
    }

    if (recipientCount === 0) {
      showToast('No recipients match the selected tags', 'error');
      return;
    }

    if (recipientCount > 25) {
      showToast('Beta limit: Max 25 recipients per campaign', 'error');
      return;
    }

    if (!confirm(`Send this message to ${recipientCount} fans?`)) {
      return;
    }

    setSending(true);

    try {
      const { data: conversations } = await supabase
        .from('fan_dm_conversation_tags')
        .select('conversation_id')
        .in('tag_id', selectedTags);

      if (!conversations || conversations.length === 0) {
        showToast('No conversations found', 'error');
        setSending(false);
        return;
      }

      const conversationIds = [...new Set(conversations.map((c) => c.conversation_id))];

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      let sent = 0;
      let blocked = 0;
      let failed = 0;

      for (const conversationId of conversationIds.slice(0, 25)) {
        try {
          const response = await fetch('/.netlify/functions/fan-send-message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              conversation_id: conversationId,
              message: messageText,
            }),
          });

          const result = await response.json();

          if (response.ok && result.success) {
            sent++;
          } else if (result.error?.includes('24h') || result.error?.includes('opt-in')) {
            blocked++;
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
        }
      }

      // Log campaign
      const campaignId = crypto.randomUUID();
      await supabase.from('fan_comms_events').insert([
        {
          owner_user_id: user?.id,
          source: 'campaign',
          event_type: 'campaign_sent',
          meta: {
            campaign_id: campaignId,
            tags: selectedTags,
            message: messageText,
            sent,
            blocked,
            failed,
            total: conversationIds.length,
          },
        },
      ]);

      const parts = [];
      if (sent > 0) parts.push(`${sent} sent`);
      if (blocked > 0) parts.push(`${blocked} blocked`);
      if (failed > 0) parts.push(`${failed} failed`);

      showToast(`Campaign complete: ${parts.join(', ')}`, sent > 0 ? 'success' : 'warning');

      setMessageText('');
      setSelectedTags([]);
    } catch (err: any) {
      showToast('Failed to send campaign', 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter((id) => id !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Fan Update Campaign</h2>
          <p className="text-gray-400 text-sm">Send messages to fans by tag segment (Beta - Max 25 recipients)</p>
        </div>

        {/* Tag Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Select Audience Tags</label>

          {tags.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm bg-gray-800 rounded-lg">
              No tags yet. Tags are created automatically by automations.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className={`p-3 rounded-lg border transition-colors text-left ${
                    selectedTags.includes(tag.id)
                      ? 'bg-purple-500/20 border-purple-500/50'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-purple-400" />
                    <span className="font-medium">{tag.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">{tag.conversation_count || 0} conversations</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Message Composer */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">Message</label>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
            placeholder="Type your message..."
            disabled={sending}
          />
        </div>

        {/* Recipient Count */}
        {selectedTags.length > 0 && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-blue-400">
              <Users className="w-5 h-5" />
              <span className="font-semibold">
                {recipientCount} recipient{recipientCount === 1 ? '' : 's'} will receive this message
              </span>
            </div>
            {recipientCount > 25 && (
              <div className="mt-2 text-xs text-yellow-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Beta limit: Only first 25 will be sent
              </div>
            )}
          </div>
        )}

        {/* Warning Banner */}
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-500">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              Messages respect 24h window + opt-in rules. Recipients outside the window or without opt-ins will be
              skipped.
            </div>
          </div>
        </div>

        {/* Send Button */}
        <button
          onClick={sendCampaign}
          disabled={sending || !messageText.trim() || selectedTags.length === 0 || recipientCount === 0}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {sending ? (
            <>Sending Campaign...</>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Campaign
            </>
          )}
        </button>
      </div>
    </div>
  );
}
