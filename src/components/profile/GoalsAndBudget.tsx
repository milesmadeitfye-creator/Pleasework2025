import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import {
  calculateBudget,
  formatCurrency,
  formatDailyCurrency,
  getGoalDisplayName,
  getGoalDescription,
  type PrimaryGoal,
  type RiskLevel,
  type Timeframe,
  type BudgetEstimate,
} from '../../lib/budgetEstimator';

const PRIMARY_GOALS: PrimaryGoal[] = [
  'growth',
  'streams',
  'followers',
  'playlists',
  'release',
  'touring',
  'merch',
];

const RISK_LEVELS: RiskLevel[] = ['conservative', 'balanced', 'aggressive'];
const TIMEFRAMES: Timeframe[] = ['30d', '60d', '90d'];

interface UserGoals {
  user_id: string;
  primary_goal: PrimaryGoal;
  secondary_goals: PrimaryGoal[];
  genre: string | null;
  region: string | null;
  timeframe: Timeframe;
  risk_level: RiskLevel;
  hours_per_week: number;
  monthly_budget_cap: number | null;
  estimator_json: any;
}

export function GoalsAndBudget() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('growth');
  const [secondaryGoals, setSecondaryGoals] = useState<PrimaryGoal[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('balanced');
  const [hoursPerWeek, setHoursPerWeek] = useState(5);
  const [genre, setGenre] = useState('');
  const [region, setRegion] = useState('');
  const [budgetCap, setBudgetCap] = useState('');

  // Estimate state
  const [estimate, setEstimate] = useState<BudgetEstimate | null>(null);

  // Load user goals
  useEffect(() => {
    loadGoals();
  }, []);

  // Recalculate estimate whenever inputs change
  useEffect(() => {
    const newEstimate = calculateBudget({
      primaryGoal,
      secondaryGoals,
      timeframe,
      riskLevel,
      hoursPerWeek,
      genre: genre || undefined,
      region: region || undefined,
      budgetCap: budgetCap ? parseFloat(budgetCap) : undefined,
    });
    setEstimate(newEstimate);
  }, [primaryGoal, secondaryGoals, timeframe, riskLevel, hoursPerWeek, genre, region, budgetCap]);

  async function loadGoals() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading goals:', error);
        return;
      }

      if (data) {
        setPrimaryGoal(data.primary_goal as PrimaryGoal);
        setSecondaryGoals(data.secondary_goals || []);
        setTimeframe(data.timeframe as Timeframe);
        setRiskLevel(data.risk_level as RiskLevel);
        setHoursPerWeek(data.hours_per_week);
        setGenre(data.genre || '');
        setRegion(data.region || '');
        setBudgetCap(data.monthly_budget_cap ? String(data.monthly_budget_cap) : '');
      }
    } catch (err) {
      console.error('Error loading goals:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const goalsData = {
        user_id: user.id,
        primary_goal: primaryGoal,
        secondary_goals: secondaryGoals,
        timeframe,
        risk_level: riskLevel,
        hours_per_week: hoursPerWeek,
        genre: genre || null,
        region: region || null,
        monthly_budget_cap: budgetCap ? parseFloat(budgetCap) : null,
        estimator_json: estimate || {},
      };

      const { error } = await supabase
        .from('user_goals')
        .upsert(goalsData, { onConflict: 'user_id' });

      if (error) {
        console.error('Error saving goals:', error);
        alert('Failed to save goals. Please try again.');
        return;
      }

      setHasChanges(false);
      alert('Goals saved successfully!');
    } catch (err) {
      console.error('Error saving goals:', err);
      alert('Failed to save goals. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setPrimaryGoal('growth');
    setSecondaryGoals([]);
    setTimeframe('30d');
    setRiskLevel('balanced');
    setHoursPerWeek(5);
    setGenre('');
    setRegion('');
    setBudgetCap('');
    setHasChanges(true);
  }

  function toggleSecondaryGoal(goal: PrimaryGoal) {
    if (goal === primaryGoal) return; // Can't add primary as secondary

    setSecondaryGoals((prev) => {
      if (prev.includes(goal)) {
        return prev.filter((g) => g !== goal);
      } else {
        return [...prev, goal];
      }
    });
    setHasChanges(true);
  }

  function applyToAds() {
    if (!estimate) return;

    // Store in localStorage for now
    localStorage.setItem('ghoste.default_daily_budget', String(estimate.recommendedDailyBudget));
    alert(`Daily budget of ${formatDailyCurrency(estimate.recommendedDailyBudget)} applied! Visit the Ads tab to use it.`);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-white/10 rounded mb-4"></div>
          <div className="h-4 w-full bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ghoste-border bg-ghoste-card p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ghoste-white mb-1">Goals & Budget Estimator</h2>
        <p className="text-sm text-ghoste-grey">Set your goals and get a recommended marketing budget</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Column - Inputs */}
        <div className="space-y-6">
          {/* Primary Goal */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Primary Goal
            </label>
            <select
              value={primaryGoal}
              onChange={(e) => {
                setPrimaryGoal(e.target.value as PrimaryGoal);
                setHasChanges(true);
              }}
              className="w-full px-4 py-2.5 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
            >
              {PRIMARY_GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {getGoalDisplayName(goal)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ghoste-grey">{getGoalDescription(primaryGoal)}</p>
          </div>

          {/* Secondary Goals */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Secondary Goals (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_GOALS.filter((g) => g !== primaryGoal).map((goal) => (
                <button
                  key={goal}
                  onClick={() => toggleSecondaryGoal(goal)}
                  className={[
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    secondaryGoals.includes(goal)
                      ? 'bg-ghoste-blue text-white'
                      : 'bg-white/5 text-ghoste-grey hover:bg-white/10',
                  ].join(' ')}
                >
                  {getGoalDisplayName(goal)}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Campaign Duration
            </label>
            <div className="flex gap-2">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    setTimeframe(tf);
                    setHasChanges(true);
                  }}
                  className={[
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                    timeframe === tf
                      ? 'bg-ghoste-blue text-white'
                      : 'bg-white/5 text-ghoste-grey hover:bg-white/10',
                  ].join(' ')}
                >
                  {tf === '30d' ? '30 Days' : tf === '60d' ? '60 Days' : '90 Days'}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Budget Approach
            </label>
            <div className="flex gap-2">
              {RISK_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    setRiskLevel(level);
                    setHasChanges(true);
                  }}
                  className={[
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize',
                    riskLevel === level
                      ? 'bg-ghoste-blue text-white'
                      : 'bg-white/5 text-ghoste-grey hover:bg-white/10',
                  ].join(' ')}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Hours Per Week */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Content Hours Per Week: {hoursPerWeek}h
            </label>
            <input
              type="range"
              min="1"
              max="20"
              value={hoursPerWeek}
              onChange={(e) => {
                setHoursPerWeek(Number(e.target.value));
                setHasChanges(true);
              }}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-ghoste-grey mt-1">
              <span>1h</span>
              <span>20h</span>
            </div>
          </div>

          {/* Optional Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ghoste-white mb-2">
                Genre (optional)
              </label>
              <input
                type="text"
                value={genre}
                onChange={(e) => {
                  setGenre(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="e.g., Hip Hop"
                className="w-full px-4 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ghoste-white mb-2">
                Region (optional)
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="e.g., US"
                className="w-full px-4 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
              />
            </div>
          </div>

          {/* Budget Cap */}
          <div>
            <label className="block text-sm font-medium text-ghoste-white mb-2">
              Monthly Budget Cap (optional)
            </label>
            <input
              type="number"
              value={budgetCap}
              onChange={(e) => {
                setBudgetCap(e.target.value);
                setHasChanges(true);
              }}
              placeholder="No cap"
              className="w-full px-4 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white placeholder-ghoste-grey/50 focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
            />
          </div>
        </div>

        {/* Right Column - Estimate */}
        <div className="space-y-6">
          {estimate && (
            <>
              {/* Recommended Budget */}
              <div className="rounded-xl bg-gradient-to-br from-ghoste-blue/20 to-ghoste-blue/5 border border-ghoste-blue/30 p-6">
                <div className="text-sm text-ghoste-grey mb-2">Recommended Monthly Budget</div>
                <div className="text-4xl font-bold text-white mb-1">
                  {formatCurrency(estimate.recommendedMonthlyBudget)}
                </div>
                <div className="text-sm text-ghoste-grey">
                  {formatDailyCurrency(estimate.recommendedDailyBudget)}/day
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="text-xs text-ghoste-grey mb-2">Budget Tiers</div>
                  <div className="flex justify-between text-sm">
                    <div>
                      <div className="text-ghoste-grey">Starter</div>
                      <div className="text-white font-medium">{formatCurrency(estimate.tiers.low)}</div>
                    </div>
                    <div>
                      <div className="text-ghoste-grey">Recommended</div>
                      <div className="text-ghoste-blue font-medium">{formatCurrency(estimate.tiers.recommended)}</div>
                    </div>
                    <div>
                      <div className="text-ghoste-grey">Aggressive</div>
                      <div className="text-white font-medium">{formatCurrency(estimate.tiers.high)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Allocation */}
              <div>
                <h3 className="text-sm font-medium text-ghoste-white mb-3">Budget Allocation</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ghoste-grey">Paid Ads</span>
                      <span className="text-white font-medium">{estimate.allocation.ads}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-ghoste-blue"
                        style={{ width: `${estimate.allocation.ads}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ghoste-grey">Content Production</span>
                      <span className="text-white font-medium">{estimate.allocation.content}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-blue-400"
                        style={{ width: `${estimate.allocation.content}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ghoste-grey">Influencer/UGC</span>
                      <span className="text-white font-medium">{estimate.allocation.influencer}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-blue-300"
                        style={{ width: `${estimate.allocation.influencer}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ghoste-grey">Outreach/Tools</span>
                      <span className="text-white font-medium">{estimate.allocation.outreach}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-blue-200"
                        style={{ width: `${estimate.allocation.outreach}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-sm font-medium text-ghoste-white mb-3">Why This Budget?</h3>
                <div className="space-y-2">
                  {estimate.notes.map((note, i) => (
                    <div key={i} className="flex gap-2 text-sm text-ghoste-grey">
                      <span className="text-ghoste-blue">•</span>
                      <span>{note}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-ghoste-grey">Confidence:</span>
                    <span
                      className={[
                        'px-2 py-0.5 rounded-full font-medium',
                        estimate.confidence === 'high'
                          ? 'bg-green-500/20 text-green-400'
                          : estimate.confidence === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400',
                      ].join(' ')}
                    >
                      {estimate.confidence}
                    </span>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="text-xs text-ghoste-grey/70 italic">
                These are estimates based on industry benchmarks. Actual results may vary. Budget recommendations improve as we collect campaign data.
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 pt-6 border-t border-ghoste-border flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Saving...' : 'Save Goals'}
        </button>

        <button
          onClick={applyToAds}
          disabled={!estimate}
          className="px-6 py-2.5 rounded-lg bg-white/5 text-ghoste-white font-medium hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Use in Ads Tab
        </button>

        <button
          onClick={handleReset}
          className="px-6 py-2.5 rounded-lg bg-white/5 text-ghoste-grey font-medium hover:bg-white/10 transition-all"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
