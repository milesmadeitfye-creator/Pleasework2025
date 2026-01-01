import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, FileText, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { PageShell } from '../../components/layout/PageShell';
import { StudioTabs } from '../../components/studio/StudioTabs';
import { GhosteTabsNav } from '../../components/ui/GhosteTabsNav';
import { GhosteBadge } from '../../components/ui/GhosteBadge';

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

  const adsTabs = [
    { label: 'Campaigns', to: '/studio/ads/campaigns', icon: <Target className="w-4 h-4" />, exact: true },
    { label: 'Drafts', to: '/studio/ads/drafts', icon: <FileText className="w-4 h-4" /> },
  ];

  function getStatusBadgeVariant(status: DraftStatus): 'draft' | 'success' | 'failed' | 'warning' | 'info' {
    const variantMap: Record<DraftStatus, 'draft' | 'success' | 'failed' | 'warning' | 'info'> = {
      draft: 'draft',
      approved: 'info',
      launched: 'success',
      failed: 'failed',
      paused: 'warning',
    };
    return variantMap[status];
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
      <PageShell title="Ghoste Studio" fullWidth>
        <div className="max-w-7xl mx-auto space-y-6">
          <StudioTabs />
          <div className="p-8 text-center">
            <p className="text-ghoste-grey">Please sign in to view drafts</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Ghoste Studio" fullWidth>
      <div className="max-w-7xl mx-auto space-y-6">
        <StudioTabs />

        {/* Ads Section Header */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-ghoste-white mb-1">Ads Studio</h1>
            <p className="text-sm text-ghoste-grey">Manage campaigns, drafts, and results</p>
          </div>

          {/* Ads Tabs */}
          <GhosteTabsNav tabs={adsTabs} />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'draft', 'approved', 'launched', 'failed', 'paused'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === status
                  ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_12px_rgba(26,108,255,0.4)]'
                  : 'bg-white/5 text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white border border-white/10'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ghoste-blue"></div>
            <p className="text-ghoste-grey mt-4">Loading drafts...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && drafts.length === 0 && (
          <div className="text-center py-12 bg-ghoste-black/40 rounded-xl border border-white/10">
            <div className="text-ghoste-grey mb-4">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium text-ghoste-white">No drafts found</p>
              <p className="text-sm mt-2">
                {filter === 'all'
                  ? 'Create your first campaign draft to get started'
                  : `No ${filter} drafts`}
              </p>
            </div>
            <button
              onClick={() => navigate('/studio/ads/plan-from-goals')}
              className="px-6 py-3 bg-ghoste-blue hover:bg-blue-600 text-ghoste-white rounded-lg font-medium transition-colors shadow-[0_0_20px_rgba(26,108,255,0.3)]"
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
                className="bg-ghoste-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:border-white/20 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-ghoste-white">
                        {getGoalLabel(draft.goal)}
                      </h3>
                      <GhosteBadge variant={getStatusBadgeVariant(draft.status)}>
                        {draft.status}
                      </GhosteBadge>
                    </div>
                    <p className="text-ghoste-grey text-sm">
                      Created {new Date(draft.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/studio/ads/drafts/${draft.id}`)}
                      className="px-4 py-2 bg-ghoste-blue hover:bg-blue-600 text-ghoste-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_12px_rgba(26,108,255,0.2)] hover:shadow-[0_0_20px_rgba(26,108,255,0.4)]"
                    >
                      View Details
                    </button>
                    {draft.status === 'draft' && (
                      <button
                        onClick={() => deleteDraft(draft.id)}
                        className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-ghoste-grey text-xs mb-1">Daily Budget</p>
                    <p className="text-ghoste-white font-semibold">${draft.budget_daily}/day</p>
                  </div>
                  <div>
                    <p className="text-ghoste-grey text-xs mb-1">Duration</p>
                    <p className="text-ghoste-white font-semibold">{draft.duration_days} days</p>
                  </div>
                  <div>
                    <p className="text-ghoste-grey text-xs mb-1">Total Budget</p>
                    <p className="text-ghoste-white font-semibold">
                      ${(Number(draft.budget_daily) * draft.duration_days).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-ghoste-grey text-xs mb-1">Destination</p>
                  <a
                    href={draft.destination_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ghoste-blue hover:text-blue-400 text-sm truncate block max-w-md flex items-center gap-2"
                  >
                    <span className="truncate">{draft.destination_url}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>

                {draft.meta_campaign_id && (
                  <div className="mb-3">
                    <p className="text-ghoste-grey text-xs mb-1">Meta Campaign ID</p>
                    <p className="text-ghoste-grey text-sm font-mono">{draft.meta_campaign_id}</p>
                  </div>
                )}

                {draft.error_message && (
                  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
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
    </PageShell>
  );
}
