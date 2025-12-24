import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Play, Loader2, AlertCircle } from 'lucide-react';

export default function AdsAutopilotPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [runResult, setRunResult] = useState<any>(null);
  const [settings, setSettings] = useState<any>({
    enabled: false,
    daily_spend_cap: 50,
    max_actions_per_run: 10,
    allow_pause_ads: true,
    allow_decrease_budget: false,
    allow_rotate_creative: false,
    require_approval_for_activate: true,
    require_approval_for_budget_increase: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError('');

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase
      .from('ads_autopilot_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (err) {
      setError(err.message);
    } else if (data) {
      setSettings((s: any) => ({ ...s, ...data }));
    }

    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setError('');

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      setSaving(false);
      setError('Not signed in');
      return;
    }

    const payload = { ...settings, user_id: userId, updated_at: new Date().toISOString() };
    const { error: err } = await supabase.from('ads_autopilot_settings').upsert(payload, { onConflict: 'user_id' });

    setSaving(false);

    if (err) {
      setError(err.message);
    }
  }

  async function runAutopilot() {
    setRunning(true);
    setError('');
    setRunResult(null);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      setError('Not signed in');
      setRunning(false);
      return;
    }

    try {
      const res = await fetch('/.netlify/functions/ads-autopilot-run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const j = await res.json();

      if (!res.ok) {
        setError(j.error || 'Failed to run autopilot');
      } else {
        setRunResult(j);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    }

    setRunning(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ads Autopilot</h1>
        <p className="text-sm opacity-70 mt-2">
          Automate low-risk ad actions. High-risk actions require approval in the Verification Inbox.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {runResult && (
        <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="font-medium mb-2">Autopilot Run Complete</div>
          <div className="text-sm opacity-80">
            Actions taken: {runResult.actionsTaken || 0}
            {runResult.totalAds && ` • Analyzed ${runResult.totalAds} ads`}
          </div>
          {runResult.skipped && (
            <div className="text-sm opacity-70 mt-1">Reason: {runResult.reason}</div>
          )}
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-2xl border bg-white/5 p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.enabled}
              onChange={(e) => setSettings((s: any) => ({ ...s, enabled: e.target.checked }))}
              className="w-5 h-5"
            />
            <div>
              <div className="font-semibold">Enable Autopilot</div>
              <div className="text-sm opacity-70 mt-1">
                Autopilot will only execute low-risk actions (like pausing losing ads). Anything risky goes to the
                Verification Inbox.
              </div>
            </div>
          </label>
        </div>

        <div className="rounded-2xl border bg-white/5 p-6">
          <h2 className="font-semibold mb-4">Limits & Safety</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-2">Daily Spend Cap ($)</label>
              <input
                className="w-full border rounded-xl p-3 bg-white/5"
                type="number"
                value={settings.daily_spend_cap}
                onChange={(e) => setSettings((s: any) => ({ ...s, daily_spend_cap: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Max Actions Per Run</label>
              <input
                className="w-full border rounded-xl p-3 bg-white/5"
                type="number"
                value={settings.max_actions_per_run}
                onChange={(e) => setSettings((s: any) => ({ ...s, max_actions_per_run: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white/5 p-6">
          <h2 className="font-semibold mb-4">Allowed Automatic Actions</h2>
          <div className="space-y-3">
            {[
              ['allow_pause_ads', 'Pause losing ads (safe)', 'Recommended: Automatically pause ads with low performance'],
              ['allow_decrease_budget', 'Decrease budgets (optional)', 'Reduce spending on underperforming campaigns'],
              ['allow_rotate_creative', 'Rotate creatives (optional)', 'Switch to different ad creatives automatically'],
            ].map(([key, label, desc]) => (
              <label key={key as string} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.checked }))}
                  className="w-5 h-5 mt-0.5"
                />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-sm opacity-70 mt-0.5">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white/5 p-6">
          <h2 className="font-semibold mb-4">Always Require Approval</h2>
          <div className="space-y-3">
            {[
              ['require_approval_for_activate', 'Activating campaigns/adsets/ads', 'Prevent accidental campaign launches'],
              ['require_approval_for_budget_increase', 'Any budget increases', 'Prevent unexpected spend increases'],
            ].map(([key, label, desc]) => (
              <label key={key as string} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.checked }))}
                  className="w-5 h-5 mt-0.5"
                />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-sm opacity-70 mt-0.5">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            className="px-6 py-3 rounded-xl border bg-white/5 hover:bg-white/10 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={saving}
            onClick={save}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>

          <button
            className="px-6 py-3 rounded-xl border bg-blue-600/20 hover:bg-blue-600/30 border-blue-600/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={running || !settings.enabled}
            onClick={runAutopilot}
          >
            {running ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 inline mr-2" />
                Run Autopilot Now
              </>
            )}
          </button>
        </div>

        <div className="text-sm opacity-70 mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <strong>Note:</strong> Autopilot runs based on the rules you configure. Currently, the default rule pauses ads
          that have spent more than $10 with a CTR below 0.6% over the last 2 days.
        </div>
      </div>
    </div>
  );
}
