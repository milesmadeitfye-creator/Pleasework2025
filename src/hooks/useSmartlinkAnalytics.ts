import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { singleFlight, debounce } from '../lib/fetchGuard';

export interface SmartlinkAnalyticsData {
  // Audience Demographics
  deviceSplit: { device: string; count: number }[];
  browserSplit: { browser: string; count: number }[];
  peakHour: number | null;

  // Link Click Demographics
  topCountries: { country: string; count: number }[];
  topCities: { city: string; count: number }[];
  osSplit: { os: string; count: number }[];
  newVsReturning: { new: number; returning: number } | null;

  // Traffic Sources
  referrerCategories: { category: string; count: number }[];
  utmSources: { source: string; count: number }[];
  utmCampaigns: { campaign: string; count: number }[];

  // Top Performing Assets
  topLinks: { id: string; title: string; slug: string; clicks: number }[];
  topPlatforms: { platform: string; clicks: number }[];
  mostActiveDay: { date: string; clicks: number } | null;

  loading: boolean;
  error: string | null;
}

interface UseSmartlinkAnalyticsOptions {
  userId: string | undefined;
  dateRange?: { start: Date; end: Date };
  platform?: string;
}

const CACHE_DURATION = 30000; // 30 seconds

export function useSmartlinkAnalytics(options: UseSmartlinkAnalyticsOptions) {
  const { userId, dateRange, platform } = options;

  const [data, setData] = useState<SmartlinkAnalyticsData>({
    deviceSplit: [],
    browserSplit: [],
    peakHour: null,
    topCountries: [],
    topCities: [],
    osSplit: [],
    newVsReturning: null,
    referrerCategories: [],
    utmSources: [],
    utmCampaigns: [],
    topLinks: [],
    topPlatforms: [],
    mostActiveDay: null,
    loading: true,
    error: null,
  });

  const cacheRef = useRef<{ data: SmartlinkAnalyticsData; timestamp: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!userId) {
      setData(prev => ({ ...prev, loading: false, error: 'No user ID provided' }));
      return;
    }

    // Check cache
    if (cacheRef.current && Date.now() - cacheRef.current.timestamp < CACHE_DURATION) {
      setData(cacheRef.current.data);
      return;
    }

    setData(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Use single-flight to prevent duplicate requests
      const cacheKey = `analytics-${userId}-${dateRange?.start?.getTime()}-${dateRange?.end?.getTime()}-${platform || 'all'}`;

      const result = await singleFlight(cacheKey, async (signal) => {
        // Build date filter
        const startDate = dateRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = dateRange?.end || new Date();

        // Fetch all data in parallel with abort signal
        const [analyticsEventsResult, smartLinksResult] = await Promise.all([
          // Fetch from smartlink_events_analytics (canonical deduped source)
          (async () => {
            let query = supabase
              .from('smartlink_events_analytics')
              .select('*')
              .eq('owner_user_id', userId)
              .gte('created_at', startDate.toISOString())
              .lte('created_at', endDate.toISOString())
              .abortSignal(signal);

            if (platform) {
              query = query.eq('platform', platform);
            }

            return query;
          })(),

          // Fetch smart links for titles
          supabase
            .from('smart_links')
            .select('id, title, slug, total_clicks')
            .eq('user_id', userId)
            .abortSignal(signal),
        ]);

        if (analyticsEventsResult.error) throw analyticsEventsResult.error;
        if (smartLinksResult.error) throw smartLinksResult.error;

        // DEV LOG
        console.log('[useSmartlinkAnalytics] Table: smartlink_events_analytics, User:', userId, 'Rows:', analyticsEventsResult.data?.length || 0);

        return {
          clickEvents: analyticsEventsResult.data || [],
          smartlinkEvents: analyticsEventsResult.data || [],
          smartLinks: smartLinksResult.data || [],
        };
      });

      // Process data
      const processedData = processAnalyticsData(
        result.clickEvents,
        result.smartlinkEvents,
        result.smartLinks
      );

      const newData = {
        ...processedData,
        loading: false,
        error: null,
      };

      setData(newData);
      cacheRef.current = { data: newData, timestamp: Date.now() };

    } catch (err: any) {
      // AbortError is normal during navigation/unmount - don't show as error
      if (err.name === 'AbortError') {
        return;
      }

      console.error('[useSmartlinkAnalytics] Fetch error:', err);
      setData(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Failed to fetch analytics',
      }));
    }
  }, [userId, dateRange, platform]);

  useEffect(() => {
    fetchAnalytics();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAnalytics]);

  const refresh = useCallback(() => {
    cacheRef.current = null;
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { ...data, refresh };
}

function processAnalyticsData(
  clickEvents: any[],
  smartlinkEvents: any[],
  smartLinks: any[]
): Omit<SmartlinkAnalyticsData, 'loading' | 'error'> {

  // Device split from link_click_events
  const deviceCounts: Record<string, number> = {};
  clickEvents.forEach(event => {
    const device = event.device_type || 'Unknown';
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
  });
  const deviceSplit = Object.entries(deviceCounts)
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count);

  // Browser split from link_click_events
  const browserCounts: Record<string, number> = {};
  clickEvents.forEach(event => {
    const browser = event.browser || 'Unknown';
    browserCounts[browser] = (browserCounts[browser] || 0) + 1;
  });
  const browserSplit = Object.entries(browserCounts)
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5

  // Peak hour
  const hourCounts: Record<number, number> = {};
  [...clickEvents, ...smartlinkEvents].forEach(event => {
    if (event.created_at) {
      const hour = new Date(event.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  });
  const peakHour = Object.entries(hourCounts).length > 0
    ? parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
    : null;

  // Top countries
  const countryCounts: Record<string, number> = {};
  clickEvents.forEach(event => {
    if (event.country) {
      countryCounts[event.country] = (countryCounts[event.country] || 0) + 1;
    }
  });
  const topCountries = Object.entries(countryCounts)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top cities
  const cityCounts: Record<string, number> = {};
  clickEvents.forEach(event => {
    if (event.city) {
      cityCounts[event.city] = (cityCounts[event.city] || 0) + 1;
    }
  });
  const topCities = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // OS split
  const osCounts: Record<string, number> = {};
  clickEvents.forEach(event => {
    const os = event.os || 'Unknown';
    osCounts[os] = (osCounts[os] || 0) + 1;
  });
  const osSplit = Object.entries(osCounts)
    .map(([os, count]) => ({ os, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // New vs returning (from smartlink_events with session_id)
  const sessionIds = new Set<string>();
  const sessionFirstSeen: Record<string, string> = {};

  smartlinkEvents
    .filter(e => e.session_id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach(event => {
      if (event.session_id) {
        sessionIds.add(event.session_id);
        if (!sessionFirstSeen[event.session_id]) {
          sessionFirstSeen[event.session_id] = event.created_at;
        }
      }
    });

  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let newSessions = 0;
  let returningSessions = 0;

  Object.entries(sessionFirstSeen).forEach(([sessionId, firstSeen]) => {
    if (new Date(firstSeen) >= windowStart) {
      newSessions++;
    } else {
      returningSessions++;
    }
  });

  const newVsReturning = sessionIds.size > 0
    ? { new: newSessions, returning: returningSessions }
    : null;

  // Referrer categories
  const referrerCounts: Record<string, number> = {
    'Direct / Unknown': 0,
    'Instagram': 0,
    'TikTok': 0,
    'YouTube': 0,
    'Twitter/X': 0,
    'Facebook': 0,
    'Google Search': 0,
    'Other': 0,
  };

  [...clickEvents, ...smartlinkEvents].forEach(event => {
    const ref = (event.referrer || '').toLowerCase();
    if (!ref || ref === 'unknown') {
      referrerCounts['Direct / Unknown']++;
    } else if (ref.includes('instagram')) {
      referrerCounts['Instagram']++;
    } else if (ref.includes('tiktok')) {
      referrerCounts['TikTok']++;
    } else if (ref.includes('youtube') || ref.includes('youtu.be')) {
      referrerCounts['YouTube']++;
    } else if (ref.includes('twitter') || ref.includes('t.co')) {
      referrerCounts['Twitter/X']++;
    } else if (ref.includes('facebook') || ref.includes('fb.com')) {
      referrerCounts['Facebook']++;
    } else if (ref.includes('google')) {
      referrerCounts['Google Search']++;
    } else {
      referrerCounts['Other']++;
    }
  });

  const referrerCategories = Object.entries(referrerCounts)
    .map(([category, count]) => ({ category, count }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // UTM sources & campaigns (from meta JSONB)
  const utmSourceCounts: Record<string, number> = {};
  const utmCampaignCounts: Record<string, number> = {};

  smartlinkEvents.forEach(event => {
    if (event.meta) {
      const meta = typeof event.meta === 'string' ? JSON.parse(event.meta) : event.meta;
      if (meta.utm_source) {
        utmSourceCounts[meta.utm_source] = (utmSourceCounts[meta.utm_source] || 0) + 1;
      }
      if (meta.utm_campaign) {
        utmCampaignCounts[meta.utm_campaign] = (utmCampaignCounts[meta.utm_campaign] || 0) + 1;
      }
    }
  });

  const utmSources = Object.entries(utmSourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const utmCampaigns = Object.entries(utmCampaignCounts)
    .map(([campaign, count]) => ({ campaign, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top platforms
  const platformCounts: Record<string, number> = {};
  [...clickEvents, ...smartlinkEvents].forEach(event => {
    if (event.platform) {
      platformCounts[event.platform] = (platformCounts[event.platform] || 0) + 1;
    }
  });
  const topPlatforms = Object.entries(platformCounts)
    .map(([platform, clicks]) => ({ platform, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  // Top links
  const linkClickCounts: Record<string, number> = {};
  [...clickEvents, ...smartlinkEvents].forEach(event => {
    const linkId = event.link_id || event.smartlink_id;
    if (linkId) {
      linkClickCounts[linkId] = (linkClickCounts[linkId] || 0) + 1;
    }
  });

  const linksMap = new Map(smartLinks.map(link => [link.id, link]));

  const topLinks = Object.entries(linkClickCounts)
    .map(([id, clicks]) => {
      const link = linksMap.get(id);
      return {
        id,
        title: link?.title || 'Untitled',
        slug: link?.slug || '',
        clicks,
      };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  // Most active day
  const dayCounts: Record<string, number> = {};
  [...clickEvents, ...smartlinkEvents].forEach(event => {
    if (event.created_at) {
      const day = new Date(event.created_at).toISOString().split('T')[0];
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
  });
  const mostActiveDay = Object.entries(dayCounts).length > 0
    ? Object.entries(dayCounts)
        .map(([date, clicks]) => ({ date, clicks }))
        .sort((a, b) => b.clicks - a.clicks)[0]
    : null;

  return {
    deviceSplit,
    browserSplit,
    peakHour,
    topCountries,
    topCities,
    osSplit,
    newVsReturning,
    referrerCategories,
    utmSources,
    utmCampaigns,
    topLinks,
    topPlatforms,
    mostActiveDay,
  };
}
