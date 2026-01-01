import { useState, useEffect } from 'react';
import { Play, Eye, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '@/contexts/AuthContext';

interface OrchestratorRun {
  id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  campaigns_created: number;
  winners_promoted: number;
  budgets_scaled: number;
  errors_count: number;
}

interface DryRunAction {
  type: string;
  goalKey?: string;
  message?: string;
  details: any;
}

export function AdsOrchestratorPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [autoScaleWinners, setAutoScaleWinners] = useState(false);
  const [autoPauseLosers, setAutoPauseLosers] = useState(false);
  const [lastRuns, setLastRuns] = useState<OrchestratorRun[]>([]);
  const [dryRunResults, setDryRunResults] = useState<{ actions: DryRunAction[]; summary: any } | null>(null);
  const [showDryRun, setShowDryRun] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLastRuns();
  }, [user]);

  async function loadSettings() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_ads_modes')
        .select('auto_scale_winners, auto_pause_losers')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[AdsOrchestratorPanel] Error loading settings:', error);
        return;
      }

      if (data) {
        setAutoScaleWinners(data.auto_scale_winners || false);
        setAutoPauseLosers(data.auto_pause_losers || false);
      }
    } catch (err) {
      console.error('[AdsOrchestratorPanel] Error:', err);
    }
  }

  async function loadLastRuns() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('ads_automation_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('[AdsOrchestratorPanel] Error loading runs:', error);
        return;
      }

      setLastRuns(data || []);
    } catch (err) {
      console.error('[AdsOrchestratorPanel] Error:', err);
    }
  }

  async function updateSettings(field: 'auto_scale_winners' | 'auto_pause_losers', value: boolean) {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_ads_modes')
        .upsert({
          user_id: user.id,
          [field]: value,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('[AdsOrchestratorPanel] Error updating settings:', error);
        alert('Failed to update settings');
        return;
      }

      if (field === 'auto_scale_winners') setAutoScaleWinners(value);
      if (field === 'auto_pause_losers') setAutoPauseLosers(value);
    } catch (err) {
      console.error('[AdsOrchestratorPanel] Error:', err);
      alert('Failed to update settings');
    }
  }

  async function runOrchestrator() {
    if (!user) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch('/.netlify/functions/ads-orchestrate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to run orchestrator');
      }

      alert(`Orchestrator completed!\n\nCampaigns created: ${result.summary.campaignsCreated}\nWinners promoted: ${result.summary.winnersPromoted}\nBudgets scaled: ${result.summary.budgetsScaled}`);

      // Reload runs
      await loadLastRuns();
    } catch (err) {
      console.error('[AdsOrchestratorPanel] Error running orchestrator:', err);
      alert(`Failed to run orchestrator: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function runDryRun() {
    if (!user) return;

    setDryRunLoading(true);
    setDryRunResults(null);
    setShowDryRun(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch('/.netlify/functions/ads-orchestrate-dryrun', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to run dry-run');
      }

      setDryRunResults({
        actions: result.actions || [],
        summary: result.summary || {},
      });
    } catch (err) {
      console.error('[AdsOrchestratorPanel] Error running dry-run:', err);
      alert(`Failed to run preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setShowDryRun(false);
    } finally {
      setDryRunLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ghoste-white">Goals Automation</h2>
          <p className="text-sm text-ghoste-grey mt-1">
            Automatically create, test, and scale campaigns based on your goals
          </p>
        </div>
      </div>

      {/* Controls Card */}
      <div className="rounded-2xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="space-y-6">
          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-ghoste-white">Auto-Scale Winners</div>
                <div className="text-sm text-ghoste-grey">
                  Automatically promote winning ads to scaling campaigns
                </div>
              </div>
              <button
                onClick={() => updateSettings('auto_scale_winners', !autoScaleWinners)}
                className={[
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  autoScaleWinners ? 'bg-ghoste-blue' : 'bg-gray-700',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    autoScaleWinners ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-ghoste-white">Auto-Pause Losers</div>
                <div className="text-sm text-ghoste-grey">
                  Automatically pause ads with high spend and no results
                </div>
              </div>
              <button
                onClick={() => updateSettings('auto_pause_losers', !autoPauseLosers)}
                className={[
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  autoPauseLosers ? 'bg-ghoste-blue' : 'bg-gray-700',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    autoPauseLosers ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-ghoste-border">
            <button
              onClick={runOrchestrator}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Run My Goals Now
                </>
              )}
            </button>

            <button
              onClick={runDryRun}
              disabled={dryRunLoading}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-white/5 text-ghoste-white font-medium hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {dryRunLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Eye className="w-5 h-5" />
                  Preview Plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dry Run Results */}
      {showDryRun && dryRunResults && (
        <div className="rounded-2xl border border-blue-900/50 bg-blue-950/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Preview: What Will Happen</h3>
            <button
              onClick={() => setShowDryRun(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-gray-400">Campaigns</div>
              <div className="text-2xl font-bold text-white">{dryRunResults.summary.campaignsCreated || 0}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-gray-400">Winners</div>
              <div className="text-2xl font-bold text-white">{dryRunResults.summary.winnersPromoted || 0}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-gray-400">Budget Updates</div>
              <div className="text-2xl font-bold text-white">{dryRunResults.summary.budgetsScaled || 0}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-3">
              <div className="text-xs text-gray-400">Paused</div>
              <div className="text-2xl font-bold text-white">{dryRunResults.summary.adsetsPaused || 0}</div>
            </div>
          </div>

          {/* Actions List */}
          {dryRunResults.actions.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-400">Planned Actions:</div>
              {dryRunResults.actions.map((action, i) => (
                <div key={i} className="rounded-lg bg-white/5 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                      {action.type}
                    </span>
                    {action.goalKey && (
                      <span className="text-gray-400">Goal: {action.goalKey}</span>
                    )}
                  </div>
                  {action.message && (
                    <div className="mt-1 text-gray-300">{action.message}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              No actions planned. Make sure you have active goals and connected Meta account.
            </div>
          )}
        </div>
      )}

      {/* Last Runs */}
      <div className="rounded-2xl border border-ghoste-border bg-ghoste-card p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>

        {lastRuns.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No automation runs yet</p>
            <p className="text-sm mt-1">Click "Run My Goals Now" to start</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lastRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-lg bg-white/5 p-4"
              >
                <div className="flex items-center gap-3">
                  {run.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : run.status === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-yellow-400 animate-spin" />
                  )}
                  <div>
                    <div className="font-medium text-white">
                      {new Date(run.started_at).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-400">
                      {run.campaigns_created} created • {run.winners_promoted} promoted
                      {run.errors_count > 0 && (
                        <span className="text-red-400"> • {run.errors_count} errors</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className={[
                  'px-3 py-1 rounded-full text-xs font-medium',
                  run.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  'bg-yellow-500/20 text-yellow-400',
                ].join(' ')}>
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
