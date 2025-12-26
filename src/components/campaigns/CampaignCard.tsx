import { useState } from 'react';
import { TrendingUp, Play, Pause, Settings, AlertCircle, CheckCircle, XCircle, Sparkles } from 'lucide-react';

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

interface Props {
  campaign: Campaign;
  onViewDetails?: (id: string) => void;
  onToggleStatus?: (id: string) => void;
  onComputeScore?: (id: string) => void;
  onGetRecommendation?: (id: string) => void;
}

export default function CampaignCard({
  campaign,
  onViewDetails,
  onToggleStatus,
  onComputeScore,
  onGetRecommendation,
}: Props) {
  const [loading, setLoading] = useState(false);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'smart_link_probe': return '🔗';
      case 'one_click_sound': return '🎵';
      case 'follower_growth': return '📈';
      case 'fan_capture': return '📧';
      default: return '📊';
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'smart_link_probe': return 'Smart Link';
      case 'one_click_sound': return 'One-Click Sound';
      case 'follower_growth': return 'Follower Growth';
      case 'fan_capture': return 'Fan Capture';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'paused': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'draft': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    }
  };

  const getGradeBadgeColor = (grade: string) => {
    switch (grade) {
      case 'strong': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pass': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'weak': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'fail': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getGradeIcon = (grade: string) => {
    switch (grade) {
      case 'strong': return <CheckCircle className="w-4 h-4" />;
      case 'pass': return <CheckCircle className="w-4 h-4" />;
      case 'weak': return <AlertCircle className="w-4 h-4" />;
      case 'fail': return <XCircle className="w-4 h-4" />;
      default: return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'high': return '🎯';
      case 'medium': return '📊';
      case 'low': return '⚠️';
      default: return '📈';
    }
  };

  const handleComputeScore = async () => {
    if (onComputeScore) {
      setLoading(true);
      try {
        await onComputeScore(campaign.id);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGetRecommendation = async () => {
    if (onGetRecommendation) {
      setLoading(true);
      try {
        await onGetRecommendation(campaign.id);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-950 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{getTypeIcon(campaign.campaign_type)}</div>
          <div>
            <h3 className="text-lg font-semibold text-white">{campaign.campaign_name}</h3>
            <p className="text-sm text-gray-400">{getTypeName(campaign.campaign_type)}</p>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase ${getStatusColor(campaign.status)}`}>
          {campaign.status}
        </div>
      </div>

      {campaign.destination_platform && (
        <div className="mb-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs text-blue-400">
            <span className="capitalize">{campaign.destination_platform}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-800">
        <div>
          <p className="text-xs text-gray-500 mb-1">Daily Budget</p>
          <p className="text-sm font-semibold text-white">
            ${(campaign.daily_budget_cents / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Total Spend</p>
          <p className="text-sm font-semibold text-white">
            ${(campaign.total_spend_cents / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Clicks</p>
          <p className="text-sm font-semibold text-white">
            {campaign.total_clicks.toLocaleString()}
          </p>
        </div>
      </div>

      {campaign.latest_score ? (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase">Performance Score</p>
            <button
              onClick={handleComputeScore}
              disabled={loading}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {loading ? 'Computing...' : 'Refresh'}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-blue-500/30 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">{campaign.latest_score}</span>
              </div>
            </div>

            <div className="flex-1">
              <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border text-xs font-semibold mb-1 ${getGradeBadgeColor(campaign.latest_grade || '')}`}>
                {getGradeIcon(campaign.latest_grade || '')}
                <span className="uppercase">{campaign.latest_grade}</span>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{getConfidenceIcon(campaign.latest_confidence || '')}</span>
                <span className="capitalize">{campaign.latest_confidence} Confidence</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">No performance score yet</p>
          <button
            onClick={handleComputeScore}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Computing...' : 'Compute Score'}
          </button>
        </div>
      )}

      {campaign.ai_mode !== 'manual' && (
        <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <p className="text-xs font-semibold text-purple-400 uppercase">
              AI Mode: {campaign.ai_mode}
            </p>
          </div>
          <p className="text-xs text-gray-400">
            {campaign.ai_mode === 'autonomous'
              ? 'AI can automatically scale budget within caps'
              : 'AI provides recommendations (manual approval required)'}
          </p>
        </div>
      )}

      {campaign.latest_score && (
        <button
          onClick={handleGetRecommendation}
          disabled={loading}
          className="w-full mb-3 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {loading ? 'Getting Recommendation...' : 'Get AI Recommendation'}
        </button>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onViewDetails?.(campaign.id)}
          className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Details
        </button>

        {campaign.status === 'active' || campaign.status === 'paused' ? (
          <button
            onClick={() => onToggleStatus?.(campaign.id)}
            className={`flex-1 px-4 py-2 ${
              campaign.status === 'active'
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30'
                : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
            } text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2`}
          >
            {campaign.status === 'active' ? (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
