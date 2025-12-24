import React, { useState, useEffect } from 'react';
import { Play, Settings, TrendingUp, AlertTriangle, CheckCircle, Info, X, Clock, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Insight, ProposedAction } from '../../ai/operator/brain';
import { isOperatorEnabled, canLoadSettings, canLoadActions, canRunAnalysis } from '../../config/operatorFlags';
import { getManagerContext } from '../../ai/context/getManagerContext';
import { runOptimization } from '../../ai/operator/runOptimization';
import { commitReleasePlan } from '../../ai/operator/commitReleasePlan';

interface OperatorSettings {
  mode: 'suggest_only' | 'auto_safe' | 'auto_full';
  enabled: boolean;
  daily_spend_cap_cents: number;
  max_budget_change_pct: number;
  min_impressions_for_kill: number;
  cooldown_hours: number;
}

const DEFAULT_SETTINGS: OperatorSettings = {
  enabled: false,
  mode: 'auto_full',
  daily_spend_cap_cents: 0, // 0 = no cap
  max_budget_change_pct: 30,
  min_impressions_for_kill: 1000,
  cooldown_hours: 2,
};

interface OperatorDiagnostics {
  settingsStatus: 'ok' | 'fallback' | 'error';
  actionsLoaded: number;
  rulesLoaded: number;
  lastError?: string;
}

