import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { notify } from '../../lib/notify';

type ManagerMode = 'light' | 'moderate' | 'full';

type Props = {
  userId: string;
  currentMode?: ManagerMode;
  managerBudget?: number;
  onUpdate?: () => void;
};

const MODE_CONFIG = {
  light: {
    label: 'Light',
    description: '1 check-in per day',
    messagesPerDay: 1,
    icon: '🌙',
  },
  moderate: {
    label: 'Moderate',
    description: '2-3 check-ins per day',
    messagesPerDay: 2,
    icon: '⚡',
  },
  full: {
    label: 'Full Manager',
    description: 'Every 2-4 hours + alerts',
    messagesPerDay: 6,
    icon: '🚀',
  },
};

export function ManagerModeSelector({ userId, currentMode = 'moderate', managerBudget = 0, onUpdate }: Props) {
  const [mode, setMode] = useState<ManagerMode>(currentMode);
  const [saving, setSaving] = useState(false);

  const handleModeChange = async (newMode: ManagerMode) => {
    setSaving(true);

    try {
      const config = MODE_CONFIG[newMode];

      const { error } = await supabase.from('manager_settings').upsert({
        user_id: userId,
        mode: newMode,
        messages_per_day: config.messagesPerDay,
        tokens_per_message: 6,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setMode(newMode);
      notify('success', 'Manager mode updated', `Switched to ${config.label} mode`);
      onUpdate?.();
    } catch (err) {
      console.error('[ManagerModeSelector] error', err);
      notify('error', 'Failed to update mode', 'Please try again');
    } finally {
      setSaving(false);
    }
  };

  const tokensPerMessage = 6;
  const messagesRemaining = Math.floor(managerBudget / tokensPerMessage);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Manager Mode</h3>
          <p className="text-sm text-slate-400">
            {tokensPerMessage} tokens per message · {messagesRemaining} messages remaining
          </p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(MODE_CONFIG) as Array<[ManagerMode, typeof MODE_CONFIG[ManagerMode]]>).map(
          ([modeKey, config]) => {
            const isActive = mode === modeKey;
            return (
              <button
                key={modeKey}
                type="button"
                onClick={() => handleModeChange(modeKey)}
                disabled={saving}
                className={`
                  relative rounded-xl border p-4 transition-all
                  ${
                    isActive
                      ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                  }
                  ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {/* Icon */}
                <div className="text-3xl mb-2">{config.icon}</div>

                {/* Label */}
                <div className="text-sm font-semibold text-slate-100 mb-1">{config.label}</div>

                {/* Description */}
                <div className="text-xs text-slate-400">{config.description}</div>

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                  </div>
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Budget warning */}
      {managerBudget < tokensPerMessage && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="text-yellow-400 text-xl">⚠️</div>
            <div className="flex-1">
              <div className="text-sm font-medium text-yellow-400">Low Manager Budget</div>
              <div className="text-xs text-yellow-400/80 mt-1">
                Add tokens to your Manager Budget to keep Ghoste AI actively managing your music career.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
        <div className="text-xs text-slate-400 space-y-2">
          <p>
            <strong className="text-slate-300">How it works:</strong> Ghoste AI proactively monitors your
            stats, campaigns, tasks, and opportunities. Each check-in uses tokens from your Manager Budget.
          </p>
          <p>
            <strong className="text-slate-300">Light:</strong> Perfect for busy artists who want major
            alerts only.
          </p>
          <p>
            <strong className="text-slate-300">Moderate:</strong> Balanced approach with morning planning +
            afternoon check-in.
          </p>
          <p>
            <strong className="text-slate-300">Full Manager:</strong> Maximum attention with frequent
            check-ins, proactive optimization, and real-time alerts.
          </p>
        </div>
      </div>
    </div>
  );
}
