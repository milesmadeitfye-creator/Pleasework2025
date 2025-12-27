import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { Plus, TrendingUp, DollarSign, Eye, MousePointer, Trash2, Play, Pause, Facebook, AlertCircle } from 'lucide-react';
import { safeToFixed, safeNumber } from '../utils/numbers';

interface Campaign {
  id: string;
  name: string;
  platform: 'meta' | 'tiktok' | 'youtube';
  status: 'draft' | 'active' | 'paused' | 'completed';
  budget: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

const platformColors = {
  meta: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tiktok: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  youtube: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const statusColors = {
  draft: 'bg-gray-500/20 text-gray-400',
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

  useEffect(() => {
    if (user) {
      fetchCampaigns();
      fetchMetaAssets();
    }
  }, [user]);

  const fetchMetaAssets = async () => {
    setLoadingMeta(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMetaAssets({ connected: false });
        setLoadingMeta(false);
        return;
      }

      const response = await fetch('/.netlify/functions/meta-ads-assets', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMetaAssets(data);

        // Set default selected ad account
        if (data.connected && data.ad_accounts && data.ad_accounts.length > 0) {
          setSelectedAdAccountId(data.ad_accounts[0].id);
        }
      } else {
        console.error('[AdsManager] Meta assets fetch failed:', response.status);
        setMetaAssets({ connected: false });
      }
    } catch (err) {
      console.error('[AdsManager] Error fetching Meta assets:', err);
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
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCampaigns(data);
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
    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    await supabase
      .from('ad_campaigns')
      .update({ status: newStatus })
      .eq('id', campaign.id);
    fetchCampaigns();
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
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold">{campaign.name}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        platformColors[campaign.platform]
                      }`}
                    >
                      {campaign.platform.toUpperCase()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Budget: ${safeToFixed(campaign?.budget, 2)} | Spend: ${safeToFixed(campaign?.spend, 2)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(campaign.status === 'draft' || campaign.status === 'paused') && (
                    <button
                      onClick={() => toggleCampaignStatus(campaign)}
                      className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Activate"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                  {campaign.status === 'active' && (
                    <button
                      onClick={() => toggleCampaignStatus(campaign)}
                      className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Pause"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6">Create Campaign</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Campaign Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Platform <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.platform}
                  onChange={(e) =>
                    setFormData({ ...formData, platform: e.target.value as 'meta' | 'tiktok' | 'youtube' })
                  }
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="meta">Meta (Facebook/Instagram)</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>

              {/* BUILD FIX: Changed ad_accounts to adAccounts to match MetaAssets interface (TS2551) */}
              {formData.platform === 'meta' && metaAssets?.connected && metaAssets.adAccounts && metaAssets.adAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Ad Account <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={selectedAdAccountId || ''}
                    onChange={(e) => setSelectedAdAccountId(e.target.value)}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {metaAssets.adAccounts.map((account: any) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.platform === 'meta' && (!metaAssets?.connected || !metaAssets.adAccounts || metaAssets.adAccounts.length === 0) && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
                  <p className="text-sm text-yellow-400">
                    No Meta ad accounts found. Please connect Meta in <a href="/dashboard?tab=accounts" className="underline">Connected Accounts</a>.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Budget ($) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  min="0"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Create Campaign
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
