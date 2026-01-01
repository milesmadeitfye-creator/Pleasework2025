import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

type DraftStatus = 'draft' | 'approved' | 'launched' | 'failed' | 'paused';

interface CampaignDraft {
  id: string;
  user_id: string;
  goal: string;
  budget_daily: number;
  duration_days: number;
  destination_url: string;
  smart_link_id: string | null;
  creative_media_asset_id: string | null;
  creative_url: string | null;
  ad_account_id: string | null;
  page_id: string | null;
  pixel_id: string | null;
  status: DraftStatus;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  error_message: string | null;
  approved_at: string | null;
  launched_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdsDraftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    loadDraft();
  }, [user, id]);

  async function loadDraft() {
    if (!user || !id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaign_drafts')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[DraftDetail] Failed to load:', error);
        alert('Draft not found or access denied');
        navigate('/studio/ads/drafts');
        return;
      }

      setDraft(data);
    } catch (err) {
      console.error('[DraftDetail] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function approveDraft() {
    if (!draft || !user) return;

    if (!confirm('Launch this campaign? It will start spending your budget immediately.')) {
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('campaign_drafts')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .eq('id', draft.id);

      if (error) throw error;

      alert('Campaign approved and will be launched shortly!');
      loadDraft();
    } catch (err: any) {
      console.error('[DraftDetail] Approve error:', err);
      alert(`Failed to approve: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteDraft() {
    if (!draft || !user) return;

    if (!confirm('Delete this draft? This cannot be undone.')) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('campaign_drafts')
        .delete()
        .eq('id', draft.id);

      if (error) throw error;

      alert('Draft deleted');
      navigate('/studio/ads/drafts');
    } catch (err: any) {
      console.error('[DraftDetail] Delete error:', err);
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
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

  function getStatusBadge(status: DraftStatus) {
    const styles: Record<DraftStatus, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
      approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Approved' },
      launched: { bg: 'bg-green-100', text: 'text-green-800', label: 'Launched' },
      failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
      paused: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Paused' },
    };

    const style = styles[status];

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Please sign in to view this draft</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-gray-300">Loading draft...</p>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Draft not found</p>
          <button
            onClick={() => navigate('/studio/ads/drafts')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            View All Drafts
          </button>
        </div>
      </div>
    );
  }

  const totalBudget = Number(draft.budget_daily) * draft.duration_days;
  const isNewDraft = draft.status === 'draft' && !draft.meta_campaign_id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/studio/ads/drafts')}
            className="text-gray-300 hover:text-white mb-4 flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Drafts
          </button>

          {/* Success Banner for New Drafts */}
          {isNewDraft && (
            <div className="mb-6 p-6 bg-green-900/20 border-2 border-green-500/50 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Draft Created Successfully!</h2>
                  <p className="text-gray-300">Review your campaign details below</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{getGoalLabel(draft.goal)}</h1>
                {getStatusBadge(draft.status)}
              </div>
              <p className="text-gray-300">
                Created {new Date(draft.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Campaign Details */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-8 mb-6">
          <h3 className="text-xl font-semibold text-white mb-6">Campaign Summary</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <p className="text-gray-400 text-sm mb-2">Daily Budget</p>
              <p className="text-3xl font-bold text-white">${draft.budget_daily}</p>
              <p className="text-gray-400 text-xs mt-1">per day</p>
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <p className="text-gray-400 text-sm mb-2">Duration</p>
              <p className="text-3xl font-bold text-white">{draft.duration_days}</p>
              <p className="text-gray-400 text-xs mt-1">days</p>
            </div>
            <div className="bg-white/5 p-4 rounded-lg border border-white/10">
              <p className="text-gray-400 text-sm mb-2">Total Budget</p>
              <p className="text-3xl font-bold text-white">${totalBudget.toFixed(2)}</p>
              <p className="text-gray-400 text-xs mt-1">estimated spend</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-gray-400 text-sm mb-2">Goal</p>
              <p className="text-white font-medium">{getGoalLabel(draft.goal)}</p>
            </div>

            <div>
              <p className="text-gray-400 text-sm mb-2">Destination URL</p>
              <a
                href={draft.destination_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline break-all"
              >
                {draft.destination_url}
              </a>
            </div>

            {draft.creative_url && (
              <div>
                <p className="text-gray-400 text-sm mb-2">Creative</p>
                <a
                  href={draft.creative_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all"
                >
                  {draft.creative_url}
                </a>
              </div>
            )}

            {draft.ad_account_id && (
              <div>
                <p className="text-gray-400 text-sm mb-2">Meta Ad Account</p>
                <p className="text-white font-mono text-sm">{draft.ad_account_id}</p>
              </div>
            )}

            {draft.page_id && (
              <div>
                <p className="text-gray-400 text-sm mb-2">Meta Page ID</p>
                <p className="text-white font-mono text-sm">{draft.page_id}</p>
              </div>
            )}

            {draft.pixel_id && (
              <div>
                <p className="text-gray-400 text-sm mb-2">Meta Pixel ID</p>
                <p className="text-white font-mono text-sm">{draft.pixel_id}</p>
              </div>
            )}
          </div>
        </div>

        {/* Meta IDs (if created) */}
        {draft.meta_campaign_id && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Meta Campaign IDs</h3>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400 text-xs mb-1">Campaign ID</p>
                <p className="text-white font-mono text-sm">{draft.meta_campaign_id}</p>
              </div>
              {draft.meta_adset_id && (
                <div>
                  <p className="text-gray-400 text-xs mb-1">Ad Set ID</p>
                  <p className="text-white font-mono text-sm">{draft.meta_adset_id}</p>
                </div>
              )}
              {draft.meta_ad_id && (
                <div>
                  <p className="text-gray-400 text-xs mb-1">Ad ID</p>
                  <p className="text-white font-mono text-sm">{draft.meta_ad_id}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {draft.error_message && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
            <p className="text-red-300 text-sm">{draft.error_message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Actions</h3>
          <div className="flex gap-3 flex-wrap">
            {draft.status === 'draft' && (
              <>
                <button
                  onClick={approveDraft}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  {actionLoading ? 'Processing...' : 'Approve & Launch'}
                </button>
                <button
                  onClick={() => navigate('/studio/ads', { state: { editDraft: draft.id } })}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Continue Editing
                </button>
                <button
                  onClick={deleteDraft}
                  disabled={actionLoading}
                  className="px-6 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium transition-colors"
                >
                  Delete Draft
                </button>
              </>
            )}

            {draft.status === 'launched' && draft.meta_campaign_id && (
              <a
                href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${draft.ad_account_id}&selected_campaign_ids=${draft.meta_campaign_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-block"
              >
                Open in Meta Ads Manager
              </a>
            )}

            <button
              onClick={() => navigate('/studio/ads/drafts')}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
            >
              View All Drafts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
