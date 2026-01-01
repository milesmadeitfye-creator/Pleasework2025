import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { Settings, TrendingUp, Zap } from 'lucide-react';
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
import {
  readModeSettings,
  writeModeSettings,
  updateGoalSettings,
  type AdsMode,
  type AdsModeSettings,
  type PulseSettings,
  type MomentumSettings,
  type GoalSettings,
  DEFAULT_GOAL_SETTINGS,
} from '../../lib/ads/modes';

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

// Ads goal keys that map to templates
const ADS_GOAL_KEYS = [
  { key: 'smartlink_conversions', label: 'Smart Link Conversions', description: 'Drive clicks to streaming platforms' },
  { key: 'presave_conversions', label: 'Pre-Save Conversions', description: 'Convert fans to pre-saves' },
  { key: 'virality', label: 'Virality + Engagement', description: 'Maximize views and shares' },
  { key: 'follower_growth', label: 'Follower Growth', description: 'Grow your social following' },
  { key: 'email_capture', label: 'Email Capture', description: 'Build your email list' },
  { key: 'oneclick', label: 'One-Click Sales', description: 'Direct platform conversions' },
];

export function GoalsAndBudget() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Form state (existing budget estimator)
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

  // Ads Mode state (Pulse & Momentum)
  const [adsMode, setAdsMode] = useState<AdsMode>('pulse');
  const [pulseSettings, setPulseSettings] = useState<PulseSettings>({});
  const [momentumSettings, setMomentumSettings] = useState<MomentumSettings>({});
  const [goalSettings, setGoalSettings] = useState<Record<string, GoalSettings>>({});
  const [showModeSettings, setShowModeSettings] = useState(false);

  // Load user goals and ads mode settings
  useEffect(() => {
    loadGoals();
    loadAdsModeSettings();
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

  async function loadAdsModeSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settings = await readModeSettings(user.id);
      setAdsMode(settings.ads_mode);
      setPulseSettings(settings.pulse_settings);
      setMomentumSettings(settings.momentum_settings);
      setGoalSettings(settings.goal_settings);
    } catch (err) {
      console.error('Error loading ads mode settings:', err);
    }
  }

  async function saveModeSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await writeModeSettings({
        userId: user.id,
        ads_mode: adsMode,
        pulse_settings: pulseSettings,
        momentum_settings: momentumSettings,
        goal_settings: goalSettings,
      });

      alert('Ads mode settings saved!');
    } catch (err) {
      console.error('Error saving ads mode settings:', err);
      alert('Failed to save ads mode settings');
    }
  }

  async function toggleGoalActive(goalKey: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const currentSettings = goalSettings[goalKey] || DEFAULT_GOAL_SETTINGS;
      const updated = { ...currentSettings, is_active: !currentSettings.is_active };

      setGoalSettings(prev => ({ ...prev, [goalKey]: updated }));

      await updateGoalSettings(user.id, goalKey, updated);
    } catch (err) {
      console.error('Error toggling goal:', err);
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
    <div className="space-y-6">
      {/* Pulse & Momentum Mode Control */}
      <div className="rounded-2xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-ghoste-white mb-1">Ads Operating Mode</h2>
          <p className="text-sm text-ghoste-grey">Choose how your ads campaigns are managed</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setAdsMode('pulse')}
            className={[
              'flex-1 p-4 rounded-xl border-2 transition-all text-left',
              adsMode === 'pulse'
                ? 'border-ghoste-blue bg-ghoste-blue/10'
                : 'border-ghoste-border bg-transparent hover:border-ghoste-border/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-ghoste-blue" />
              <span className="text-lg font-bold text-ghoste-white">Pulse</span>
            </div>
            <p className="text-sm text-ghoste-grey">Steady learning + testing mode (ABO)</p>
          </button>

          <button
            onClick={() => setAdsMode('momentum')}
            className={[
              'flex-1 p-4 rounded-xl border-2 transition-all text-left',
              adsMode === 'momentum'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-ghoste-border bg-transparent hover:border-ghoste-border/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-purple-400" />
              <span className="text-lg font-bold text-ghoste-white">Momentum</span>
            </div>
            <p className="text-sm text-ghoste-grey">Scale winners automatically (CBO)</p>
          </button>
        </div>

        {/* Mode Settings Button */}
        <button
          onClick={() => setShowModeSettings(!showModeSettings)}
          className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-ghoste-grey" />
            <span className="text-sm font-medium text-ghoste-white">Mode Settings</span>
          </div>
          <span className="text-xs text-ghoste-grey">{showModeSettings ? 'Hide' : 'Show'}</span>
        </button>

        {/* Mode Settings Panel */}
        {showModeSettings && (
          <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 space-y-6">
            {/* Pulse Settings */}
            {adsMode === 'pulse' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-ghoste-white">Pulse Settings</h3>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Daily Budget ($)</label>
                  <input
                    type="number"
                    value={pulseSettings.daily_budget || 20}
                    onChange={(e) => setPulseSettings(prev => ({ ...prev, daily_budget: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Test Lane % (0-50)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={pulseSettings.test_lane_pct || 30}
                    onChange={(e) => setPulseSettings(prev => ({ ...prev, test_lane_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Rotation Days (1-14)</label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    value={pulseSettings.rotation_days || 7}
                    onChange={(e) => setPulseSettings(prev => ({ ...prev, rotation_days: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>
              </div>
            )}

            {/* Momentum Settings */}
            {adsMode === 'momentum' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-ghoste-white">Momentum Settings</h3>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Starting Daily Budget ($)</label>
                  <input
                    type="number"
                    value={momentumSettings.starting_budget || 50}
                    onChange={(e) => setMomentumSettings(prev => ({ ...prev, starting_budget: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Max Daily Budget Cap ($)</label>
                  <input
                    type="number"
                    value={momentumSettings.max_daily_budget || 500}
                    onChange={(e) => setMomentumSettings(prev => ({ ...prev, max_daily_budget: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Scale Step % (10-30)</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    value={momentumSettings.scale_step_pct || 20}
                    onChange={(e) => setMomentumSettings(prev => ({ ...prev, scale_step_pct: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ghoste-grey mb-2">Cooldown Hours (6-72)</label>
                  <input
                    type="number"
                    min="6"
                    max="72"
                    value={momentumSettings.cooldown_hours || 24}
                    onChange={(e) => setMomentumSettings(prev => ({ ...prev, cooldown_hours: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white"
                  />
                </div>
              </div>
            )}

            <button
              onClick={saveModeSettings}
              className="w-full px-4 py-2 rounded-lg bg-ghoste-blue text-white font-medium hover:bg-blue-600 transition-all"
            >
              Save Mode Settings
            </button>
          </div>
        )}

        {/* Ads Goals Control */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ghoste-white mb-3">Active Ads Goals</h3>
          <div className="grid gap-3">
            {ADS_GOAL_KEYS.map(goal => {
              const settings = goalSettings[goal.key] || DEFAULT_GOAL_SETTINGS;
              return (
                <div
                  key={goal.key}
                  className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-ghoste-white">{goal.label}</span>
                      {settings.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-ghoste-grey">{goal.description}</p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-xs text-ghoste-grey">
                        Priority: <span className="text-ghoste-white font-medium">{settings.priority || 3}</span>
                      </span>
                      {settings.budget_hint && (
                        <span className="text-xs text-ghoste-grey">
                          Budget: <span className="text-ghoste-white font-medium">${settings.budget_hint}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleGoalActive(goal.key)}
                    className={[
                      'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      settings.is_active
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-white/5 text-ghoste-grey hover:bg-white/10',
                    ].join(' ')}
                  >
                    {settings.is_active ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Existing Budget Estimator */}
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
    </div>
  );
}
