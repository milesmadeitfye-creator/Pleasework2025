import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface AdsResponse {
  totalCampaigns: number;
  metaCampaigns: {
    statusCounts: Record<string, number>;
    objectiveCounts: Record<string, number>;
    recentCampaigns: Array<{
      id: string;
      user_id: string;
      campaign_id: string;
      name: string;
      objective: string;
      status: string;
    }>;
  };
  adCampaigns: {
    statusCounts: Record<string, number>;
    recentCampaigns: Array<{
      id: string;
      user_id: string;
      name: string;
      status: string;
      budget?: number;
    }>;
  };
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: AdsResponse = {
      totalCampaigns: 0,
      metaCampaigns: {
        statusCounts: {},
        objectiveCounts: {},
        recentCampaigns: [],
      },
      adCampaigns: {
        statusCounts: {},
        recentCampaigns: [],
      },
    };

    // Meta ad campaigns
    try {
      const { data: metaCampaigns, error: metaErr } = await sb
        .from('meta_ad_campaigns')
        .select('id, user_id, campaign_id, name, objective, status')
        .order('created_at', { ascending: false });

      if (!metaErr && metaCampaigns) {
        // Status counts
        const statusCounts: Record<string, number> = {};
        const objectiveCounts: Record<string, number> = {};

        metaCampaigns.forEach((c: any) => {
          statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
          objectiveCounts[c.objective] = (objectiveCounts[c.objective] || 0) + 1;
        });

        response.metaCampaigns.statusCounts = statusCounts;
        response.metaCampaigns.objectiveCounts = objectiveCounts;
        response.metaCampaigns.recentCampaigns = metaCampaigns.slice(0, 20).map((c: any) => ({
          id: c.id,
          user_id: c.user_id,
          campaign_id: c.campaign_id,
          name: c.name,
          objective: c.objective,
          status: c.status,
        }));
      }
    } catch (err) {
      console.error('[admin-ads] meta campaigns query failed', err);
    }

    // General ad campaigns
    try {
      const { data: adCampaigns, error: adErr } = await sb
        .from('ad_campaigns')
        .select('id, user_id, name, status, budget')
        .order('created_at', { ascending: false });

      if (!adErr && adCampaigns) {
        const statusCounts: Record<string, number> = {};

        adCampaigns.forEach((c: any) => {
          statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
        });

        response.adCampaigns.statusCounts = statusCounts;
        response.adCampaigns.recentCampaigns = adCampaigns.slice(0, 20).map((c: any) => ({
          id: c.id,
          user_id: c.user_id,
          name: c.name,
          status: c.status,
          budget: c.budget,
        }));

        response.totalCampaigns =
          Object.values(response.metaCampaigns.statusCounts).reduce((a, b) => a + b, 0) +
          Object.values(statusCounts).reduce((a, b) => a + b, 0);
      }
    } catch (err) {
      console.error('[admin-ads] ad campaigns query failed', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-ads] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
