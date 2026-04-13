import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface LinkStats {
  totalLinks: number;
  activeLinks: number;
  totalOneClickLinks: number;
  totalClicks: number;
  clicksByPlatform: {
    ios: number;
    android: number;
    web: number;
    desktop: number;
    other: number;
  };
  topLinks: Array<{
    id: string;
    slug: string;
    title: string;
    total_clicks: number;
    total_views: number;
  }>;
  dailyClicks: Array<{
    date: string;
    clicks: number;
  }>;
}

function parsePlatform(userAgent: string | null): keyof LinkStats['clicksByPlatform'] {
  if (!userAgent) return 'other';
  const ua = userAgent.toLowerCase();

  if (/iphone|ipad|ios/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/mobile|webos|blackberry|opera mini/.test(ua)) return 'mobile';
  if (/windows|macintosh|linux|x11/.test(ua)) return 'desktop';
  if (/(chrome|firefox|safari|edge)/.test(ua)) return 'web';

  return 'other';
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: LinkStats = {
      totalLinks: 0,
      activeLinks: 0,
      totalOneClickLinks: 0,
      totalClicks: 0,
      clicksByPlatform: { ios: 0, android: 0, web: 0, desktop: 0, other: 0 },
      topLinks: [],
      dailyClicks: [],
    };

    // Count smart links
    try {
      const { data: allLinks, error: linksErr } = await sb
        .from('smart_links')
        .select('id, slug, title, total_clicks, total_views, is_active, link_type');

      if (!linksErr && allLinks) {
        response.totalLinks = allLinks.length;
        response.activeLinks = allLinks.filter((l: any) => l.is_active).length;
        response.totalOneClickLinks = allLinks.filter(
          (l: any) => l.link_type === 'oneclick'
        ).length;

        // Total clicks
        response.totalClicks = allLinks.reduce(
          (sum: number, l: any) => sum + (l.total_clicks || 0),
          0
        );

        // Top 10 links
        response.topLinks = allLinks
          .sort((a: any, b: any) => (b.total_clicks || 0) - (a.total_clicks || 0))
          .slice(0, 10)
          .map((l: any) => ({
            id: l.id,
            slug: l.slug,
            title: l.title,
            total_clicks: l.total_clicks || 0,
            total_views: l.total_views || 0,
          }));
      }
    } catch (err) {
      console.error('[admin-links] smart links query failed', err);
    }

    // Click events by platform
    try {
      const { data: clicks, error: clickErr } = await sb
        .from('link_click_events')
        .select('user_agent, created_at')
        .order('created_at', { ascending: false })
        .limit(5000); // Sample for daily breakdown

      if (!clickErr && clicks) {
        const platformCounts: Record<string, number> = {
          ios: 0,
          android: 0,
          web: 0,
          desktop: 0,
          other: 0,
        };

        // Build daily click counts
        const dailyClickCounts: Record<string, number> = {};
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        clicks.forEach((click: any) => {
          // Platform breakdown
          const platform = parsePlatform(click.user_agent);
          platformCounts[platform]++;

          // Daily breakdown
          const clickDate = new Date(click.created_at);
          if (clickDate >= thirtyDaysAgo) {
            const dateStr = clickDate.toISOString().split('T')[0];
            dailyClickCounts[dateStr] = (dailyClickCounts[dateStr] || 0) + 1;
          }
        });

        response.clicksByPlatform = platformCounts as any;

        // Convert daily counts to array
        response.dailyClicks = Object.entries(dailyClickCounts)
          .map(([date, clicks]) => ({ date, clicks }))
          .sort((a, b) => a.date.localeCompare(b.date));
      }
    } catch (err) {
      console.error('[admin-links] click events query failed', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-links] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