export const OperatorPanel: React.FC = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [releasePlanActions, setReleasePlanActions] = useState<any[]>([]);
  const [committingPlan, setCommittingPlan] = useState(false);
  const [diagnostics, setDiagnostics] = useState<OperatorDiagnostics>({
    settingsStatus: 'ok',
    actionsLoaded: 0,
    rulesLoaded: 0,
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    if (user && isOperatorEnabled()) {
      loadOperatorData();
    } else if (user) {
      // Operator disabled - show warming up state
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
    }
  }, [user]);

  const loadOperatorData = async () => {
    setLoading(true);

    // 6-second hard timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operator load timeout')), 6000);
    });

    try {
      await Promise.race([
        loadOperatorDataInternal(),
        timeoutPromise,
      ]);
    } catch (error: any) {
      console.error('[OperatorPanel] Load timeout or error:', error);
      setDiagnostics(prev => ({
        ...prev,
        lastError: error.message || 'Load timeout',
      }));
      // Still set fallback settings
      if (!settings) {
        setSettings(DEFAULT_SETTINGS);
        setDiagnostics(prev => ({
          ...prev,
          settingsStatus: 'fallback',
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadOperatorDataInternal = async () => {
    const newDiagnostics: OperatorDiagnostics = {
      settingsStatus: 'ok',
      actionsLoaded: 0,
      rulesLoaded: 0,
    };

    try {
      // Load in parallel with Promise.allSettled (resilient)
      const [settingsRes, actionsRes] = await Promise.allSettled([
        loadSettingsSafe(),
        loadActionsSafe(),
      ]);

      // Handle settings
      if (settingsRes.status === 'fulfilled' && settingsRes.value) {
        setSettings(settingsRes.value.settings);
        newDiagnostics.settingsStatus = settingsRes.value.isFallback ? 'fallback' : 'ok';
      } else {
        setSettings(DEFAULT_SETTINGS);
        newDiagnostics.settingsStatus = 'fallback';
        newDiagnostics.lastError = settingsRes.status === 'rejected' ? settingsRes.reason?.message : undefined;
      }

      // Handle actions
      if (actionsRes.status === 'fulfilled' && actionsRes.value) {
        const { releaseActions, otherActions } = actionsRes.value;
        setReleasePlanActions(releaseActions);
        setActions(otherActions);
        newDiagnostics.actionsLoaded = releaseActions.length + otherActions.length;
      } else {
        setReleasePlanActions([]);
        setActions([]);
        newDiagnostics.actionsLoaded = 0;
      }

      setDiagnostics(newDiagnostics);
    } catch (error: any) {
      console.error('[OperatorPanel] Internal load error:', error);
      setSettings(DEFAULT_SETTINGS);
      setDiagnostics({
        settingsStatus: 'error',
        actionsLoaded: 0,
        rulesLoaded: 0,
        lastError: error.message,
      });
    }
  };

  const loadSettingsSafe = async (): Promise<{ settings: OperatorSettings; isFallback: boolean }> => {
    if (!canLoadSettings()) {
      return { settings: DEFAULT_SETTINGS, isFallback: true };
    }

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        return { settings: DEFAULT_SETTINGS, isFallback: true };
      }

      const response = await fetch('/.netlify/functions/operator-settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Exit fallback if settings are initialized or no warning
        const isFallback = !!data.warning && !data.initialized;
        return {
          settings: data.settings || data,
          isFallback,
        };
      }

      return { settings: DEFAULT_SETTINGS, isFallback: true };
    } catch (error) {
      console.warn('[OperatorPanel] Settings load failed (using fallback):', error);
      return { settings: DEFAULT_SETTINGS, isFallback: true };
    }
  };

  const loadActionsSafe = async (): Promise<{ releaseActions: any[]; otherActions: ProposedAction[] }> => {
    if (!canLoadActions() || !user) {
      return { releaseActions: [], otherActions: [] };
    }

    try {
      const { data, error } = await supabase
        .from('ai_operator_actions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[OperatorPanel] Actions load failed:', error);
        return { releaseActions: [], otherActions: [] };
      }

      if (!data) {
        return { releaseActions: [], otherActions: [] };
      }

      // Separate release plan actions
      const releaseActions = data.filter(a => a.category === 'release');
      const otherActionsData = data.filter(a => a.category !== 'release');

      const otherActions: ProposedAction[] = otherActionsData.map(a => ({
        category: a.category,
        title: a.title,
        reasoning: a.reasoning,
        payload: a.payload,
        safetyChecks: a.safety_checks,
        priority: 50,
      }));

      return { releaseActions, otherActions };
    } catch (error) {
      console.warn('[OperatorPanel] Actions load failed:', error);
      return { releaseActions: [], otherActions: [] };
    }
  };

  const loadActions = async () => {
    const result = await loadActionsSafe();
    setReleasePlanActions(result.releaseActions);
    setActions(result.otherActions);
    setDiagnostics(prev => ({
      ...prev,
      actionsLoaded: result.releaseActions.length + result.otherActions.length,
    }));
  };

  const runAnalysis = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const result = await runOptimization(user.id);

      if (result.success) {
        setInsights(result.insights);
        // Reload actions from database
        await loadActions();
        alert(`Analysis complete! Found ${result.actions.length} optimization opportunities.`);
      } else {
        alert(result.error || 'Analysis failed');
      }
    } catch (error: any) {
      console.error('[OperatorPanel] Analysis failed:', error);
      alert('Failed to run analysis: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (actionIndex: number) => {
    const action = actions[actionIndex];
    if (!action) return;

    // Find the action ID from database
    const { data } = await supabase
      .from('ai_operator_actions')
      .select('id')
      .eq('user_id', user?.id)
      .eq('title', action.title)
      .eq('status', 'proposed')
      .maybeSingle();

    if (!data) {
      alert('Action not found');
      return;
    }

    setExecuting(data.id);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch('/.netlify/functions/operator-execute-action', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionId: data.id }),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        loadActions(); // Refresh
      } else {
        alert(result.error || 'Execution failed');
      }
    } catch (error) {
      console.error('[OperatorPanel] Execution failed:', error);
      alert('Failed to execute action');
    } finally {
      setExecuting(null);
    }
  };

  const rejectAction = async (actionIndex: number) => {
    const action = actions[actionIndex];
    if (!action) return;

    // Find and update action
    const { data } = await supabase
      .from('ai_operator_actions')
      .select('id')
      .eq('user_id', user?.id)
      .eq('title', action.title)
      .eq('status', 'proposed')
      .maybeSingle();

    if (data) {
      await supabase
        .from('ai_operator_actions')
        .update({ status: 'rejected' })
        .eq('id', data.id);

      loadActions();
    }
  };

  const approveReleasePlan = async () => {
    if (!user || releasePlanActions.length === 0) return;

    const confirmed = window.confirm(
      `Add ${releasePlanActions.length} actions to your calendar?\n\n` +
      'This will create calendar events, draft campaigns, and scheduled posts.'
    );

    if (!confirmed) return;

    setCommittingPlan(true);

    try {
      // Mark all actions as approved first
      const actionIds = releasePlanActions.map(a => a.id);
      await supabase
        .from('ai_operator_actions')
        .update({ status: 'approved' })
        .in('id', actionIds);

      // Commit the plan (resilient execution)
      const result = await commitReleasePlan(user.id, actionIds);

      if (result.success) {
        const { succeeded, failed } = result.summary;
        if (failed === 0) {
          alert(`✓ Release plan committed successfully!\n${succeeded} actions added to your calendar.`);
        } else {
          alert(
            `⚠ Partial success:\n` +
            `${succeeded} actions succeeded\n` +
            `${failed} actions failed\n\n` +
            'Check individual actions for details.'
          );
        }

        // Show detailed results
        console.log('[OperatorPanel] Commit results:', result.summary.results);

        // Reload to remove completed actions
        await loadActions();
      } else {
        alert(`Failed to commit plan: ${result.error}`);
      }
    } catch (error: any) {
      console.error('[OperatorPanel] Commit error:', error);
      alert(`Error committing plan: ${error.message}`);
    } finally {
      setCommittingPlan(false);
    }
  };

  const rejectReleasePlan = async () => {
    if (!user || releasePlanActions.length === 0) return;

    const confirmed = window.confirm(
      `Reject this release plan?\n\n` +
      `${releasePlanActions.length} proposed actions will be discarded.`
    );

    if (!confirmed) return;

    try {
      const actionIds = releasePlanActions.map(a => a.id);
      await supabase
        .from('ai_operator_actions')
        .update({ status: 'rejected' })
        .in('id', actionIds);

      await loadActions();
      alert('Release plan rejected');
    } catch (error: any) {
      console.error('[OperatorPanel] Reject error:', error);
      alert(`Error rejecting plan: ${error.message}`);
    }
  };

  const updateSettings = async (updates: Partial<OperatorSettings>) => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch('/.netlify/functions/operator-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('[OperatorPanel] Failed to update settings:', error);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'opportunity':
        return <TrendingUp className="w-5 h-5 text-blue-400" />;
      default:
        return <Info className="w-5 h-5 text-slate-400" />;
    }
  };

  const getRiskBadge = (riskLevel: string) => {
    const colors = {
      low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      high: 'bg-red-500/10 text-red-400 border-red-500/30',
    };

    return (
      <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[riskLevel as keyof typeof colors] || colors.medium}`}>
        {riskLevel}
      </span>
    );
  };

  // Show warming up state if operator is disabled
  if (!isOperatorEnabled()) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 mb-4">
          <Zap className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-xl font-semibold text-white">Operator Warming Up</h3>
        <p className="text-white/60 max-w-md mx-auto">
          AI Operator is being configured for your account. In the meantime, use AI Chat to manage your campaigns and get insights.
        </p>
        <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10 text-left max-w-md mx-auto">
          <div className="text-sm text-white/80 font-medium mb-2">Coming Soon:</div>
          <ul className="text-sm text-white/60 space-y-1">
            <li>• Automated campaign optimization</li>
            <li>• Budget recommendations</li>
            <li>• Performance alerts</li>
            <li>• Smart bidding adjustments</li>
          </ul>
        </div>
      </div>
    );
  }

  if (loading && !settings) {
    return (
      <div className="p-6 text-center text-white/60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
        Loading Operator...
      </div>
    );
  }

  if (!loading && !settings) {
    return (
      <div className="p-6 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
        <h3 className="text-xl font-semibold text-white">Operator Temporarily Unavailable</h3>
        <p className="text-white/60 max-w-md mx-auto">
          Settings could not be loaded. Using fallback mode.
        </p>
        <button
          onClick={() => loadOperatorData()}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Fallback Banner */}
      {diagnostics.settingsStatus !== 'ok' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-300 mb-1">
              Operator in Fallback Mode
            </h4>
            <p className="text-xs text-white/60">
              Settings could not be loaded. Using default configuration. Some features may be limited.
            </p>
          </div>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            {showDiagnostics ? 'Hide' : 'Details'}
          </button>
        </div>
      )}

      {/* Diagnostics Panel */}
      {showDiagnostics && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-semibold text-white mb-3">Operator Status</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-white/60">Settings:</span>
              <span className={`ml-2 font-medium ${
                diagnostics.settingsStatus === 'ok' ? 'text-emerald-400' :
                diagnostics.settingsStatus === 'fallback' ? 'text-amber-400' : 'text-red-400'
              }`}>
                {diagnostics.settingsStatus}
              </span>
            </div>
            <div>
              <span className="text-white/60">Actions Loaded:</span>
              <span className="ml-2 font-medium text-white">{diagnostics.actionsLoaded}</span>
            </div>
            <div>
              <span className="text-white/60">Rules Loaded:</span>
              <span className="ml-2 font-medium text-white">{diagnostics.rulesLoaded}</span>
            </div>
            {diagnostics.lastError && (
              <div className="col-span-2">
                <span className="text-white/60">Last Error:</span>
                <div className="mt-1 text-red-400 font-mono text-xs break-all">
                  {diagnostics.lastError}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => loadOperatorData()}
            className="mt-3 w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white text-xs rounded-lg transition"
          >
            Reload Operator Data
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">AI Operator</h2>
          <p className="text-sm text-white/60">Automated ads optimization with strict guardrails</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white transition flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white">Operator Settings</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Autopilot Mode</label>
              <select
                value={settings.mode}
                onChange={(e) => updateSettings({ mode: e.target.value as any })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              >
                <option value="suggest_only">Suggest Only</option>
                <option value="auto_safe">Auto-Safe (Budget + Pause)</option>
                <option value="auto_full">Auto-Full (All Actions)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Daily Spend Cap</label>
              <input
                type="number"
                value={settings.daily_spend_cap_cents / 100}
                onChange={(e) => updateSettings({ daily_spend_cap_cents: parseInt(e.target.value) * 100 })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Max Budget Change %</label>
              <input
                type="number"
                value={settings.max_budget_change_pct}
                onChange={(e) => updateSettings({ max_budget_change_pct: parseInt(e.target.value) })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Cooldown (hours)</label>
              <input
                type="number"
                value={settings.cooldown_hours}
                onChange={(e) => updateSettings({ cooldown_hours: parseInt(e.target.value) })}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSettings({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
            <span className="text-sm text-white/80">Enable Autopilot</span>
          </div>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Today's Findings</h3>
          <div className="grid gap-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-start gap-3"
              >
                {getInsightIcon(insight.type)}
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-white">{insight.title}</h4>
                  <p className="text-xs text-white/60 mt-1">{insight.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Release Plan (if exists) */}
      {releasePlanActions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            Release Plan
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {releasePlanActions.length} actions
            </span>
          </h3>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white mb-1">
                  {releasePlanActions[0]?.payload?.release_title || 'Release Plan'}
                </h4>
                <p className="text-xs text-white/60">
                  Release Date: {releasePlanActions[0]?.payload?.release_date || 'TBD'}
                </p>
              </div>
            </div>

            {/* Group by phase */}
            {['Pre-Release', 'Release Week', 'Post-Release'].map(phase => {
              const phaseActions = releasePlanActions.filter(a => a.payload?.phase === phase);
              if (phaseActions.length === 0) return null;

              return (
                <div key={phase} className="space-y-2">
                  <h5 className="text-xs font-semibold text-blue-300 uppercase tracking-wider">{phase}</h5>
                  <div className="space-y-2">
                    {phaseActions.map((action, idx) => (
                      <div key={idx} className="bg-white/5 rounded-lg p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-medium text-white mb-0.5">{action.title}</div>
                            <div className="text-white/60">{action.reasoning}</div>
                          </div>
                          <div className="text-white/40 whitespace-nowrap">
                            {action.payload?.recommended_date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <button
                onClick={approveReleasePlan}
                disabled={committingPlan}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-sm rounded-lg transition disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {committingPlan ? 'Adding to Calendar...' : 'Add to Calendar'}
              </button>
              <button
                onClick={rejectReleasePlan}
                disabled={committingPlan}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition disabled:opacity-50"
              >
                Reject Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proposed Actions */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Optimization Actions
          {settings.enabled && settings.mode !== 'suggest_only' && (
            <Zap className="w-4 h-4 text-blue-400" />
          )}
        </h3>

        {actions.length === 0 && releasePlanActions.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-8 text-center">
            <Clock className="w-8 h-8 text-white/40 mx-auto mb-3" />
            <p className="text-sm text-white/60 mb-2">No actions proposed yet.</p>
            <p className="text-xs text-white/40">
              {insights.length > 0
                ? 'Your campaigns look stable. No immediate optimizations needed.'
                : 'Click "Run Analysis" to scan your campaigns.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {actions.map((action, index) => (
              <div
                key={index}
                className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-white">{action.title}</h4>
                      {getRiskBadge(action.safetyChecks.riskLevel)}
                    </div>
                    <p className="text-xs text-white/60">{action.reasoning}</p>
                  </div>
                </div>

                <div className="text-xs text-white/40">
                  Estimated Impact: {action.safetyChecks.estimatedImpact}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => executeAction(index)}
                    disabled={executing !== null}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white text-sm rounded-lg transition disabled:opacity-50"
                  >
                    {executing === action.title ? 'Executing...' : 'Approve & Execute'}
                  </button>
                  <button
                    onClick={() => rejectAction(index)}
                    disabled={executing !== null}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
