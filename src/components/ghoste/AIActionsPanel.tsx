import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSafeRealtime } from '../../hooks/useSafeRealtime';
import { notify } from '../../lib/notify';

type AIAction = {
  id: string;
  domain: string;
  action_type: string;
  title: string;
  payload: any;
  status: 'proposed' | 'approved' | 'executed' | 'failed' | 'cancelled';
  result: any;
  error: string | null;
  created_at: string;
  entity_id?: string;
};

type Props = {
  userId: string;
};

export function AIActionsPanel({ userId }: Props) {
  const [actions, setActions] = useState<AIAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchActions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_actions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['proposed', 'approved'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.warn('[AIActionsPanel] ai_actions table missing or error:', error);
        setActions([]);
        return;
      }
      setActions(data || []);
    } catch (err) {
      console.error('[AIActionsPanel] fetch error', err);
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, [userId]);

  // Realtime updates
  useSafeRealtime(
    `ai-actions-${userId}`,
    (channel) => {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_actions',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const newAction = payload.new as AIAction;
          if (newAction.status === 'proposed' || newAction.status === 'approved') {
            setActions((prev) => [newAction, ...prev]);
          }
        }
      );

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_actions',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const updatedAction = payload.new as AIAction;
          setActions((prev) => {
            if (updatedAction.status === 'executed' || updatedAction.status === 'cancelled' || updatedAction.status === 'failed') {
              return prev.filter((a) => a.id !== updatedAction.id);
            }
            return prev.map((a) => (a.id === updatedAction.id ? updatedAction : a));
          });
        }
      );
    },
    [userId]
  );

  const handleApprove = async (actionId: string) => {
    setProcessing(actionId);
    try {
      // First approve
      const { error: approveError } = await supabase
        .from('ai_actions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', actionId)
        .eq('user_id', userId);

      if (approveError) throw approveError;

      // Then execute
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error('No auth token');

      const response = await fetch('/.netlify/functions/ai-actions-execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action_id: actionId }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Execution failed');
      }

      notify('success', 'Action executed', result.result?.message || 'Action completed successfully');
      fetchActions();
    } catch (err: any) {
      console.error('[AIActionsPanel] approve error', err);
      notify('error', 'Action failed', err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const { error } = await supabase
        .from('ai_actions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', actionId)
        .eq('user_id', userId);

      if (error) throw error;

      notify('success', 'Action cancelled', '');
      fetchActions();
    } catch (err: any) {
      console.error('[AIActionsPanel] cancel error', err);
      notify('error', 'Failed to cancel', err.message);
    } finally {
      setProcessing(null);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'create_campaign':
        return '🚀';
      case 'pause_campaign':
        return '⏸️';
      case 'update_budget':
        return '💰';
      case 'refresh_performance':
        return '📊';
      default:
        return '⚡';
    }
  };

  const getActionColor = (domain: string) => {
    switch (domain) {
      case 'ads':
        return 'border-blue-500/30 bg-blue-500/10';
      case 'tasks':
        return 'border-green-500/30 bg-green-500/10';
      case 'content':
        return 'border-purple-500/30 bg-purple-500/10';
      default:
        return 'border-slate-700 bg-slate-800/50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-slate-400">Loading AI actions...</div>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-6 py-8 text-center">
        <div className="text-3xl mb-2">✨</div>
        <div className="text-sm font-medium text-slate-300 mb-1">No pending actions</div>
        <div className="text-xs text-slate-400">
          Your AI manager will propose actions when opportunities arise
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <div key={action.id} className={`rounded-xl border p-4 ${getActionColor(action.domain)}`}>
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div className="text-2xl">{getActionIcon(action.action_type)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-100 text-sm mb-1">{action.title}</div>
              <div className="text-xs text-slate-400">
                {action.domain} · {action.action_type} ·{' '}
                {new Date(action.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
            <div className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-semibold uppercase">
              {action.status}
            </div>
          </div>

          {/* Payload preview */}
          {action.payload && (
            <div className="mb-3 text-xs text-slate-400">
              {action.action_type === 'create_campaign' && (
                <div className="space-y-1">
                  <div>Platform: {action.payload.platform}</div>
                  <div>Budget: ${(action.payload.daily_budget_cents / 100).toFixed(2)}/day</div>
                  {action.payload.targeting?.geo && (
                    <div>Geo: {action.payload.targeting.geo.join(', ')}</div>
                  )}
                </div>
              )}
              {action.action_type === 'update_budget' && (
                <div>New budget: ${(action.payload.daily_budget_cents / 100).toFixed(2)}/day</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApprove(action.id)}
              disabled={processing === action.id}
              className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing === action.id ? 'Processing...' : 'Approve & Execute'}
            </button>
            <button
              type="button"
              onClick={() => handleCancel(action.id)}
              disabled={processing === action.id}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
