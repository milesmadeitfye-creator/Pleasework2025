import { supabase } from '../supabase';

interface SmartlinkClickSummary {
  totalClicks: number;
  todayClicks: number;
  uniqueLinks: number;
  topPlatform: string;
}

interface ClicksByDay {
  day: string;
  clicks: number;
}

interface TopPlatform {
  platform: string;
  clicks: number;
  percentage: number;
}

interface RecentClick {
  id: string;
  created_at: string;
  platform: string | null;
  smartlink_id: string | null;
  smart_link_id?: string | null;
}

export async function fetchSmartlinkClickSummary(
  userId: string,
  rangeStartISO: string,
  platformFilter?: string
): Promise<SmartlinkClickSummary> {
  let query = supabase
    .from('smartlink_events_analytics')
    .select('id, smart_link_id, platform, created_at', { count: 'exact' })
    .eq('owner_user_id', userId)
    .gte('created_at', rangeStartISO);

  if (platformFilter && platformFilter !== 'all') {
    query = query.eq('platform', platformFilter);
  }

  const { data, error, count } = await query;

  // DEV LOG
  console.log('[fetchSmartlinkClickSummary] Table: smartlink_events_analytics, User:', userId, 'Rows:', count || 0);

  if (error) {
    console.error('[Analytics] fetchSmartlinkClickSummary error:', error);
    return {
      totalClicks: 0,
      todayClicks: 0,
      uniqueLinks: 0,
      topPlatform: '—',
    };
  }

  const rows = data || [];
  const totalClicks = count || 0;

  // Clicks today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayClicks = rows.filter(
    (r) => new Date(r.created_at) >= todayStart
  ).length;

  // Unique links - compute distinct in JS
  const uniqueLinkIds = new Set(
    rows.map((r) => r.smart_link_id).filter(Boolean)
  );
  const uniqueLinks = uniqueLinkIds.size;

  // Top platform - reduce counts in JS
  const platformCounts = new Map<string, number>();
  rows.forEach((r) => {
    const platform = r.platform || 'unknown';
    platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
  });

  let topPlatform = '—';
  let maxCount = 0;
  platformCounts.forEach((count, platform) => {
    if (count > maxCount) {
      maxCount = count;
      topPlatform = platform;
    }
  });

  return {
    totalClicks,
    todayClicks,
    uniqueLinks,
    topPlatform,
  };
}

export async function fetchSmartlinkClicksByDay(
  userId: string,
  rangeStartISO: string,
  platformFilter?: string
): Promise<ClicksByDay[]> {
  let query = supabase
    .from('smartlink_events_analytics')
    .select('created_at')
    .eq('owner_user_id', userId)
    .gte('created_at', rangeStartISO);

  if (platformFilter && platformFilter !== 'all') {
    query = query.eq('platform', platformFilter);
  }

  const { data, error } = await query;

  // DEV LOG
  console.log('[fetchSmartlinkClicksByDay] Table: smartlink_events_analytics, User:', userId, 'Rows:', data?.length || 0);

  if (error) {
    console.error('[Analytics] fetchSmartlinkClicksByDay error:', error);
    return [];
  }

  const rows = data || [];

  // Bucket by day in JS
  const dayMap = new Map<string, number>();
  rows.forEach((r) => {
    const date = new Date(r.created_at);
    const day = date.toISOString().split('T')[0];
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  });

  const result = Array.from(dayMap.entries())
    .map(([day, clicks]) => ({ day, clicks }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return result;
}

export async function fetchSmartlinkTopPlatforms(
  userId: string,
  rangeStartISO: string,
  platformFilter?: string,
  limit: number = 5
): Promise<TopPlatform[]> {
  let query = supabase
    .from('smartlink_events_analytics')
    .select('platform')
    .eq('owner_user_id', userId)
    .gte('created_at', rangeStartISO);

  if (platformFilter && platformFilter !== 'all') {
    query = query.eq('platform', platformFilter);
  }

  const { data, error } = await query;

  // DEV LOG
  console.log('[fetchSmartlinkTopPlatforms] Table: smartlink_events_analytics, User:', userId, 'Rows:', data?.length || 0);

  if (error) {
    console.error('[Analytics] fetchSmartlinkTopPlatforms error:', error);
    return [];
  }

  const rows = data || [];
  const totalClicks = rows.length;

  // Reduce by platform in JS
  const platformCounts = new Map<string, number>();
  rows.forEach((r) => {
    const platform = r.platform || 'unknown';
    platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
  });

  const result = Array.from(platformCounts.entries())
    .map(([platform, clicks]) => ({
      platform,
      clicks,
      percentage: totalClicks > 0 ? (clicks / totalClicks) * 100 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);

  return result;
}

export async function fetchSmartlinkRecentClicks(
  userId: string,
  platformFilter?: string,
  limit: number = 50
): Promise<RecentClick[]> {
  let query = supabase
    .from('smartlink_events_analytics')
    .select('smart_link_id, platform, created_at')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (platformFilter && platformFilter !== 'all') {
    query = query.eq('platform', platformFilter);
  }

  const { data, error } = await query;

  // DEV LOG
  console.log('[fetchSmartlinkRecentClicks] Table: smartlink_events_analytics, User:', userId, 'Rows:', data?.length || 0);

  if (error) {
    console.error('[Analytics] fetchSmartlinkRecentClicks error:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.smart_link_id || '',
    smartlink_id: row.smart_link_id,
    platform: row.platform,
    created_at: row.created_at
  }));
}
