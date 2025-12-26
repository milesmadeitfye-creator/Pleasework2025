import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useSafeRealtime } from '../../hooks/useSafeRealtime';

type ManagerMessage = {
  id: string;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  summary?: string | null;
  action_label?: string | null;
  event_name?: string | null;
  type?: string | null;
  priority?: 'low' | 'normal' | 'high' | null;
  ctas?: Array<{ label: string; link: string; action: string }> | null;
  created_at: string;
};

type Props = {
  userId: string;
  limit?: number;
};

export function ManagerMessagesFeed({ userId, limit = 20 }: Props) {
  const [messages, setMessages] = useState<ManagerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Normalize message to ensure it has display text
  const normalizeMessage = (msg: ManagerMessage): ManagerMessage & { displayTitle: string; displayBody: string } => {
    // Try title fields in priority order
    const displayTitle =
      msg.title ||
      msg.summary ||
      msg.event_name ||
      msg.type ||
      'Manager Update';

    // Try body fields in priority order
    const displayBody =
      msg.body ||
      msg.message ||
      msg.summary ||
      msg.action_label ||
      'Ghoste checked in and reviewed your activity. Tap to view details.';

    return {
      ...msg,
      displayTitle: displayTitle.trim(),
      displayBody: displayBody.trim(),
      priority: msg.priority || 'normal',
      ctas: msg.ctas || [],
    };
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ghoste_agent_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[ManagerMessagesFeed] ghoste_agent_messages table missing or error:', error);
        setMessages([]);
        return;
      }

      // Filter out messages with no displayable content after normalization
      const normalized = (data || []).map(normalizeMessage).filter(msg =>
        msg.displayTitle || msg.displayBody
      );

      setMessages(normalized);
    } catch (err) {
      console.error('[ManagerMessagesFeed] fetch error', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [userId]);

  // Realtime updates
  useSafeRealtime(
    `manager-messages-${userId}`,
    (channel) => {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ghoste_agent_messages',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newMessage = payload.new as ManagerMessage;
          setMessages((prev) => [newMessage, ...prev]);
        }
      );
    },
    [userId]
  );

  const handleCTAClick = (cta: { label: string; link: string; action: string }) => {
    if (cta.link) {
      navigate(cta.link);
    }
  };

  const getPriorityColor = (priority?: string | null) => {
    switch (priority) {
      case 'high':
        return 'border-red-500/30 bg-red-500/5';
      case 'normal':
        return 'border-blue-500/30 bg-blue-500/5';
      case 'low':
        return 'border-slate-700 bg-slate-800/50';
      default:
        return 'border-slate-700 bg-slate-800/50';
    }
  };

  const getPriorityIcon = (priority?: string | null) => {
    switch (priority) {
      case 'high':
        return '🔥';
      case 'normal':
        return '💡';
      case 'low':
        return '📝';
      default:
        return '🤖';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-slate-400">Loading manager updates...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-6 py-12 text-center">
        <div className="text-4xl mb-3">🤖</div>
        <div className="text-sm font-medium text-slate-300 mb-2">No manager updates yet</div>
        <div className="text-xs text-slate-400">
          Ghoste AI will start checking in based on your manager mode settings. Make sure you have tokens in
          your Manager Budget.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const normalized = normalizeMessage(msg);
        return (
          <div key={msg.id} className={`rounded-xl border p-4 ${getPriorityColor(normalized.priority)}`}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="text-2xl">{getPriorityIcon(normalized.priority)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-100 text-sm mb-1">{normalized.displayTitle}</div>
                <div className="text-xs text-slate-400">
                  {new Date(msg.created_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              {normalized.priority === 'high' && (
                <div className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-semibold">
                  URGENT
                </div>
              )}
            </div>

            {/* Body */}
            <div className="text-sm text-slate-300 mb-3 whitespace-pre-line">{normalized.displayBody}</div>

            {/* CTAs */}
            {normalized.ctas && normalized.ctas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {normalized.ctas.map((cta, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleCTAClick(cta)}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors"
                  >
                    {cta.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
