import { CheckCircle2, Circle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

type TodoItem = {
  id: string;
  label: string;
  done: boolean;
};

export function OverviewTodoBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([
    {
      id: 'connect-accounts',
      label: 'Connect Meta, TikTok, and Spotify accounts',
      done: false,
    },
    {
      id: 'create-smart-link',
      label: 'Create your first smart link or presave',
      done: false,
    },
    {
      id: 'launch-campaign',
      label: 'Launch or optimize at least one ad campaign',
      done: false,
    },
  ]);

  useEffect(() => {
    if (!user) return;

    const checkTodoStatus = async () => {
      try {
        const [metaRes, linksRes, campaignsRes] = await Promise.all([
          supabase
            .from('meta_connections')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),

          supabase
            .from('oneclick_links')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),

          supabase
            .from('meta_ad_campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
        ]);

        setTodos([
          {
            id: 'connect-accounts',
            label: 'Connect Meta, TikTok, and Spotify accounts',
            done: (metaRes.count || 0) > 0,
          },
          {
            id: 'create-smart-link',
            label: 'Create your first smart link or presave',
            done: (linksRes.count || 0) > 0,
          },
          {
            id: 'launch-campaign',
            label: 'Launch or optimize at least one ad campaign',
            done: (campaignsRes.count || 0) > 0,
          },
        ]);
      } catch (error) {
        console.error('Error checking todo status:', error);
      }
    };

    checkTodoStatus();
  }, [user]);

  if (dismissed) return null;

  const completedCount = todos.filter((t) => t.done).length;
  const allDone = completedCount === todos.length;

  if (allDone) return null;

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-800/80 bg-slate-950/80 px-4 py-3.5 shadow-[0_14px_40px_rgba(15,23,42,0.85)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-2xl bg-blue-500/15 flex-shrink-0">
            <CheckCircle2 className="h-4 w-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Today&apos;s Focus
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              {todos.map((item) => (
                <div key={item.id} className="inline-flex items-center gap-1.5">
                  {item.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                  )}
                  <span className={item.done ? 'line-through text-slate-500' : ''}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="self-start rounded-full p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all md:self-center"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
