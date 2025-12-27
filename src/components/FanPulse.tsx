import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { RefreshCw, TrendingUp, Mail, MessageSquare, Users, AlertCircle, Check, X } from 'lucide-react';
import { useToast } from './Toast';

const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const MC_SYNC_KEY = 'fanpulse_mailchimp_last_sync_at';
const META_SYNC_KEY = 'fanpulse_meta_last_sync_at';

interface CampaignCache {
  id: string;
  campaign_id: string;
  title: string | null;
  subject_line: string | null;
  status: string | null;
  send_time: string | null;
  emails_sent: number | null;
  unique_opens: number | null;
  opens_total: number | null;
  unique_clicks: number | null;
  clicks_total: number | null;
  unsubscribes: number | null;
  bounces: number | null;
  last_synced_at: string;
}

interface DMMetrics {
  inbound: number;
  outbound: number;
  optIns: number;
}

interface MetaStatus {
  connected: boolean;
  facebook: boolean;
  instagram: boolean;
  checkedAt: string | null;
}

const shouldSync = (key: string): boolean => {
  const raw = localStorage.getItem(key);
  const last = raw ? Number(raw) : 0;
  const now = Date.now();
  return !last || now - last > SYNC_INTERVAL_MS;
};

const getLastSync = (key: string): string | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const timestamp = Number(raw);
  return new Date(timestamp).toLocaleString();
};

