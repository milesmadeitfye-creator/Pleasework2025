import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface PlatformBreakdown {
  ios: number;
  android: number;
  web: number;
  other: number;
}

interface DailyPlatformBreakdown {
  date: string;
  ios: number;
  android: number;
  web: number;
  other: number;
}

interface PlatformStatsResponse {
  clicksByPlatform: PlatformBreakdown;
  usersByPlatform: PlatformBreakdown;
  activityByPlatform: {
    ios: number;
    android: number;
    web: number;
    other: number;
  };
  dailyBreakdown: DailyPlatformBreakdown[];
}

function parsePlatform(userAgent: string | null): keyof PlatformBreakdown {
  if (!userAgent) return 'other';
  const ua = userAgent.toLowerCase();

  if (/iphone|ipad|ios/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/windows|macintosh|linux|x11/.test(ua)) return 'web';

  return 'other';
}

function initializePlatformCounts(): PlatformBreakdown {
  return { ios: 0, android: 0, web: 0, other: 0 };
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: PlatformStatsResponse = {
      clicksByPlatform: initializePlatformCounts(),
      usersByPlatform: initializePlatformCounts(),
      activityByPlatform: initializePlatformCounts(),
      dailyBreakdown: [],
    };

    // Get clicks by platform from link_click_events
    try {
      const { data: clickEvents, error: clickErr } = await sb
        .from('link_click_events')
        .select('user_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(10000); // Sample for stats

      if (!clickErr && clickEvents) {
        const dailyCounts: Record<string, PlatformBreakdown> = {};
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        clickEvents.forEach((event: any) => {
          const platform = parsePlatform(event.user_agent);
          response.clicksByPlatform[platform]++;

          // Build daily breakdown
          const clickDate = new Date(event.created_at);
          if (clickDate >= thirtyDaysAgo) {
            const dateStr = clickDate.toISOString().split('T')[0];
            if (!dailyCounts[dateStr]) {
              dailyCounts[dateStr] = initializePlatformCounts();
            }
            dailyCounts[dateStr][platform]++;
          }
        });

        // Convert daily counts to array
        response.dailyBreakdown = Object.entries(dailyCounts)
          .map(([date, counts]) => ({ date, ...counts }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    } catch (err) {
      console.error('[admin-platform-stats] link click events query failed', err);
    }

    // Get activity by platform from behavior_logs
    try {
      const { data: behaviorLogs, error: behaviorErr } = await sb
        .from('behavior_logs')
        .select('metadata_json')
        .limit(5000); // Sample

      if (!behaviorErr && behaviorLogs) {
        behaviorLogs.forEach((log: any) => {
          let userAgent = '';

          // Try to extract user_agent from metadata_json
          if (typeof log.metadata_json === 'string') {
            try {
              const meta = JSON.parse(log.metadata_json);
              userAgent = meta.user_agent || '';
            } catch {
              userAgent = log.metadata_json;
            }
          } else if (typeof log.metadata_json === 'object' && log.metadata_json) {
            userAgent = (log.metadata_json as any).user_agent || '';
          }

          const platform = parsePlatform(userAgent);
          response.activityByPlatform[platform]++;
        });
      }
    } catch (err) {
      console.error('[admin-platform-stats] behavior logs query failed', err);
    }

    // Get users by platform (sample from user_profiles)
    try {
      const { data: profiles, error: profileErr } = await sb
        .from('user_profiles')
        .select('user_agent')
        .limit(5000);

      if (!profileErr && profiles) {
        profiles.forEach((p: any) => {
          const platform = parsePlatform(p.user_agent);
          response.usersByPlatform[platform]++;
        });
      }
    } catch (err) {
      console.error('[admin-platform-stats] user profiles query failed', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-platform-stats] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
