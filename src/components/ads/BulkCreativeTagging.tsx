import { useState, useEffect } from 'react';
import { Tag, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../../contexts/AuthContext';
import { readModeSettings } from '../../lib/ads/modes';
import { GOAL_REGISTRY, getAllGoalKeys, type OverallGoalKey } from '../../lib/goals';

interface UntaggedCreative {
  id: string;
  creative_type: string;
  public_url: string;
  created_at: string;
  file_size_bytes: number;
  selectedGoal?: OverallGoalKey;
}

export function BulkCreativeTagging() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatives, setCreatives] = useState<UntaggedCreative[]>([]);
  const [activeGoals, setActiveGoals] = useState<OverallGoalKey[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const [creativesResult, settingsResult] = await Promise.all([
        supabase
          .from('ad_creatives')
          .select('id, creative_type, public_url, created_at, file_size_bytes')
          .eq('owner_user_id', user.id)
          .is('goal_key', null)
          .eq('status', 'ready')
          .order('created_at', { ascending: false })
          .limit(20),
        readModeSettings(user.id),
      ]);

      if (creativesResult.error) {
        throw creativesResult.error;
      }

      setCreatives((creativesResult.data || []) as UntaggedCreative[]);

      if (settingsResult && settingsResult.goal_settings) {
        const active = getAllGoalKeys().filter(
          (key) => settingsResult.goal_settings[key]?.is_active
        );
        setActiveGoals(active);
      }
    } catch (err: any) {
      console.error('[BulkCreativeTagging] Error loading data:', err);
      setError(err.message || 'Failed to load creatives');
    } finally {
      setLoading(false);
    }
  };

  const handleGoalChange = (creativeId: string, goalKey: OverallGoalKey) => {
    setCreatives((prev) =>
      prev.map((c) => (c.id === creativeId ? { ...c, selectedGoal: goalKey } : c))
    );
  };

  const handleSave = async () => {
    if (!user) return;

    const creativesToUpdate = creatives.filter((c) => c.selectedGoal);

    if (creativesToUpdate.length === 0) {
      setError('Please select a goal for at least one creative');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessCount(0);

    try {
      let updated = 0;

      for (const creative of creativesToUpdate) {
        const { error: updateError } = await supabase
          .from('ad_creatives')
          .update({ goal_key: creative.selectedGoal })
          .eq('id', creative.id);

        if (updateError) {
          console.error(`[BulkCreativeTagging] Failed to update ${creative.id}:`, updateError);
        } else {
          updated++;
        }
      }

      setSuccessCount(updated);

      setTimeout(() => {
        loadData();
        setSuccessCount(0);
      }, 2000);
    } catch (err: any) {
      console.error('[BulkCreativeTagging] Error saving:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-5 w-5 bg-white/10 rounded"></div>
          <div className="h-4 w-48 bg-white/10 rounded"></div>
        </div>
      </div>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <div className="rounded-xl border border-yellow-900/50 bg-yellow-950/20 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-yellow-400 mb-1">
              No Active Goals
            </h3>
            <p className="text-sm text-gray-400">
              Turn on goals in your Profile to tag creatives.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (creatives.length === 0) {
    return (
      <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-ghoste-white mb-1">
              All creatives tagged
            </h3>
            <p className="text-sm text-ghoste-grey">
              All your existing creatives have been tagged with goals.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ghoste-border bg-ghoste-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-ghoste-white mb-1 flex items-center gap-2">
          <Tag className="w-5 h-5 text-ghoste-blue" />
          Tag Existing Creatives
        </h3>
        <p className="text-sm text-ghoste-grey">
          Assign goals to your untagged creatives (showing last 20)
        </p>
      </div>

      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
        {creatives.map((creative) => (
          <div
            key={creative.id}
            className="flex items-start gap-4 p-3 rounded-lg bg-white/5 border border-white/10"
          >
            {/* Preview */}
            <div className="flex-shrink-0">
              {creative.creative_type === 'image' ? (
                <img
                  src={creative.public_url}
                  alt="Creative"
                  className="w-20 h-20 object-cover rounded"
                />
              ) : (
                <div className="w-20 h-20 bg-ghoste-bg rounded flex items-center justify-center">
                  <span className="text-xs text-ghoste-grey">Video</span>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ghoste-white font-medium truncate">
                    {creative.creative_type === 'image' ? 'Image' : 'Video'} •{' '}
                    {(creative.file_size_bytes / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <p className="text-xs text-ghoste-grey">
                    {new Date(creative.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Goal Selector */}
              <select
                value={creative.selectedGoal || ''}
                onChange={(e) => handleGoalChange(creative.id, e.target.value as OverallGoalKey)}
                className="w-full px-3 py-2 rounded-lg bg-ghoste-bg border border-ghoste-border text-ghoste-white text-sm focus:outline-none focus:ring-2 focus:ring-ghoste-blue"
              >
                <option value="">Select a goal...</option>
                {activeGoals.map((goalKey) => (
                  <option key={goalKey} value={goalKey}>
                    {GOAL_REGISTRY[goalKey].title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {successCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <p className="text-sm text-green-400">
            Successfully tagged {successCount} creative{successCount !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-ghoste-border">
        <p className="text-sm text-ghoste-grey">
          {creatives.filter((c) => c.selectedGoal).length} of {creatives.length} selected
        </p>
        <button
          onClick={handleSave}
          disabled={saving || creatives.filter((c) => c.selectedGoal).length === 0}
          className="px-5 py-2.5 rounded-lg bg-ghoste-blue text-white font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Save Tags
            </>
          )}
        </button>
      </div>
    </div>
  );
}
