import { useState } from 'react';
import { Play, Loader, CheckCircle, AlertCircle, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';

interface RunResult {
  success: boolean;
  runId?: string;
  campaignsCreated: number;
  campaignsUpdated: number;
  winnersPromoted: number;
  budgetsScaled: number;
  adsetsPaused: number;
  errors: string[];
  actions?: Array<{
    actionType: string;
    goalKey?: string;
    status: string;
    message?: string;
    details?: any;
  }>;
}

export function RunMyGoalsPanel() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleRunGoals = async () => {
    if (!user) return;

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      console.log('[RunMyGoalsPanel] Calling ads-orchestrate');

      const response = await fetch('/api/ads-orchestrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dry_run: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[RunMyGoalsPanel] Orchestrator result:', data);

      setResult(data);
    } catch (err: any) {
      console.error('[RunMyGoalsPanel] Error running orchestrator:', err);
      setError(err.message || 'Failed to run goals');
    } finally {
      setRunning(false);
    }
  };

  const getTotalActions = () => {
    if (!result) return 0;
    return (
      result.campaignsCreated +
      result.campaignsUpdated +
      result.winnersPromoted +
      result.budgetsScaled +
      result.adsetsPaused
    );
  };

  const getGoalsProcessed = () => {
    if (!result?.actions) return 0;
    const goalKeys = new Set(result.actions.map(a => a.goalKey).filter(Boolean));
    return goalKeys.size;
  };

  const getSkippedGoals = () => {
    if (!result?.actions) return [];
    return result.actions.filter(
      a => a.actionType === 'error' && a.details?.reason === 'missing_creatives'
    );
  };

  return (
    <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-ghoste-white mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-ghoste-blue" />
            Run My Goals
          </h3>
          <p className="text-sm text-ghoste-grey">
            Launch campaigns automatically based on your active goals and uploaded creatives
          </p>
        </div>
        <button
          onClick={handleRunGoals}
          disabled={running}
          className="px-5 py-2.5 rounded-lg bg-ghoste-blue text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {running ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Now
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400 mb-1">Error</p>
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          {result.success ? (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-base font-semibold text-green-400 mb-2">
                    Goals processed successfully
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-ghoste-grey">Goals processed:</span>
                      <span className="ml-2 text-white font-medium">{getGoalsProcessed()}</span>
                    </div>
                    <div>
                      <span className="text-ghoste-grey">Total actions:</span>
                      <span className="ml-2 text-white font-medium">{getTotalActions()}</span>
                    </div>
                    {result.campaignsCreated > 0 && (
                      <div>
                        <span className="text-ghoste-grey">Campaigns created:</span>
                        <span className="ml-2 text-green-400 font-medium">{result.campaignsCreated}</span>
                      </div>
                    )}
                    {result.campaignsUpdated > 0 && (
                      <div>
                        <span className="text-ghoste-grey">Budgets updated:</span>
                        <span className="ml-2 text-blue-400 font-medium">{result.campaignsUpdated}</span>
                      </div>
                    )}
                    {result.winnersPromoted > 0 && (
                      <div>
                        <span className="text-ghoste-grey">Winners promoted:</span>
                        <span className="ml-2 text-purple-400 font-medium">{result.winnersPromoted}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-base font-semibold text-red-400 mb-1">
                    Run completed with errors
                  </p>
                  <p className="text-sm text-gray-400">
                    {result.errors.length} error(s) occurred
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Skipped Goals */}
          {getSkippedGoals().length > 0 && (
            <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-400 mb-2">
                    Goals skipped (no creatives uploaded)
                  </p>
                  <ul className="space-y-1">
                    {getSkippedGoals().map((action, i) => (
                      <li key={i} className="text-sm text-gray-400">
                        • {action.goalKey}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-ghoste-grey mt-2">
                    Upload creatives for these goals using the upload tool above
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Details */}
          {result.actions && result.actions.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm text-ghoste-grey hover:text-ghoste-white transition-colors"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Hide action details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show action details ({result.actions.length})
                  </>
                )}
              </button>

              {showDetails && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {result.actions.map((action, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-ghoste-white font-medium">
                              {action.actionType.replace(/_/g, ' ')}
                            </span>
                            {action.goalKey && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-ghoste-blue/20 text-ghoste-blue">
                                {action.goalKey}
                              </span>
                            )}
                          </div>
                          {action.message && (
                            <p className="text-ghoste-grey text-xs truncate">
                              {action.message}
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                            action.status === 'success'
                              ? 'bg-green-500/20 text-green-400'
                              : action.status === 'failed'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {action.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
