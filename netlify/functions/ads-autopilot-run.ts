import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';
import { getMetaCredsForUser, normalizeAct, metaFetch, metaPost } from './_metaAutopilotClient';

type InsightsRow = {
  ad_id: string;
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
};

function n(s?: string): number {
  if (!s) return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const auth = event.headers.authorization || event.headers.Authorization;
    if (!auth?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Missing authorization header' }),
      };
    }

    const jwt = auth.replace('Bearer ', '').trim();
    const sb = supabaseAdmin;

    // Resolve user from JWT
    const { data: u, error: ue } = await sb.auth.getUser(jwt);
    if (ue || !u?.user?.id) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: 'Invalid auth token' }),
      };
    }
    const userId = u.user.id;

    console.log('[ads-autopilot-run] Starting run for user:', userId);

    // Load settings
    const { data: settings } = await sb
      .from('ads_autopilot_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!settings?.enabled) {
      console.log('[ads-autopilot-run] Autopilot disabled for user');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, skipped: true, reason: 'disabled' }),
      };
    }

    const maxActions = settings.max_actions_per_run ?? 10;
    let actionsTaken = 0;

    // Load active rules
    const { data: rules } = await sb
      .from('ads_autopilot_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!rules || rules.length === 0) {
      console.log('[ads-autopilot-run] No active rules for user');
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, skipped: true, reason: 'no_rules' }),
      };
    }

    // Get Meta credentials
    const creds = await getMetaCredsForUser(userId);
    const act = normalizeAct(creds.adAccountId);

    console.log('[ads-autopilot-run] Fetching insights for account:', act);

    // Pull insights for last 30 days daily for ads
    const since = new Date(Date.now() - 29 * 24 * 3600 * 1000);
    const until = new Date();
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);

    const insights = await metaFetch<{ data: InsightsRow[] }>(creds.accessToken, `${act}/insights`, {
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      fields: 'ad_id,date_start,date_stop,spend,impressions,clicks,ctr',
      limit: '500',
    });

    const rows = insights?.data ?? [];
    console.log('[ads-autopilot-run] Fetched insights rows:', rows.length);

    // Group by ad_id
    const byAd = new Map<string, InsightsRow[]>();
    for (const r of rows) {
      if (!r.ad_id) continue;
      const arr = byAd.get(r.ad_id) ?? [];
      arr.push(r);
      byAd.set(r.ad_id, arr);
    }

    // Sort by date
    for (const [k, arr] of byAd.entries()) {
      arr.sort((a, b) => (a.date_start < b.date_start ? -1 : 1));
      byAd.set(k, arr);
    }

    console.log('[ads-autopilot-run] Grouped into', byAd.size, 'ads');

    // Apply rules
    for (const rule of rules) {
      if (actionsTaken >= maxActions) break;

      const cond = rule.conditions || {};
      const action = rule.action || {};

      if (action.type !== 'pause_ad') continue;
      if (!settings.allow_pause_ads) continue;

      const windowDays = Number(cond.window_days ?? 2);
      const minSpend = Number(cond.min_spend ?? 10);
      const maxCtr = Number(cond.max_ctr ?? 0.006);

      console.log('[ads-autopilot-run] Applying rule:', rule.name);

      for (const [adId, arr] of byAd.entries()) {
        if (actionsTaken >= maxActions) break;

        const window = arr.slice(-windowDays);
        const spend = window.reduce((sum, r) => sum + n(r.spend), 0);
        const impressions = window.reduce((sum, r) => sum + n(r.impressions), 0);
        const clicks = window.reduce((sum, r) => sum + n(r.clicks), 0);
        const ctr = impressions > 0 ? clicks / impressions : 0;

        if (spend >= minSpend && ctr > 0 && ctr < maxCtr) {
          const before = {
            spend: Math.round(spend * 100) / 100,
            ctr: Math.round(ctr * 10000) / 10000,
            windowDays,
            from: window[0]?.date_start,
            to: window.at(-1)?.date_stop,
          };

          console.log('[ads-autopilot-run] Pausing ad:', adId, before);

          try {
            const resp = await metaPost<any>(creds.accessToken, adId, { status: 'PAUSED' });

            await sb.from('ads_autopilot_log').insert({
              user_id: userId,
              provider: 'meta',
              entity_type: 'ad',
              entity_id: adId,
              action_taken: 'pause_ad',
              result: 'ok',
              before,
              after: { status: 'PAUSED' },
              meta: { meta_response: resp, rule_name: rule.name },
            });

            actionsTaken += 1;
          } catch (e: any) {
            console.error('[ads-autopilot-run] Failed to pause ad:', adId, e.message);
            await sb.from('ads_autopilot_log').insert({
              user_id: userId,
              provider: 'meta',
              entity_type: 'ad',
              entity_id: adId,
              action_taken: 'pause_ad',
              result: 'failed',
              before,
              after: null,
              meta: { error: String(e?.message ?? e), rule_name: rule.name },
            });
          }
        }
      }
    }

    console.log('[ads-autopilot-run] Complete. Actions taken:', actionsTaken);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        actionsTaken,
        since: sinceStr,
        until: untilStr,
        totalAds: byAd.size,
      }),
    };
  } catch (e: any) {
    console.error('[ads-autopilot-run] Error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
    };
  }
};