export default function FanPulse() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');
  const [campaigns, setCampaigns] = useState<CampaignCache[]>([]);
  const [dmMetrics, setDmMetrics] = useState<DMMetrics>({ inbound: 0, outbound: 0, optIns: 0 });
  const [metaStatus, setMetaStatus] = useState<MetaStatus>({
    connected: false,
    facebook: false,
    instagram: false,
    checkedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [checkingMeta, setCheckingMeta] = useState(false);
  const [hasEventsTables, setHasEventsTables] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
      runHourlySync();
    }
  }, [user, timeRange]);

  const runHourlySync = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (shouldSync(MC_SYNC_KEY)) {
        const res = await fetch('/.netlify/functions/mailchimp-sync', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          localStorage.setItem(MC_SYNC_KEY, String(Date.now()));
          console.log('[FanPulse] Auto-synced Mailchimp');
        }
      }

      if (shouldSync(META_SYNC_KEY)) {
        const res = await fetch('/.netlify/functions/meta-pulse-health', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          const result = await res.json();
          localStorage.setItem(META_SYNC_KEY, String(Date.now()));
          setMetaStatus({
            connected: result.status === 'connected',
            facebook: result.platforms?.facebook || false,
            instagram: result.platforms?.instagram || false,
            checkedAt: result.checked_at || null,
          });
          console.log('[FanPulse] Auto-checked Meta health');
        }
      }
    } catch (e) {
      console.warn('[FanPulse] Hourly sync skipped:', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCampaigns(),
        loadDmMetrics(),
        loadMetaStatus(),
      ]);
    } catch (error) {
      console.error('[FanPulse] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCampaigns = async () => {
    try {
      const daysAgo = timeRange === '7d' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { data, error } = await supabase
        .from('mailchimp_campaign_cache')
        .select('*')
        .eq('owner_user_id', user!.id)
        .gte('send_time', startDate.toISOString())
        .order('send_time', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[FanPulse] Error loading campaigns:', error);
        return;
      }

      setCampaigns(data || []);
    } catch (error) {
      console.error('[FanPulse] Error loading campaigns:', error);
    }
  };

  const loadDmMetrics = async () => {
    try {
      const daysAgo = timeRange === '7d' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { count: inboundCount, error: inboundError } = await supabase
        .from('fan_comms_events')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id)
        .eq('source', 'dm')
        .eq('event_type', 'inbound')
        .gte('event_ts', startDate.toISOString());

      const { count: outboundCount, error: outboundError } = await supabase
        .from('fan_comms_events')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id)
        .eq('source', 'dm')
        .eq('event_type', 'sent')
        .gte('event_ts', startDate.toISOString());

      const { count: optInsCount, error: optInsError } = await supabase
        .from('fan_dm_opt_ins')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', user!.id)
        .gte('granted_at', startDate.toISOString());

      if (inboundError || outboundError) {
        const { count: fallbackInbound } = await supabase
          .from('fan_dm_messages')
          .select('*', { count: 'exact', head: true })
          .eq('owner_user_id', user!.id)
          .eq('direction', 'inbound')
          .gte('sent_at', startDate.toISOString());

        const { count: fallbackOutbound } = await supabase
          .from('fan_dm_messages')
          .select('*', { count: 'exact', head: true })
          .eq('owner_user_id', user!.id)
          .eq('direction', 'outbound')
          .gte('sent_at', startDate.toISOString());

        setDmMetrics({
          inbound: fallbackInbound || 0,
          outbound: fallbackOutbound || 0,
          optIns: optInsCount || 0,
        });
        setHasEventsTables(false);
        return;
      }

      setDmMetrics({
        inbound: inboundCount || 0,
        outbound: outboundCount || 0,
        optIns: optInsCount || 0,
      });
      setHasEventsTables(true);
    } catch (error: any) {
      console.log('[FanPulse] DM tables not available yet');
      setHasEventsTables(false);
    }
  };

  const loadMetaStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/.netlify/functions/meta-pulse-health', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setMetaStatus({
          connected: result.status === 'connected',
          facebook: result.platforms?.facebook || false,
          instagram: result.platforms?.instagram || false,
          checkedAt: result.checked_at || null,
        });
      }
    } catch (error) {
      console.error('[FanPulse] Error checking Meta status:', error);
    }
  };

  const handleSyncMailchimp = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please log in to sync', 'error');
        return;
      }

      const response = await fetch('/.netlify/functions/mailchimp-sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        if (result.error === 'MAILCHIMP_NOT_CONNECTED') {
          showToast('Connect Mailchimp in Profile to sync campaigns', 'error');
        } else {
          showToast(result.message || 'Failed to sync', 'error');
        }
        return;
      }

      localStorage.setItem(MC_SYNC_KEY, String(Date.now()));
      showToast(`Synced ${result.campaigns} campaigns`, 'success');
      await loadCampaigns();
    } catch (error: any) {
      console.error('[FanPulse] Sync error:', error);
      showToast('Failed to sync campaigns', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckMeta = async () => {
    setCheckingMeta(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please log in', 'error');
        return;
      }

      const response = await fetch('/.netlify/functions/meta-pulse-health', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        showToast('Failed to check Meta status', 'error');
        return;
      }

      const result = await response.json();
      localStorage.setItem(META_SYNC_KEY, String(Date.now()));
      setMetaStatus({
        connected: result.status === 'connected',
        facebook: result.platforms?.facebook || false,
        instagram: result.platforms?.instagram || false,
        checkedAt: result.checked_at || null,
      });
      showToast('Meta status updated', 'success');
    } catch (error: any) {
      console.error('[FanPulse] Meta check error:', error);
      showToast('Failed to check Meta status', 'error');
    } finally {
      setCheckingMeta(false);
    }
  };

  const calculateTotals = () => {
    const emailsSent = campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0);
    const uniqueOpens = campaigns.reduce((sum, c) => sum + (c.unique_opens || 0), 0);
    const uniqueClicks = campaigns.reduce((sum, c) => sum + (c.unique_clicks || 0), 0);
    const unsubs = campaigns.reduce((sum, c) => sum + (c.unsubscribes || 0), 0);
    const bounces = campaigns.reduce((sum, c) => sum + (c.bounces || 0), 0);

    const openRate = emailsSent > 0 ? (uniqueOpens / emailsSent) * 100 : 0;
    const clickRate = emailsSent > 0 ? (uniqueClicks / emailsSent) * 100 : 0;

    return { emailsSent, uniqueOpens, uniqueClicks, unsubs, bounces, openRate, clickRate };
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Fan Pulse</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                timeRange === '7d'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                timeRange === '30d'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              30 Days
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800/50 rounded-lg">
            {metaStatus.connected ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <X className="w-4 h-4 text-gray-500" />
            )}
            <span className="text-xs text-gray-400">Meta: {metaStatus.connected ? 'Connected' : 'Not connected'}</span>
          </div>
          <button
            onClick={handleCheckMeta}
            disabled={checkingMeta}
            className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${checkingMeta ? 'animate-spin' : ''}`} />
            Check Meta
          </button>
          <button
            onClick={handleSyncMailchimp}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Mailchimp
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {getLastSync(MC_SYNC_KEY) && (
          <div>Mailchimp synced: {getLastSync(MC_SYNC_KEY)}</div>
        )}
        {getLastSync(META_SYNC_KEY) && (
          <div>Meta checked: {getLastSync(META_SYNC_KEY)}</div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {hasEventsTables && (
          <>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <MessageSquare className="w-4 h-4" />
                <span>DM Inbound</span>
              </div>
              <div className="text-3xl font-bold text-white">{dmMetrics.inbound}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <MessageSquare className="w-4 h-4" />
                <span>DM Sent</span>
              </div>
              <div className="text-3xl font-bold text-white">{dmMetrics.outbound}</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                <Users className="w-4 h-4" />
                <span>Opt-ins</span>
              </div>
              <div className="text-3xl font-bold text-white">{dmMetrics.optIns}</div>
            </div>
          </>
        )}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <Mail className="w-4 h-4" />
            <span>Emails Sent</span>
          </div>
          <div className="text-3xl font-bold text-white">{totals.emailsSent.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <TrendingUp className="w-4 h-4" />
            <span>Open Rate</span>
          </div>
          <div className="text-3xl font-bold text-white">{totals.openRate.toFixed(1)}%</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <TrendingUp className="w-4 h-4" />
            <span>Click Rate</span>
          </div>
          <div className="text-3xl font-bold text-white">{totals.clickRate.toFixed(1)}%</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <AlertCircle className="w-4 h-4" />
            <span>Unsubs + Bounces</span>
          </div>
          <div className="text-3xl font-bold text-white">{(totals.unsubs + totals.bounces).toLocaleString()}</div>
        </div>
      </div>

      {!hasEventsTables && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-blue-200 text-sm">
          DM tracking not enabled yet. Email metrics are available.
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-gray-800/50 rounded-lg p-8 text-center">
          <Mail className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">No campaigns synced yet</p>
          <button
            onClick={handleSyncMailchimp}
            disabled={syncing}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Sync Mailchimp
          </button>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Top Campaigns</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Campaign</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Sent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Opens</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Clicks</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Unsubs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {campaigns.map((campaign) => {
                  const openRate = campaign.emails_sent && campaign.emails_sent > 0
                    ? ((campaign.unique_opens || 0) / campaign.emails_sent * 100).toFixed(1)
                    : '0.0';
                  const clickRate = campaign.emails_sent && campaign.emails_sent > 0
                    ? ((campaign.unique_clicks || 0) / campaign.emails_sent * 100).toFixed(1)
                    : '0.0';

                  return (
                    <tr key={campaign.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {campaign.title || campaign.subject_line || 'Untitled'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {campaign.send_time ? new Date(campaign.send_time).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {(campaign.emails_sent || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {(campaign.unique_opens || 0).toLocaleString()} ({openRate}%)
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {(campaign.unique_clicks || 0).toLocaleString()} ({clickRate}%)
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {(campaign.unsubscribes || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
