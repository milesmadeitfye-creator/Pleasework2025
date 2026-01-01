import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

type DraftStatus = 'draft' | 'approved' | 'launched' | 'failed' | 'paused';

interface CampaignDraft {
  id: string;
  goal: string;
  budget_daily: number;
  duration_days: number;
  destination_url: string;
  status: DraftStatus;
  meta_campaign_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdsDraftsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | 'all'>('all');

  useEffect(() => {
    if (!user) return;
    loadDrafts();
  }, [user, filter]);

  async function loadDrafts() {
    if (!user) return;

    setLoading(true);
    try {
      let query = supabase
        .from('campaign_drafts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[AdsDrafts] Failed to load:', error);
        return;
      }

      setDrafts(data || []);
    } catch (err) {
      console.error('[AdsDrafts] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: DraftStatus) {
    const styles: Record<DraftStatus, string> = {
      draft: 'bg-gray-100 text-gray-800',
      approved: 'bg-blue-100 text-blue-800',
      launched: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      paused: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {status}
      </span>
    );
  }

  function getGoalLabel(goal: string): string {
    const labels: Record<string, string> = {
      song_promo: 'Song Promotion',
      traffic: 'Traffic',
      conversions: 'Conversions',
      awareness: 'Awareness',
      engagement: 'Engagement',
      video_views: 'Video Views',
    };
    return labels[goal] || goal;
  }

  async function deleteDraft(id: string) {
    if (!confirm('Delete this draft? This cannot be undone.')) return;

    const { error } = await supabase
      .from('campaign_drafts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[AdsDrafts] Delete failed:', error);
      alert('Failed to delete draft');
      return;
    }

    setDrafts(prev => prev.filter(d => d.id !== id));
  }

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">Please sign in to view drafts</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Campaign Drafts</h1>
              <p className="text-gray-300">Review and manage your ad campaign drafts</p>
            </div>
            <button
              onClick={() => navigate('/studio/ads')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              ← Back to Ads
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'draft', 'approved', 'launched', 'failed', 'paused'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <p className="text-gray-300 mt-4">Loading drafts...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && drafts.length === 0 && (
          <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No drafts found</p>
              <p className="text-sm mt-2">
                {filter === 'all'
                  ? 'Create your first campaign draft to get started'
                  : `No ${filter} drafts`}
              </p>
            </div>
            <button
              onClick={() => navigate('/studio/ads')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Create Campaign
            </button>
          </div>
        )}

        {/* Drafts List */}
        {!loading && drafts.length > 0 && (
          <div className="space-y-4">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-white">
                        {getGoalLabel(draft.goal)}
                      </h3>
                      {getStatusBadge(draft.status)}
                    </div>
                    <p className="text-gray-300 text-sm">
                      Created {new Date(draft.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/studio/ads/drafts/${draft.id}`)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      View Details
                    </button>
                    {draft.status === 'draft' && (
                      <button
                        onClick={() => deleteDraft(draft.id)}
                        className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Daily Budget</p>
                    <p className="text-white font-semibold">${draft.budget_daily}/day</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Duration</p>
                    <p className="text-white font-semibold">{draft.duration_days} days</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Total Budget</p>
                    <p className="text-white font-semibold">
                      ${(Number(draft.budget_daily) * draft.duration_days).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-gray-400 text-xs mb-1">Destination</p>
                  <a
                    href={draft.destination_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm truncate block max-w-md"
                  >
                    {draft.destination_url}
                  </a>
                </div>

                {draft.meta_campaign_id && (
                  <div className="mb-3">
                    <p className="text-gray-400 text-xs mb-1">Meta Campaign ID</p>
                    <p className="text-gray-300 text-sm font-mono">{draft.meta_campaign_id}</p>
                  </div>
                )}

                {draft.error_message && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <p className="text-red-400 text-sm">
                      <span className="font-semibold">Error:</span> {draft.error_message}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
