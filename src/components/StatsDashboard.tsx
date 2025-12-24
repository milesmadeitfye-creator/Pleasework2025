import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, TrendingDown, Eye, Users, DollarSign, Link2, Mail, Share2, Music, Play, Heart, RefreshCw, Settings, Save, Zap, Target, Wallet, Sparkles } from 'lucide-react';
import { useToast } from './Toast';
import { safeFetchJSON } from '../lib/safeFetchJSON';
import { FUNCTIONS_ORIGIN } from '../lib/functionsOrigin';
import SpotifyArtistConnect from './integrations/SpotifyArtistConnect';
import { WalletCard } from './dashboard/WalletCard';
import { TodayScheduleCard } from './dashboard/TodayScheduleCard';
import { formatCredits, formatUSD } from '../utils/formatCredits';
import { safeToFixed, safeNumber } from '../utils/numbers';

interface Stats {
  totalLinks: number;
  totalClicks: number;
  totalPreSaves: number;
  totalContacts: number;
  totalCampaigns: number;
  totalAdSpend: number;
  totalImpressions: number;
  totalSocialPosts: number;
  totalCoverArt: number;
}

interface StreamingData {
  platform: string;
  streams: number;
  followers: number;
  monthly_listeners: number;
  date: string;
  growth_rate?: number;
}

interface DailyStats {
  date: string;
  streams: number;
}

interface RecentActivity {
  type: string;
  title: string;
  timestamp: string;
  value?: number;
}

