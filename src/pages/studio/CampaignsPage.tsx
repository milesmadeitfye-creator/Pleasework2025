import { useState, useEffect } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import CampaignCard from '../../components/campaigns/CampaignCard';

interface Campaign {
  id: string;
  campaign_type: 'smart_link_probe' | 'one_click_sound' | 'follower_growth' | 'fan_capture';
  campaign_name: string;
  status: 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'failed';
  daily_budget_cents: number;
  total_spend_cents: number;
  total_clicks: number;
  latest_score?: number;
  latest_grade?: string;
  latest_confidence?: string;
  score_updated_at?: string;
  destination_platform?: string;
  ai_mode: 'manual' | 'guided' | 'autonomous';
  automation_enabled: boolean;
}

interface AIRecommendation {
  action: string;
  reason: string;
  score_used: number;
  confidence: string;
  recommended_budget?: number;
  guardrails: string[];
}

export default function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);

  useEffect(() => {
    if (user) {
      loadCampaigns();
    }
  }, [user]);

  const loadCampaigns = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('ghoste_campaigns')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(data || []);
    } catch (err) {
      console.error('[CampaignsPage] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComputeScore = async (campaign_id: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) return;

      const res = await fetch('/.netlify/functions/campaign-score-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaign_id,
          window_hours: 24,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        await loadCampaigns();
      }
    } catch (err) {
      console.error('[CampaignsPage] Score compute error:', err);
    }
  };

  const handleGetRecommendation = async (campaign_id: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) return;

      const res = await fetch('/.netlify/functions/campaign-ai-recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaign_id,
        }),
      });

      const json = await res.json();

      if (json.ok) {
        setSelectedCampaign(campaign_id);
        setRecommendation(json.decision);
      }
    } catch (err) {
      console.error('[CampaignsPage] Recommendation error:', err);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'scale_up': return '📈';
      case 'maintain': return '✅';
      case 'rotate_creative': return '🔄';
      case 'tighten_audience': return '🎯';
      case 'pause': return '⏸️';
      case 'test_variation': return '🧪';
      default: return '📊';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'scale_up': return 'Scale Up Budget';
      case 'maintain': return 'Maintain Current Settings';
      case 'rotate_creative': return 'Rotate Creative';
      case 'tighten_audience': return 'Tighten Audience';
      case 'pause': return 'Pause Campaign';
      case 'test_variation': return 'Test Creative Variation';
      default: return action;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F29] p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-800 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-gray-800 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F29] p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Campaigns</h1>
            <p className="text-gray-400">
              Manage your Meta ad campaigns with AI-powered performance scoring
            </p>
          </div>

          <button className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-white mb-2">No campaigns yet</h2>
            <p className="text-gray-400 mb-6">
              Create your first campaign to start promoting your music
            </p>
            <button className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create First Campaign
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {campaigns.map(campaign => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onComputeScore={handleComputeScore}
                  onGetRecommendation={handleGetRecommendation}
                />
              ))}
            </div>

            {recommendation && selectedCampaign && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-8 max-w-2xl w-full">
                  <div className="flex items-center gap-3 mb-6">
                    <Sparkles className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-white">AI Recommendation</h2>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-4xl">{getActionIcon(recommendation.action)}</span>
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          {getActionLabel(recommendation.action)}
                        </h3>
                        <p className="text-sm text-gray-400">
                          Based on score: {recommendation.score_used}/100 ({recommendation.confidence} confidence)
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-800/50 rounded-lg mb-4">
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {recommendation.reason}
                      </p>
                    </div>

                    {recommendation.recommended_budget && (
                      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-4">
                        <p className="text-sm font-semibold text-blue-400 mb-1">
                          Recommended Daily Budget
                        </p>
                        <p className="text-2xl font-bold text-white">
                          ${recommendation.recommended_budget.toFixed(2)}
                        </p>
                      </div>
                    )}

                    {recommendation.guardrails.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                          Guardrails
                        </h4>
                        <ul className="space-y-1.5">
                          {recommendation.guardrails.map((guardrail, index) => (
                            <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                              <span className="text-yellow-400 mt-0.5">⚠️</span>
                              <span>{guardrail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSelectedCampaign(null);
                        setRecommendation(null);
                      }}
                      className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      Close
                    </button>
                    <button className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold rounded-lg transition-colors">
                      Apply Recommendation
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
