import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { Target, ExternalLink } from 'lucide-react';
import { readModeSettings, type GoalSettings, DEFAULT_GOAL_SETTINGS } from '../../lib/ads/modes';
import { GOAL_REGISTRY, type OverallGoalKey } from '../../lib/goals';

/**
 * Read-only summary of active goals from Profile
 * Displayed in Ads tab - no editing allowed
 */
export function ActiveGoalsSummary() {
  const [loading, setLoading] = useState(true);
  const [activeGoals, setActiveGoals] = useState<Array<{ key: OverallGoalKey; settings: GoalSettings }>>([]);

  useEffect(() => {
    loadActiveGoals();
  }, []);

  async function loadActiveGoals() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settings = await readModeSettings(user.id);

      const active = Object.entries(settings.goal_settings)
        .filter(([_, s]) => s.is_active)
        .map(([key, settings]) => ({
          key: key as OverallGoalKey,
          settings,
        }));

      setActiveGoals(active);
      setLoading(false);
    } catch (err) {
      console.error('Error loading active goals:', err);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg bg-white/5 border border-ghoste-border p-4">
        <div className="animate-pulse text-ghoste-grey text-sm">Loading goals...</div>
      </div>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <div className="rounded-lg bg-white/5 border border-ghoste-border p-6 text-center">
        <Target className="w-8 h-8 text-ghoste-grey mx-auto mb-3" />
        <p className="text-ghoste-grey mb-3">No active goals set</p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 text-sm text-ghoste-blue hover:text-blue-400 transition-colors"
        >
          Set up goals in Profile
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const getPriorityLabel = (priority?: number) => {
    if (!priority) return 'Medium';
    return priority <= 2 ? 'Low' : priority <= 3 ? 'Medium' : 'High';
  };

  const getPriorityColor = (priority?: number) => {
    if (!priority || priority <= 3) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="rounded-lg bg-white/5 border border-ghoste-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-ghoste-blue" />
          <h3 className="text-base font-semibold text-ghoste-white">Active Goals</h3>
        </div>
        <Link
          to="/settings"
          className="text-xs text-ghoste-grey hover:text-ghoste-white transition-colors flex items-center gap-1"
        >
          Edit in Profile
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {activeGoals.map(({ key, settings }) => {
          const goal = GOAL_REGISTRY[key];
          if (!goal) return null;

          return (
            <div
              key={key}
              className="p-3 rounded-lg bg-ghoste-bg border border-ghoste-border/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-ghoste-white">{goal.title}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ghoste-grey">
                    <span>
                      Priority: <span className={getPriorityColor(settings.priority)}>{getPriorityLabel(settings.priority)}</span>
                    </span>
                    {settings.budget_hint && (
                      <span>
                        Budget: <span className="text-ghoste-white">${settings.budget_hint}/day</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-ghoste-border/50">
        <p className="text-xs text-ghoste-grey">
          Goals are managed in your Profile. Use "Use My Goals" to create campaigns automatically.
        </p>
      </div>
    </div>
  );
}
