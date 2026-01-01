import { useState, useEffect } from 'react';
import { DollarSign, Calendar, TrendingUp, Save, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { readModeSettings, writeModeSettings } from '../../lib/ads/modes';
import { GOAL_REGISTRY, getAllGoalKeys, type OverallGoalKey } from '../../lib/goals';

type Priority = 'high' | 'medium' | 'low';

interface GoalBudget {
  goal_key: OverallGoalKey;
  priority: Priority;
  is_active: boolean;
  computed_daily_budget: number;
  weight: number;
}

const PRIORITY_WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1,
};

export function BudgetEstimator() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [totalBudget, setTotalBudget] = useState(500);
  const [timeframeDays, setTimeframeDays] = useState(30);
  const [goalBudgets, setGoalBudgets] = useState<GoalBudget[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const settings = await readModeSettings(user.id);

      if (settings) {
        // Load budget config
        if (settings.budget_config) {
          setTotalBudget(settings.budget_config.total_budget || 500);
          setTimeframeDays(settings.budget_config.timeframe_days || 30);
        }

        // Load goal priorities and compute budgets
        if (settings.goal_settings) {
          const allGoals = getAllGoalKeys();
          const budgets: GoalBudget[] = allGoals.map((key) => {
            const goalSetting = settings.goal_settings[key];
            return {
              goal_key: key,
              priority: (goalSetting?.priority as Priority) || 'medium',
              is_active: goalSetting?.is_active || false,
              computed_daily_budget: 0,
              weight: 0,
            };
          });

          setGoalBudgets(budgets);
        }
      }
    } catch (err) {
      console.error('[BudgetEstimator] Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    computeBudgets();
  }, [totalBudget, timeframeDays, goalBudgets.map(g => `${g.goal_key}:${g.priority}:${g.is_active}`).join(',')]);

  const computeBudgets = () => {
    const dailyBudget = totalBudget / timeframeDays;
    const activeGoals = goalBudgets.filter(g => g.is_active);

    if (activeGoals.length === 0) {
      setGoalBudgets(prev => prev.map(g => ({ ...g, computed_daily_budget: 0, weight: 0 })));
      return;
    }

    // Calculate weights based on priorities
    const totalWeight = activeGoals.reduce((sum, g) => sum + PRIORITY_WEIGHTS[g.priority], 0);

    const updated = goalBudgets.map(goal => {
      if (!goal.is_active) {
        return { ...goal, computed_daily_budget: 0, weight: 0 };
      }

      const weight = PRIORITY_WEIGHTS[goal.priority];
      const proportion = weight / totalWeight;
      const computed_daily_budget = dailyBudget * proportion;

      return {
        ...goal,
        weight,
        computed_daily_budget: Math.round(computed_daily_budget * 100) / 100,
      };
    });

    setGoalBudgets(updated);
  };

  const handlePriorityChange = (goalKey: OverallGoalKey, priority: Priority) => {
    setGoalBudgets(prev =>
      prev.map(g => g.goal_key === goalKey ? { ...g, priority } : g)
    );
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      // Load current settings
      const settings = await readModeSettings(user.id);
      if (!settings) throw new Error('Failed to load settings');

      // Update budget_config
      settings.budget_config = {
        total_budget: totalBudget,
        timeframe_days: timeframeDays,
        daily_budget: totalBudget / timeframeDays,
        learning_share: 0.70,
        scaling_share: 0.30,
        per_goal_budgets: goalBudgets.reduce((acc, g) => {
          if (g.is_active) {
            acc[g.goal_key] = {
              daily_budget: g.computed_daily_budget,
              priority: g.priority,
            };
          }
          return acc;
        }, {} as Record<string, any>),
      };

      // Update priorities in goal_settings
      goalBudgets.forEach(g => {
        if (settings.goal_settings[g.goal_key]) {
          settings.goal_settings[g.goal_key].priority = g.priority === 'high' ? 5 : g.priority === 'medium' ? 3 : 1;
        }
      });

      await writeModeSettings(user.id, settings);

      console.log('[BudgetEstimator] Budget configuration saved');

      setTimeout(() => setSaving(false), 1000);
    } catch (err) {
      console.error('[BudgetEstimator] Error saving:', err);
      alert('Failed to save budget configuration');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-white/10 rounded"></div>
          <div className="h-32 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  const activeGoalsCount = goalBudgets.filter(g => g.is_active).length;
  const dailyBudget = totalBudget / timeframeDays;

  return (
    <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-ghoste-white mb-1 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Budget Estimator
          </h3>
          <p className="text-sm text-ghoste-grey">
            Set your total budget and Ghoste will allocate it across active goals by priority
          </p>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="p-2 text-ghoste-grey hover:text-ghoste-white transition-colors"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      {showInfo && (
        <div className="mb-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <h4 className="text-sm font-semibold text-blue-400 mb-2">How Budget Allocation Works</h4>
          <ul className="space-y-1 text-sm text-gray-400">
            <li>• High priority goals get 3x weight</li>
            <li>• Medium priority goals get 2x weight</li>
            <li>• Low priority goals get 1x weight</li>
            <li>• Budget is split proportionally by weight among active goals</li>
            <li>• Orchestrator uses these computed budgets when creating campaigns</li>
          </ul>
        </div>
      )}

      {/* Total Budget Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-ghoste-white mb-2">
            Total Budget ($)
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ghoste-grey" />
            <input
              type="number"
              min="50"
              step="50"
              value={totalBudget}
              onChange={(e) => setTotalBudget(Math.max(50, parseInt(e.target.value) || 50))}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ghoste-white mb-2">
            Timeframe (days)
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ghoste-grey" />
            <select
              value={timeframeDays}
              onChange={(e) => setTimeframeDays(parseInt(e.target.value))}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white focus:outline-none focus:ring-2 focus:ring-ghoste-blue appearance-none"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 rounded-lg bg-white/5">
        <div>
          <p className="text-xs text-ghoste-grey mb-1">Daily Budget</p>
          <p className="text-lg font-bold text-ghoste-white">
            ${dailyBudget.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ghoste-grey mb-1">Active Goals</p>
          <p className="text-lg font-bold text-ghoste-white">
            {activeGoalsCount}
          </p>
        </div>
        <div>
          <p className="text-xs text-ghoste-grey mb-1">Per Goal Avg</p>
          <p className="text-lg font-bold text-ghoste-white">
            ${activeGoalsCount > 0 ? (dailyBudget / activeGoalsCount).toFixed(2) : '0.00'}
          </p>
        </div>
      </div>

      {/* Goal Priority Settings */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-semibold text-ghoste-white">Goal Priorities</h4>

        {activeGoalsCount === 0 && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-400 mb-1">
                  No active goals
                </p>
                <p className="text-sm text-gray-400">
                  Turn on goals in your Profile first to allocate budget
                </p>
              </div>
            </div>
          </div>
        )}

        {goalBudgets.filter(g => g.is_active).map((goal) => (
          <div
            key={goal.goal_key}
            className="p-4 rounded-lg bg-white/5 border border-ghoste-border"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-ghoste-blue" />
                <span className="text-sm font-medium text-ghoste-white">
                  {GOAL_REGISTRY[goal.goal_key].title}
                </span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-400">
                  ${goal.computed_daily_budget.toFixed(2)}/day
                </p>
                <p className="text-xs text-ghoste-grey">
                  ${(goal.computed_daily_budget * timeframeDays).toFixed(2)} total
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ghoste-grey">Priority:</span>
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as Priority[]).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => handlePriorityChange(goal.goal_key, priority)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      goal.priority === priority
                        ? priority === 'high'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                          : priority === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                        : 'bg-white/5 text-ghoste-grey hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || activeGoalsCount === 0}
        className="w-full px-6 py-3 rounded-lg bg-ghoste-blue text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Saving...
          </>
        ) : (
          <>
            <Save className="w-4 h-4" />
            Save Budget Configuration
          </>
        )}
      </button>
    </div>
  );
}