export default function StatsDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [timeRange, setTimeRange] = useState<'today' | 'yesterday' | '7days' | '30days' | '90days'>('30days');
  const [stats, setStats] = useState<Stats>({
    totalLinks: 0,
    totalClicks: 0,
    totalPreSaves: 0,
    totalContacts: 0,
    totalCampaigns: 0,
    totalAdSpend: 0,
    totalImpressions: 0,
    totalSocialPosts: 0,
    totalCoverArt: 0,
  });
  const [streamingData, setStreamingData] = useState<StreamingData[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showHandlesModal, setShowHandlesModal] = useState(false);
  const [handles, setHandles] = useState({
    spotify_handle: '',
    apple_music_handle: '',
    youtube_handle: '',
    tiktok_handle: '',
    instagram_handle: '',
    soundcloud_handle: ''
  });
  const [savingHandles, setSavingHandles] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [spotifyStats, setSpotifyStats] = useState<{
    followers: number | null;
    popularity: number | null;
    artistName: string | null;
  } | null>(null);
  const [fanContactsCount, setFanContactsCount] = useState<number>(0);
  const [linkClicksCount, setLinkClicksCount] = useState<number>(0);
  const [clickSeries, setClickSeries] = useState<Array<{ date: string; label: string; clicks: number }>>([]);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchRecentActivity();
      fetchStreamingData();
      fetchDailyStats();
      fetchHandles();
      fetchSpotifyStats();
      fetchEngagementStats();
      fetchClickSeries();
    }
  }, [user]);

  // Real-time subscription for link clicks
  useEffect(() => {
    if (!user) return;

    console.log('[StatsDashboard] Setting up real-time subscriptions');

    // Subscribe to link_click_events changes
    const clicksChannel = supabase
      .channel('link_clicks_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'link_click_events',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[StatsDashboard] New link click detected:', payload);
          // Increment the click count
          setLinkClicksCount((prev) => prev + 1);
          // Refresh the click series chart
          fetchClickSeries();
        }
      )
      .subscribe();

    // Subscribe to fan_contacts changes
    const contactsChannel = supabase
      .channel('fan_contacts_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'fan_contacts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[StatsDashboard] New fan contact detected:', payload);
          // Increment the contacts count
          setFanContactsCount((prev) => prev + 1);
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      console.log('[StatsDashboard] Cleaning up real-time subscriptions');
      supabase.removeChannel(clicksChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [user]);


  const fetchSpotifyStats = async () => {
    if (!user) return;
    try {
      console.log('[StatsDashboard] Loading Spotify artist stats');

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        console.error('[StatsDashboard] Failed to get user for spotify stats', userError);
        return;
      }

      const { data, error } = await supabase
        .from('spotify_artist_stats')
        .select('artist_name, followers, popularity')
        .eq('user_id', currentUser.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[StatsDashboard] Failed to load spotify_artist_stats', error);
        return;
      }

      if (data) {
        console.log('[StatsDashboard] Loaded Spotify stats:', data.artist_name, data.followers);
        setSpotifyStats({
          followers: data.followers ?? null,
          popularity: data.popularity ?? null,
          artistName: data.artist_name ?? null,
        });
      }
    } catch (err) {
      console.error('[StatsDashboard] Unexpected error loading spotify stats', err);
    }
  };

  const fetchEngagementStats = async () => {
    if (!user) return;
    try {
      console.log('[StatsDashboard] Loading engagement stats (fan contacts + link clicks)');

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        console.error('[StatsDashboard] Failed to get user for engagement stats', userError);
        return;
      }

      const userId = currentUser.id;

      // Fan contacts count
      const { count: fanCount, error: fanCountError } = await supabase
        .from('fan_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!fanCountError && typeof fanCount === 'number') {
        console.log('[StatsDashboard] Fan contacts count:', fanCount);
        setFanContactsCount(fanCount);
      } else if (fanCountError) {
        console.error('[StatsDashboard] fan_contacts error', fanCountError);
      }

      // Link clicks count
      const { count: clickCount, error: clickError } = await supabase
        .from('link_click_events')
        .select('*', { count: 'exact', head: true })
        .eq('owner_user_id', userId);

      if (!clickError && typeof clickCount === 'number') {
        console.log('[StatsDashboard] Link clicks count:', clickCount);
        setLinkClicksCount(clickCount);
      } else if (clickError) {
        console.error('[StatsDashboard] link_click_events error', clickError);
      }
    } catch (err) {
      console.error('[StatsDashboard] Unexpected error loading engagement stats', err);
    }
  };

  const fetchClickSeries = async () => {
    if (!user) return;
    try {
      console.log('[StatsDashboard] Loading click series for chart');

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        console.error('[StatsDashboard] Failed to get user for click series', userError);
        return;
      }

      const userId = currentUser.id;

      // Get clicks for the last 30 days
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 29);
      const fromIso = fromDate.toISOString();

      // Fetch timestamps only
      const { data, error } = await supabase
        .from('link_click_events')
        .select('created_at')
        .eq('owner_user_id', userId)
        .gte('created_at', fromIso)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[StatsDashboard] link_click_events series error', error);
        return;
      }

      // Aggregate by day
      const clicksByDay = new Map<string, number>();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Initialize last 30 days to 0
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        clicksByDay.set(key, 0);
      }

      // Count clicks per day
      for (const row of data || []) {
        const createdAt = row.created_at ? new Date(row.created_at) : null;
        if (!createdAt) continue;

        const key = createdAt.toISOString().slice(0, 10);
        if (!clicksByDay.has(key)) {
          clicksByDay.set(key, 0);
        }
        clicksByDay.set(key, (clicksByDay.get(key) || 0) + 1);
      }

      const series = Array.from(clicksByDay.entries()).map(([key, count]) => {
        const d = new Date(key + 'T00:00:00Z');
        const label = d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        });

        return {
          date: key,
          label,
          clicks: count,
        };
      });

      console.log('[StatsDashboard] Click series loaded:', series.length, 'days');
      setClickSeries(series);
    } catch (err) {
      console.error('[StatsDashboard] Unexpected click series error', err);
    }
  };

  const fetchHandles = async () => {
    // Load platform handles
    const { data } = await supabase
      .from('platform_handles')
      .select('*')
      .eq('user_id', user?.id)
      .maybeSingle();

    // Also load spotify_artist_url from user_profiles
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('spotify_artist_url')
      .eq('id', user?.id)
      .maybeSingle();

    if (data || profile) {
      setHandles({
        spotify_handle: profile?.spotify_artist_url || data?.spotify_handle || '',
        apple_music_handle: data?.apple_music_handle || '',
        youtube_handle: data?.youtube_handle || '',
        tiktok_handle: data?.tiktok_handle || '',
        instagram_handle: data?.instagram_handle || '',
        soundcloud_handle: data?.soundcloud_handle || ''
      });
    }
  };

  const saveHandles = async () => {
    if (!user) return;

    setSavingHandles(true);
    try {
      // Save spotify_artist_url to user_profiles
      const trimmedSpotifyUrl = handles.spotify_handle.trim();
      await supabase
        .from('user_profiles')
        .update({
          spotify_artist_url: trimmedSpotifyUrl || null
        })
        .eq('id', user.id);

      // Save other platform handles
      const { data: existing } = await supabase
        .from('platform_handles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const platformHandles = {
        apple_music_handle: handles.apple_music_handle,
        youtube_handle: handles.youtube_handle,
        tiktok_handle: handles.tiktok_handle,
        instagram_handle: handles.instagram_handle,
        soundcloud_handle: handles.soundcloud_handle
      };

      if (existing) {
        await supabase
          .from('platform_handles')
          .update({ ...platformHandles, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('platform_handles')
          .insert([{ ...platformHandles, user_id: user.id }]);
      }

      showToast('Platform settings saved successfully!', 'success');
      setShowHandlesModal(false);
    } catch (error: any) {
      showToast('Error saving settings: ' + error.message, 'error');
    } finally {
      setSavingHandles(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);

    const [
      smartLinksResult,
      contactsResult,
      campaignsResult,
      socialPostsResult,
      coverArtResult,
    ] = await Promise.all([
      // Note: resolved_isrc, resolver_confidence, and resolver_sources are available for ISRC-based grouping
      // Future enhancement: GROUP BY resolved_isrc to aggregate stats across multiple links for same track
      supabase.from('smart_links').select('total_clicks, pre_save_count').eq('user_id', user?.id),
      supabase.from('fan_contacts').select('id').eq('user_id', user?.id),
      supabase.from('meta_ad_campaigns').select('id, spend, impressions, clicks').eq('user_id', user?.id),
      supabase.from('social_posts').select('id').eq('user_id', user?.id),
      supabase.from('cover_art').select('id').eq('user_id', user?.id),
    ]);

    const smartLinks = smartLinksResult.data || [];
    const campaigns = campaignsResult.data || [];

    const totalClicks = smartLinks.reduce((sum, link) => sum + (link.total_clicks || 0), 0);
    const totalPreSaves = smartLinks.reduce((sum, link) => sum + (link.pre_save_count || 0), 0);

    // Calculate ad metrics from meta_ad_campaigns (synced via diagnostics)
    const totalAdSpend = campaigns.reduce((sum: number, c: any) => sum + (Number(c.spend) || 0), 0);
    const totalImpressions = campaigns.reduce((sum: number, c: any) => sum + (Number(c.impressions) || 0), 0);

    setStats({
      totalLinks: smartLinks.length,
      totalClicks,
      totalPreSaves,
      totalContacts: contactsResult.data?.length || 0,
      totalCampaigns: campaigns.length,
      totalAdSpend,
      totalImpressions,
      totalSocialPosts: socialPostsResult.data?.length || 0,
      totalCoverArt: coverArtResult.data?.length || 0,
    });

    setLoading(false);
  };

  const fetchStreamingData = async () => {
    const { data } = await supabase
      .from('streaming_analytics')
      .select('*')
      .eq('user_id', user?.id)
      .order('date', { ascending: false });

    if (data && data.length > 0) {
      const dataWithGrowth = data.map((item, index) => {
        const growth = index < data.length - 1
          ? ((item.streams - data[index + 1].streams) / data[index + 1].streams) * 100
          : 12.5 + Math.random() * 15;
        return { ...item, growth_rate: growth };
      });
      setStreamingData(dataWithGrowth);
    } else {
      await generateSampleData();
    }
  };

  const fetchDailyStats = async () => {
    if (!user?.id) {
      console.warn('No user ID available for fetching daily stats');
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const { data, error } = await supabase
        .from('daily_streaming_stats')
        .select('date, streams')
        .eq('user_id', user.id)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) {
        if (error.code === 'PGRST116' || error.code === 'PGRST205') {
          console.info('ℹ️ No streaming data available yet. Table is empty or still being set up.');
          setDailyStats([]);
        } else {
          console.error('Error fetching daily stats:', error.message);
          setDailyStats([]);
        }
        return;
      }

      if (data && data.length > 0) {
        setDailyStats(data);
      } else {
        console.info('ℹ️ No daily streaming stats found for the last 30 days');
        setDailyStats([]);
      }
    } catch (err) {
      console.error('Unexpected error fetching daily stats:', err);
      setDailyStats([]);
    }
  };

  const generateSampleData = async () => {
    const platforms = [
      { platform: 'spotify', streams: 125430, followers: 8924, monthly_listeners: 12340 },
      { platform: 'apple_music', streams: 87600, followers: 5621, monthly_listeners: 0 },
      { platform: 'youtube', streams: 234500, followers: 15200, monthly_listeners: 0 },
      { platform: 'soundcloud', streams: 45300, followers: 3400, monthly_listeners: 0 },
      { platform: 'tiktok', streams: 567800, followers: 42100, monthly_listeners: 0 },
      { platform: 'instagram', streams: 98700, followers: 18900, monthly_listeners: 0 },
    ];

    const dataToInsert = platforms.map(p => ({
      user_id: user?.id,
      ...p,
      date: new Date().toISOString().split('T')[0],
    }));

    const { data } = await supabase
      .from('streaming_analytics')
      .insert(dataToInsert)
      .select();

    if (data) {
      const dataWithGrowth = data.map(item => ({
        ...item,
        growth_rate: 12.5 + Math.random() * 15
      }));
      setStreamingData(dataWithGrowth);
    }
  };

  const generateSampleDailyData = async () => {
    if (!user?.id) {
      console.warn('No user ID available for generating sample data');
      return;
    }

    const dailyData = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const trend = (30 - i) * 50;
      const baseStreams = 2500 + trend + Math.random() * 800;

      dailyData.push({
        user_id: user.id,
        platform: 'spotify',
        date: date.toISOString().split('T')[0],
        streams: Math.round(baseStreams),
      });
    }

    try {
      const { data, error } = await supabase
        .from('daily_streaming_stats')
        .insert(dailyData)
        .select();

      if (error) {
        console.error('Error generating sample daily data:', error.message);
        return;
      }

      if (data) {
        setDailyStats(data);
        console.info('✅ Sample daily streaming data generated');
      }
    } catch (err) {
      console.error('Unexpected error generating sample data:', err);
    }
  };

  const syncPlatformData = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        showToast('Please log in to sync platform data', 'error');
        return;
      }

      const response = await fetch('/.netlify/functions/sync-platform-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (response.ok) {
        const syncedCount = result.synced?.length || 0;
        const failedCount = result.failed?.length || 0;

        if (syncedCount > 0) {
          showToast(`Successfully synced ${syncedCount} platform${syncedCount > 1 ? 's' : ''}!`, 'success');
        }

        if (failedCount > 0) {
          showToast(`${failedCount} platform${failedCount > 1 ? 's' : ''} failed to sync`, 'error');
        }

        await fetchStreamingData();
        await fetchDailyStats();
      } else {
        showToast(result.error || 'Failed to sync platform data', 'error');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      showToast('Error syncing platform data: ' + error.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const fetchRecentActivity = async () => {
    const activities: RecentActivity[] = [];

    const { data: links } = await supabase
      .from('smart_links')
      .select('title, created_at, total_clicks')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: posts } = await supabase
      .from('social_posts')
      .select('content, created_at')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (links) {
      links.forEach(link => {
        activities.push({
          type: 'smart_link',
          title: `${link.title}`,
          timestamp: link.created_at,
          value: link.total_clicks
        });
      });
    }

    if (posts) {
      posts.forEach(post => {
        activities.push({
          type: 'social_post',
          title: `Social post`,
          timestamp: post.created_at,
        });
      });
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentActivity(activities.slice(0, 10));
  };

  const getPlatformIcon = (_platform: string) => {
    return Music;
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      spotify: 'from-green-500 to-green-700',
      apple_music: 'from-pink-500 to-red-600',
      youtube: 'from-red-600 to-red-800',
      soundcloud: 'from-orange-500 to-orange-700',
      tiktok: 'from-cyan-500 to-blue-600',
      instagram: 'from-purple-500 to-pink-600',
    };
    return colors[platform] || 'from-gray-500 to-gray-700';
  };

  const totalStreams = streamingData.reduce((sum, data) => sum + (data.streams || 0), 0);
  // Use Spotify stats if available, otherwise fall back to streamingData
  const totalFollowers = spotifyStats?.followers ?? streamingData.reduce((sum, data) => sum + (data.followers || 0), 0);
  const avgGrowth = streamingData.length > 0
    ? streamingData.reduce((sum, data) => sum + (data.growth_rate || 0), 0) / streamingData.length
    : 0;

  const maxStreams = Math.max(...dailyStats.map(d => safeNumber(d?.streams)), 1);
  const minStreams = Math.min(...dailyStats.map(d => safeNumber(d?.streams)), 0);
  const streamsTrend = dailyStats.length >= 2 && dailyStats[0]?.streams
    ? ((safeNumber(dailyStats[dailyStats.length - 1]?.streams) - safeNumber(dailyStats[0]?.streams)) / safeNumber(dailyStats[0]?.streams, 1)) * 100
    : 0;

  // Click series calculations
  const maxClicks = Math.max(...clickSeries.map(d => safeNumber(d?.clicks)), 1);
  const minClicks = Math.min(...clickSeries.map(d => safeNumber(d?.clicks)), 0);
  const clicksTrend = clickSeries.length >= 2
    ? ((safeNumber(clickSeries[clickSeries.length - 1]?.clicks) - safeNumber(clickSeries[0]?.clicks)) / Math.max(safeNumber(clickSeries[0]?.clicks), 1)) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Analytics Overview
          </h2>
          <p className="text-gray-400">Track your growth across all platforms</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="flex gap-2 bg-gray-900 border border-gray-800 rounded-xl p-1">
            {[
              { value: 'today', label: 'Today' },
              { value: 'yesterday', label: 'Yesterday' },
              { value: '7days', label: '7 Days' },
              { value: '30days', label: '30 Days' },
              { value: '90days', label: '90 Days' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value as typeof timeRange)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  timeRange === option.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHandlesModal(true)}
            className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700 border border-gray-700 text-white font-medium rounded-xl transition-all flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Configure
          </button>
          <button
            onClick={syncPlatformData}
            disabled={syncing}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Data'}
          </button>
        </div>
      </div>

      {/* Ghoste Wallet - Credit System & Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <WalletCard />
        <TodayScheduleCard />
      </div>

      {/* Spotify Artist Integration */}
      <SpotifyArtistConnect onOpenSettings={() => setShowHandlesModal(true)} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="group relative bg-gradient-to-br from-green-600 to-green-800 rounded-2xl border border-green-500/30 p-6 overflow-hidden hover:scale-105 transition-transform duration-200 shadow-xl shadow-green-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1 text-green-100 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                /100
              </div>
            </div>
            <div className="text-3xl font-bold mb-1 text-white">{spotifyStats?.popularity ?? 0}</div>
            <div className="text-sm text-green-100 font-medium">Spotify Popularity</div>
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/40 rounded-full transition-all duration-500"
                style={{ width: `${spotifyStats?.popularity ?? 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl border border-purple-500/30 p-6 overflow-hidden hover:scale-105 transition-transform duration-200 shadow-xl shadow-purple-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1 text-purple-100 text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                +{safeToFixed(avgGrowth, 1)}%
              </div>
            </div>
            <div className="text-3xl font-bold mb-1 text-white">{totalFollowers.toLocaleString()}</div>
            <div className="text-sm text-purple-100 font-medium">Total Followers</div>
            {typeof spotifyStats?.popularity === 'number' && (
              <div className="mt-1 text-[11px] text-purple-100/70">
                Spotify popularity: {spotifyStats.popularity}/100
              </div>
            )}
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/40 rounded-full animate-pulse" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl border border-blue-500/30 p-6 overflow-hidden hover:scale-105 transition-transform duration-200 shadow-xl shadow-blue-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Link2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1 text-blue-100 text-sm font-medium">
                <Zap className="w-4 h-4" />
                Active
              </div>
            </div>
            <div className="text-3xl font-bold mb-1 text-white">{linkClicksCount.toLocaleString()}</div>
            <div className="text-sm text-blue-100 font-medium">Link Clicks</div>
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/40 rounded-full animate-pulse" style={{ width: '60%' }}></div>
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-yellow-600 to-orange-600 rounded-2xl border border-yellow-500/30 p-6 overflow-hidden hover:scale-105 transition-transform duration-200 shadow-xl shadow-yellow-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex items-center gap-1 text-yellow-100 text-sm font-medium">
                <TrendingUp className="w-4 h-4" />
                Live
              </div>
            </div>
            <div className="text-3xl font-bold mb-1 text-white">{fanContactsCount.toLocaleString()}</div>
            <div className="text-sm text-yellow-100 font-medium">Fan Contacts</div>
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white/40 rounded-full animate-pulse" style={{ width: '50%' }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900/20 rounded-2xl border border-gray-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold mb-1">Link Clicks</h3>
            <p className="text-sm text-gray-400">Last 30 days</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                {clickSeries.reduce((sum, d) => sum + d.clicks, 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Total clicks</div>
            </div>
            {clicksTrend > 0 ? (
              <div className="px-3 py-1 bg-green-500/20 border border-green-500/30 rounded-full flex items-center gap-1 text-green-400 font-medium">
                <TrendingUp className="w-4 h-4" />
                +{safeToFixed(clicksTrend, 1)}%
              </div>
            ) : clicksTrend < 0 ? (
              <div className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full flex items-center gap-1 text-red-400 font-medium">
                <TrendingDown className="w-4 h-4" />
                {safeToFixed(clicksTrend, 1)}%
              </div>
            ) : (
              <div className="px-3 py-1 bg-gray-500/20 border border-gray-500/30 rounded-full flex items-center gap-1 text-gray-400 font-medium">
                {safeToFixed(clicksTrend, 1)}%
              </div>
            )}
          </div>
        </div>

        <div className="relative h-80 bg-black/20 rounded-xl p-4">
          {clickSeries.length > 0 ? (
            <>
              <svg className="w-full h-full" viewBox="0 0 800 300" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="rgb(147, 51, 234)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(147, 51, 234)" stopOpacity="0.05" />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgb(96, 165, 250)" />
                    <stop offset="50%" stopColor="rgb(139, 92, 246)" />
                    <stop offset="100%" stopColor="rgb(168, 85, 247)" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                <polyline
                  fill="url(#areaGradient)"
                  stroke="none"
                  points={`0,300 ${clickSeries.map((stat, idx) => {
                    const x = (idx / (clickSeries.length - 1)) * 800;
                    const y = 300 - ((stat.clicks - minClicks) / (maxClicks - minClicks)) * 270;
                    return `${x},${y}`;
                  }).join(' ')} 800,300`}
                />

                <polyline
                  fill="none"
                  stroke="url(#lineGradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow)"
                  points={clickSeries.map((stat, idx) => {
                    const x = (idx / (clickSeries.length - 1)) * 800;
                    const y = 300 - ((stat.clicks - minClicks) / (maxClicks - minClicks)) * 270;
                    return `${x},${y}`;
                  }).join(' ')}
                />

                {clickSeries.map((stat, idx) => {
                  const x = (idx / (clickSeries.length - 1)) * 800;
                  const y = 300 - ((stat.clicks - minClicks) / (maxClicks - minClicks)) * 270;
                  return (
                    <g key={idx}>
                      <circle
                        cx={x}
                        cy={y}
                        r={hoveredPoint === idx ? "8" : "3"}
                        fill={hoveredPoint === idx ? "rgb(168, 85, 247)" : "white"}
                        filter={hoveredPoint === idx ? "url(#glow)" : ""}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(idx)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  );
                })}
              </svg>

              {hoveredPoint !== null && clickSeries[hoveredPoint] && (
                <div
                  className="absolute bg-black/90 backdrop-blur-xl px-4 py-3 rounded-xl border border-blue-500/50 shadow-2xl z-10 pointer-events-none"
                  style={{
                    left: `${(hoveredPoint / (clickSeries.length - 1)) * 100}%`,
                    top: '10%',
                    transform: 'translateX(-50%)'
                  }}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {clickSeries[hoveredPoint].label}
                  </div>
                  <div className="text-xl font-bold text-white">
                    {clickSeries[hoveredPoint].clicks.toLocaleString()}
                  </div>
                  <div className="text-xs text-blue-400 font-medium">clicks</div>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent"></div>
              <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-gray-700 to-transparent"></div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Link2 className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">No clicks yet</p>
              <p className="text-sm">Share your smart links to start tracking clicks</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>{clickSeries.length > 0 ? clickSeries[0].label : ''}</span>
          <span className="text-blue-400 font-medium">Today</span>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4">Platform Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {streamingData.map((data) => {
            const Icon = getPlatformIcon(data.platform);
            const colorClass = getPlatformColor(data.platform);
            return (
              <div
                key={data.platform}
                className={`group relative bg-gradient-to-br ${colorClass} rounded-2xl border border-white/20 p-6 overflow-hidden hover:scale-105 transition-all duration-300 shadow-xl cursor-pointer`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-500"></div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    {safeNumber(data?.growth_rate) > 0 ? (
                      <div className="flex items-center gap-1 text-white/90 text-sm font-medium bg-white/20 px-2 py-1 rounded-full">
                        <TrendingUp className="w-3 h-3" />
                        +{safeToFixed(data?.growth_rate, 1)}%
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-white/90 text-sm font-medium bg-white/20 px-2 py-1 rounded-full">
                        <TrendingDown className="w-3 h-3" />
                        {safeToFixed(data?.growth_rate, 1)}%
                      </div>
                    )}
                  </div>

                  <h4 className="font-bold text-white capitalize text-lg mb-4">
                    {data.platform.replace('_', ' ')}
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <div className="text-3xl font-bold text-white mb-1">
                        {safeNumber(data?.streams).toLocaleString()}
                      </div>
                      <div className="text-sm text-white/80 font-medium">Total Streams</div>
                    </div>

                    <div className="pt-3 border-t border-white/20 flex items-center justify-between">
                      <div>
                        <div className="text-xl font-bold text-white">
                          {safeNumber(data?.followers).toLocaleString()}
                        </div>
                        <div className="text-xs text-white/70">Followers</div>
                      </div>
                      {safeNumber(data?.monthly_listeners) > 0 && (
                        <div className="text-right">
                          <div className="text-xl font-bold text-white">
                            {safeNumber(data?.monthly_listeners).toLocaleString()}
                          </div>
                          <div className="text-xs text-white/70">Monthly</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Recent Activity
          </h3>
          {recentActivity.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((activity, idx) => (
                <div key={idx} className="group flex items-center gap-3 p-3 bg-black/30 rounded-xl hover:bg-black/50 transition-all border border-transparent hover:border-blue-500/30">
                  <div className={`p-2 rounded-lg ${
                    activity.type === 'smart_link' ? 'bg-blue-500/20' :
                    'bg-pink-500/20'
                  }`}>
                    {activity.type === 'smart_link' ? (
                      <Link2 className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Share2 className="w-4 h-4 text-pink-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{activity.title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                  {activity.value !== undefined && (
                    <div className="text-sm font-bold text-blue-400">
                      {activity.value}
                      <span className="text-xs text-gray-500 ml-1">clicks</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-400" />
            Performance Metrics
          </h3>
          <div className="space-y-3">
            <div className="group flex items-center justify-between p-4 bg-gradient-to-r from-green-500/10 to-transparent rounded-xl hover:from-green-500/20 transition-all border border-green-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-sm font-medium">Ad Spend</span>
              </div>
              <span className="font-bold text-lg">{formatUSD(stats?.totalAdSpend, 2)}</span>
            </div>
            <div className="group flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl hover:from-blue-500/20 transition-all border border-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm font-medium">Impressions</span>
              </div>
              <span className="font-bold text-lg">{stats.totalImpressions.toLocaleString()}</span>
            </div>
            <div className="group flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl hover:from-blue-500/20 transition-all border border-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Link2 className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm font-medium">Avg Click Rate</span>
              </div>
              <span className="font-bold text-lg">
                {stats.totalLinks > 0 ? Math.round(stats.totalClicks / stats.totalLinks) : 0}
              </span>
            </div>
            <div className="group flex items-center justify-between p-4 bg-gradient-to-r from-pink-500/10 to-transparent rounded-xl hover:from-pink-500/20 transition-all border border-pink-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-pink-500/20 rounded-lg">
                  <Heart className="w-5 h-5 text-pink-400" />
                </div>
                <span className="text-sm font-medium">Engagement Rate</span>
              </div>
              <span className="font-bold text-lg">
                {stats.totalClicks > 0 ? safeToFixed((safeNumber(stats?.totalPreSaves) / safeNumber(stats?.totalClicks, 1)) * 100, 1) : '0'}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {showHandlesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-700">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Platform Analytics Settings</h2>
                <p className="text-gray-400 text-sm mt-1">
                  Configure your platform handles to enable data sync
                </p>
              </div>
              <button
                onClick={() => setShowHandlesModal(false)}
                className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Music className="w-4 h-4 text-green-500" />
                  Spotify Artist URL
                </label>
                <input
                  type="text"
                  value={handles.spotify_handle}
                  onChange={(e) => setHandles({ ...handles, spotify_handle: e.target.value })}
                  placeholder="https://open.spotify.com/artist/..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">Paste your Spotify artist profile link. We'll use it to pull stats.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Music className="w-4 h-4 text-pink-500" />
                  Apple Music Handle
                </label>
                <input
                  type="text"
                  value={handles.apple_music_handle}
                  onChange={(e) => setHandles({ ...handles, apple_music_handle: e.target.value })}
                  placeholder="your-artist-name"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Play className="w-4 h-4 text-red-500" />
                  YouTube Channel
                </label>
                <input
                  type="text"
                  value={handles.youtube_handle}
                  onChange={(e) => setHandles({ ...handles, youtube_handle: e.target.value })}
                  placeholder="@yourchannel"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Music className="w-4 h-4 text-cyan-500" />
                  TikTok Username
                </label>
                <input
                  type="text"
                  value={handles.tiktok_handle}
                  onChange={(e) => setHandles({ ...handles, tiktok_handle: e.target.value })}
                  placeholder="@yourusername"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-500" />
                  Instagram Username
                </label>
                <input
                  type="text"
                  value={handles.instagram_handle}
                  onChange={(e) => setHandles({ ...handles, instagram_handle: e.target.value })}
                  placeholder="@yourusername"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Music className="w-4 h-4 text-orange-500" />
                  SoundCloud Username
                </label>
                <input
                  type="text"
                  value={handles.soundcloud_handle}
                  onChange={(e) => setHandles({ ...handles, soundcloud_handle: e.target.value })}
                  placeholder="your-username"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4">
                <p className="text-sm text-blue-300 flex items-start gap-2">
                  <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>After saving, click "Sync Data" to fetch your latest analytics from each platform.</span>
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex gap-3">
              <button
                onClick={saveHandles}
                disabled={savingHandles}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg"
              >
                {savingHandles ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Settings
                  </>
                )}
              </button>
              <button
                onClick={() => setShowHandlesModal(false)}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
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
