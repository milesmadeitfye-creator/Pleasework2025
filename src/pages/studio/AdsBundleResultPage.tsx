import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase.client';
import { PageShell } from '../../components/layout/PageShell';
import { CheckCircle, XCircle, AlertCircle, ExternalLink, ArrowRight, Package } from 'lucide-react';
import { GOAL_REGISTRY } from '@/lib/goals/goalRegistry';

interface CampaignDraft {
  id: string;
  goal_key: string;
  template_key: string;
  budget_daily: number;
  destination_url: string;
  status: string;
  bundle_index: number;
  bundle_total: number;
  created_at: string;
}

export default function AdsBundleResultPage() {
  const { bundle_id } = useParams<{ bundle_id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bundle_id) {
      loadBundleDrafts();
    }
  }, [bundle_id]);

  async function loadBundleDrafts() {
    try {
      const { data, error: queryError } = await supabase
        .from('campaign_drafts')
        .select('*')
        .eq('bundle_id', bundle_id)
        .order('bundle_index', { ascending: true });

      if (queryError) throw queryError;

      if (!data || data.length === 0) {
        setError('Bundle not found');
        setLoading(false);
        return;
      }

      setDrafts(data);
      setLoading(false);
    } catch (err: any) {
      console.error('[AdsBundleResultPage] Load error:', err);
      setError(err.message || 'Failed to load bundle');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="Campaign Bundle" fullWidth>
        <div className="max-w-4xl mx-auto py-8">
          <div className="text-center text-ghoste-grey">Loading bundle...</div>
        </div>
      </PageShell>
    );
  }

  if (error || drafts.length === 0) {
    return (
      <PageShell title="Campaign Bundle" fullWidth>
        <div className="max-w-4xl mx-auto py-8">
          <div className="p-6 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 text-lg font-semibold mb-2">Bundle Not Found</p>
            <p className="text-ghoste-grey text-sm mb-4">
              {error || 'No campaigns found in this bundle.'}
            </p>
            <button
              onClick={() => navigate('/studio/ads/drafts')}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-ghoste-white transition-colors"
            >
              Go to Drafts
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  const allSuccess = drafts.every(d => d.status === 'draft');
  const bundleTotal = drafts[0]?.bundle_total || drafts.length;

  return (
    <PageShell title="Campaign Bundle Created" fullWidth>
      <div className="max-w-4xl mx-auto py-8 space-y-6">
        {/* Success Banner */}
        <div className="p-6 rounded-lg bg-green-500/10 border border-green-500/30">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-8 h-8 text-green-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-bold text-green-300 mb-2">
                Bundle Created Successfully!
              </h2>
              <p className="text-ghoste-grey mb-3">
                {bundleTotal} campaign draft{bundleTotal > 1 ? 's' : ''} created and ready for review.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-ghoste-grey" />
                <span className="text-ghoste-grey font-mono">Bundle ID: {bundle_id?.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        </div>

        {/* Campaign List */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-ghoste-white mb-3">Campaigns in this Bundle</h3>

          {drafts.map((draft, idx) => {
            const goal = GOAL_REGISTRY[draft.goal_key as keyof typeof GOAL_REGISTRY];
            const isSuccess = draft.status === 'draft';

            return (
              <div
                key={draft.id}
                className="p-4 rounded-lg bg-white/5 border border-ghoste-border hover:border-ghoste-grey transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-ghoste-blue/20 text-ghoste-blue font-bold text-sm flex-shrink-0">
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-ghoste-white">
                        {goal?.title || draft.goal_key}
                      </h4>
                      {isSuccess ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Draft Created
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {draft.status}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-ghoste-grey mb-2">
                      {goal?.description || 'Campaign goal'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-ghoste-grey">
                      <span>Template: {draft.template_key}</span>
                      <span>Budget: ${draft.budget_daily}/day</span>
                      <span>Status: {draft.status}</span>
                    </div>

                    {draft.destination_url && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <ExternalLink className="w-3 h-3 text-ghoste-grey" />
                        <a
                          href={draft.destination_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 truncate"
                        >
                          {draft.destination_url}
                        </a>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => navigate(`/studio/ads/drafts/${draft.id}`)}
                    className="px-3 py-1.5 rounded-lg bg-ghoste-blue hover:bg-blue-600 text-white text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    Review
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-ghoste-border">
          <button
            onClick={() => navigate('/studio/ads/drafts')}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-ghoste-white transition-colors"
          >
            View All Drafts
          </button>

          <button
            onClick={() => navigate('/studio/ads/campaigns')}
            className="px-6 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors flex items-center gap-2"
          >
            Go to Campaigns
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Next Steps */}
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <h4 className="font-semibold text-blue-300 mb-2">Next Steps</h4>
          <ul className="text-sm text-ghoste-grey space-y-1 list-disc list-inside">
            <li>Review each campaign draft and add creatives</li>
            <li>Approve and publish campaigns when ready</li>
            <li>Monitor performance in the Campaigns tab</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
