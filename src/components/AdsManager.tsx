import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, TrendingUp, DollarSign, Eye, MousePointer, Trash2, Play, Pause, Facebook, AlertCircle, Copy, Edit3, ExternalLink } from 'lucide-react';
import { safeToFixed, safeNumber } from '../utils/numbers';
import { AICampaignWizard } from './campaigns/AICampaignWizard';

interface Campaign {
  id: string;
  name?: string;
  ad_goal?: string;
  campaign_type?: string;
  platform?: 'meta' | 'tiktok' | 'youtube';
  status: 'draft' | 'publishing' | 'published' | 'failed' | 'active' | 'paused' | 'completed';
  budget?: number;
  daily_budget_cents?: number;
  total_budget_cents?: number;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  start_date?: string | null;
  end_date?: string | null;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  destination_url?: string;
  smart_link_slug?: string;
  last_error?: string;
  created_at: string;
  updated_at?: string;
}

const platformColors = {
  meta: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tiktok: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  youtube: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const statusColors = {
  draft: 'bg-gray-500/20 text-gray-400',
  publishing: 'bg-blue-500/20 text-blue-400 animate-pulse',
  published: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  active: 'bg-green-500/20 text-green-400',
  paused: 'bg-yellow-500/20 text-yellow-400',
  completed: 'bg-blue-500/20 text-blue-400',
};

interface MetaAssets {
  connected: boolean;
  requiresReconnect?: boolean;
  adAccounts?: Array<{ id: string; name: string; account_status: number }>;
  pages?: Array<{ id: string; name: string }>;
}

export default function AdsManager() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [metaAssets, setMetaAssets] = useState<MetaAssets | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    platform: 'meta' as 'meta' | 'tiktok' | 'youtube',
    budget: '',
    start_date: '',
    end_date: '',
  });
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetFormData, setBudgetFormData] = useState({
    budget_type: 'daily' as 'daily' | 'lifetime',
    amount: '',
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchCampaigns();
      fetchMetaAssets();
    }
  }, [user]);

  const fetchMetaAssets = async () => {
    setLoadingMeta(true);
    try {
      if (!supabase) {
        console.warn('[AdsManager] Supabase not ready');
        setMetaAssets({ connected: false });
        setLoadingMeta(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMetaAssets({ connected: false });
        setLoadingMeta(false);
        return;
      }

      // FIXED: Correct endpoint is meta-accounts (not meta-ads-assets)
      const response = await fetch('/.netlify/functions/meta-accounts', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      // Robust error handling for non-JSON responses
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('text/html')) {
          console.error('[AdsManager] Received HTML instead of JSON (endpoint may not exist):', response.status);
          console.error('[AdsManager] Response preview:', await response.text().then(t => t.substring(0, 200)));
        } else {
          console.error('[AdsManager] Meta assets fetch failed:', response.status, await response.text());
        }
        setMetaAssets({ connected: false });
        setLoadingMeta(false);
        return;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        console.error('[AdsManager] Expected JSON but got:', contentType);
        const preview = await response.text();
        console.error('[AdsManager] Response preview:', preview.substring(0, 200));
        setMetaAssets({ connected: false });
        setLoadingMeta(false);
        return;
      }

      const data = await response.json();

      // Transform response to expected format
      setMetaAssets({
        connected: data.connected !== false,
        ad_accounts: data.accounts || data.ad_accounts || [],
      });

      // Set default selected ad account
      if (data.accounts && data.accounts.length > 0) {
        setSelectedAdAccountId(data.accounts[0].id);
      }
    } catch (err: any) {
      console.error('[AdsManager] Error fetching Meta assets:', err);
      if (err.message?.includes('Unexpected token')) {
        console.error('[AdsManager] JSON parse error - likely received HTML instead of JSON');
      }
      setMetaAssets({ connected: false });
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleConnectMeta = () => {
    if (user) {
      window.location.href = `/.netlify/functions/meta-auth?userId=${encodeURIComponent(user.id)}`;
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);

    if (!supabase) {
      console.warn('[AdsManager] Supabase not ready, returning empty');
      setCampaigns([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdsManager] Fetch error:', error);
      setCampaigns([]);
    } else {
      setCampaigns(data ?? []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from('ad_campaigns').insert([
      {
        user_id: user?.id,
        name: formData.name,
        platform: formData.platform,
        budget: parseFloat(formData.budget),
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        status: 'draft',
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      },
    ]);

    if (!error) {
      fetchCampaigns();
      setFormData({
        name: '',
        platform: 'meta',
        budget: '',
        start_date: '',
        end_date: '',
      });
      setShowModal(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      await supabase.from('ad_campaigns').delete().eq('id', id);
      fetchCampaigns();
    }
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const enabled = campaign.status === 'paused' || campaign.status === 'draft';
    setActionLoading(campaign.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to manage campaigns');
        return;
      }

      const response = await fetch('/api/meta/toggle', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: 'campaign',
          id: campaign.id,
          enabled,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Failed to ${enabled ? 'activate' : 'pause'} campaign: ${data.error || 'Unknown error'}`);
      } else {
        // Refresh campaigns to show updated status
        fetchCampaigns();

        if (data.draftOnly) {
          alert(`Campaign ${enabled ? 'activated' : 'paused'} (draft only - will sync when published to Meta)`);
        }
      }
    } catch (error: any) {
      console.error('[toggleCampaignStatus] Error:', error);
      alert(`Failed to toggle campaign: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const duplicateCampaign = async (campaign: Campaign) => {
    setActionLoading(campaign.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to duplicate campaigns');
        return;
      }

      const response = await fetch('/api/meta/duplicate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          mode: 'draft', // Always create draft for now
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Failed to duplicate campaign: ${data.error || 'Unknown error'}`);
      } else {
        fetchCampaigns();
        alert(`Campaign duplicated successfully as "${data.campaign.name}"`);
      }
    } catch (error: any) {
      console.error('[duplicateCampaign] Error:', error);
      alert(`Failed to duplicate campaign: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const openBudgetEditor = (campaign: Campaign) => {
    setEditingBudget(campaign.id);
    setBudgetFormData({
      budget_type: campaign.daily_budget_cents ? 'daily' : 'lifetime',
      amount: campaign.daily_budget_cents
        ? (campaign.daily_budget_cents / 100).toFixed(2)
        : campaign.lifetime_budget_cents
          ? (campaign.lifetime_budget_cents / 100).toFixed(2)
          : '',
    });
  };

  const handleBudgetUpdate = async (campaignId: string) => {
    setActionLoading(campaignId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please log in to update budget');
        return;
      }

      const amountCents = Math.round(parseFloat(budgetFormData.amount) * 100);

      if (isNaN(amountCents) || amountCents <= 0) {
        alert('Please enter a valid budget amount');
        return;
      }

      const response = await fetch('/api/meta/budget', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: 'campaign',
          id: campaignId,
          budget_type: budgetFormData.budget_type,
          amount: amountCents,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`Failed to update budget: ${data.error || 'Unknown error'}`);
      } else {
        fetchCampaigns();
        setEditingBudget(null);

        if (data.draftOnly) {
          alert('Budget updated (draft only - will sync when published to Meta)');
        } else {
          alert('Budget updated and synced to Meta successfully');
        }
      }
    } catch (error: any) {
      console.error('[handleBudgetUpdate] Error:', error);
      alert(`Failed to update budget: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const calculateCTR = (campaign: Campaign) => {
    const impressions = safeNumber(campaign?.impressions);
    const clicks = safeNumber(campaign?.clicks);
    if (impressions === 0) return '0.00';
    return safeToFixed((clicks / impressions) * 100, 2);
  };

  const calculateCPC = (campaign: Campaign) => {
    const clicks = safeNumber(campaign?.clicks);
    const spend = safeNumber(campaign?.spend);
    if (clicks === 0) return '0.00';
    return safeToFixed(spend / clicks, 2);
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading...</div>;
  }

  const safeCampaigns = campaigns ?? [];
  const totalStats = safeCampaigns.reduce(
    (acc, campaign) => ({
      spend: acc.spend + safeNumber(campaign?.spend),
      impressions: acc.impressions + safeNumber(campaign?.impressions),
      clicks: acc.clicks + safeNumber(campaign?.clicks),
      conversions: acc.conversions + safeNumber(campaign?.conversions),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Meta Connection Status */}
      {!loadingMeta && metaAssets !== null && (
        <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/20 border border-blue-700/50 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Facebook className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">Meta Business Manager</h3>
              {!metaAssets?.connected ? (
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm">Connect your Meta account to create and manage ad campaigns</p>
                  <button
                    onClick={handleConnectMeta}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Connect Meta Account
                  </button>
                </div>
              ) : metaAssets.requiresReconnect ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-yellow-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Your Meta token has expired</span>
                  </div>
                  <button
                    onClick={handleConnectMeta}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors"
                  >
                    Reconnect Meta Account
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-400 mb-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm font-medium">Connected</span>
                  </div>
                  {metaAssets.adAccounts && metaAssets.adAccounts.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-400 mb-2">Ad Accounts ({metaAssets.adAccounts.length}):</p>
                      <div className="space-y-1">
                        {metaAssets.adAccounts.slice(0, 3).map((account) => (
                          <div key={account.id} className="text-sm text-gray-300 bg-black/20 rounded px-3 py-2">
                            {account.name}
                          </div>
                        ))}
                        {metaAssets.adAccounts.length > 3 && (
                          <p className="text-xs text-gray-500 px-3 py-1">
                            +{metaAssets.adAccounts.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {metaAssets.pages && metaAssets.pages.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-400 mb-2">Facebook Pages ({metaAssets.pages.length}):</p>
                      <div className="space-y-1">
                        {metaAssets.pages.slice(0, 3).map((page) => (
                          <div key={page.id} className="text-sm text-gray-300 bg-black/20 rounded px-3 py-2">
                            {page.name}
                          </div>
                        ))}
                        {metaAssets.pages.length > 3 && (
                          <p className="text-xs text-gray-500 px-3 py-1">
                            +{metaAssets.pages.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-400">Manage ad campaigns across platforms</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Total Spend</span>
          </div>
          <div className="text-2xl font-bold">${safeToFixed(totalStats.spend, 2)}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Impressions</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.impressions.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <MousePointer className="w-4 h-4" />
            <span className="text-sm">Clicks</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.clicks.toLocaleString()}</div>
        </div>
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Conversions</span>
          </div>
          <div className="text-2xl font-bold">{totalStats.conversions.toLocaleString()}</div>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No campaigns yet</h3>
          <p className="text-gray-500 mb-4">Create your first ad campaign to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-xl font-semibold">
                      {campaign.name || campaign.campaign_type || campaign.ad_goal || 'Untitled Campaign'}
                    </h3>
                    {campaign.platform && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          platformColors[campaign.platform]
                        }`}
                      >
                        {campaign.platform.toUpperCase()}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                      {campaign.status.toUpperCase()}
                    </span>
                    {campaign.ad_goal && (
                      <span className="px-2 py-1 bg-white/5 rounded text-xs text-white/70">
                        {campaign.ad_goal}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    {campaign.daily_budget_cents && (
                      <div>Daily Budget: ${(campaign.daily_budget_cents / 100).toFixed(2)}</div>
                    )}
                    {campaign.lifetime_budget_cents && (
                      <div>Lifetime Budget: ${(campaign.lifetime_budget_cents / 100).toFixed(2)}</div>
                    )}
                    {campaign.budget && (
                      <div>Budget: ${safeToFixed(campaign.budget, 2)} | Spend: ${safeToFixed(campaign?.spend, 2)}</div>
                    )}
                    {campaign.destination_url && (
                      <div className="text-xs truncate max-w-md">
                        Destination: {campaign.destination_url}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {campaign.meta_campaign_id ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded text-xs text-blue-300 font-mono">
                            Meta: ...{campaign.meta_campaign_id.slice(-6)}
                          </span>
                          <a
                            href={`https://business.facebook.com/adsmanager/manage/campaigns?act=${selectedAdAccountId || ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 hover:border-blue-500/40 rounded text-xs text-blue-400 transition-colors"
                            title="View in Meta Ads Manager"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View in Meta
                          </a>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-600/20 border border-gray-500/30 rounded text-xs text-gray-400">
                          Draft Only
                        </span>
                      )}
                    </div>
                    {campaign.last_error && (
                      <div className="text-xs text-red-400 mt-1">
                        Error: {campaign.last_error}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(campaign.status === 'draft' || campaign.status === 'paused') && (
                    <button
                      onClick={() => toggleCampaignStatus(campaign)}
                      disabled={actionLoading === campaign.id}
                      className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Activate"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  {campaign.status === 'active' && (
                    <button
                      onClick={() => toggleCampaignStatus(campaign)}
                      disabled={actionLoading === campaign.id}
                      className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Pause"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => duplicateCampaign(campaign)}
                    disabled={actionLoading === campaign.id}
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Duplicate"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => openBudgetEditor(campaign)}
                    disabled={actionLoading === campaign.id}
                    className="p-2 text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Edit Budget"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    disabled={actionLoading === campaign.id}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Impressions</div>
                  <div className="text-lg font-semibold">{(campaign.impressions ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Clicks</div>
                  <div className="text-lg font-semibold">{(campaign.clicks ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">CTR</div>
                  <div className="text-lg font-semibold">{calculateCTR(campaign)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">CPC</div>
                  <div className="text-lg font-semibold">${calculateCPC(campaign)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Conversions</div>
                  <div className="text-lg font-semibold">{(campaign.conversions ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AICampaignWizard
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            fetchCampaigns();
            setShowModal(false);
          }}
        />
      )}

      {/* Budget Edit Modal */}
      {editingBudget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">Edit Budget</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Budget Type
                </label>
                <select
                  value={budgetFormData.budget_type}
                  onChange={(e) => setBudgetFormData({ ...budgetFormData, budget_type: e.target.value as 'daily' | 'lifetime' })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="daily">Daily Budget</option>
                  <option value="lifetime">Lifetime Budget</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={budgetFormData.amount}
                  onChange={(e) => setBudgetFormData({ ...budgetFormData, amount: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleBudgetUpdate(editingBudget)}
                disabled={actionLoading === editingBudget}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === editingBudget ? 'Updating...' : 'Update Budget'}
              </button>
              <button
                onClick={() => setEditingBudget(null)}
                disabled={actionLoading === editingBudget}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
