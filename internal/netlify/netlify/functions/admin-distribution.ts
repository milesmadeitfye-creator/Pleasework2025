import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface DistributionResponse {
  totalReleases: number;
  statusCounts: Record<string, number>;
  recentReleases: Array<{
    id: string;
    user_id: string;
    title: string;
    artist_name: string;
    release_date: string;
    status: string;
    isrc?: string;
    upc?: string;
  }>;
  payoutSummary: {
    totalPayouts: number;
    uniqueUsers: number;
    recentPayouts: Array<{
      id: string;
      user_id: string;
      amount?: number;
      status?: string;
      payout_date?: string;
    }>;
  };
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: DistributionResponse = {
      totalReleases: 0,
      statusCounts: {},
      recentReleases: [],
      payoutSummary: {
        totalPayouts: 0,
        uniqueUsers: 0,
        recentPayouts: [],
      },
    };

    // Get all distribution releases
    try {
      const { data: releases, error: releasesErr } = await sb
        .from('distro_releases')
        .select('id, user_id, title, artist_name, release_date, status, isrc, upc');

      if (!releasesErr && releases) {
        response.totalReleases = releases.length;

        // Count by status
        const statusCounts: Record<string, number> = {};
        releases.forEach((r: any) => {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        });
        response.statusCounts = statusCounts;

        // Recent releases (last 20)
        response.recentReleases = releases
          .sort((a: any, b: any) => {
            const aDate = new Date(a.release_date).getTime();
            const bDate = new Date(b.release_date).getTime();
            return bDate - aDate;
          })
          .slice(0, 20)
          .map((r: any) => ({
            id: r.id,
            user_id: r.user_id,
            title: r.title,
            artist_name: r.artist_name,
            release_date: r.release_date,
            status: r.status,
            isrc: r.isrc,
            upc: r.upc,
          }));
      }
    } catch (err) {
      console.error('[admin-distribution] releases query failed', err);
    }

    // Get payout information
    try {
      const { data: payouts, error: payoutErr } = await sb
        .from('distro_payouts')
        .select('id, user_id, amount, status, payout_date')
        .order('payout_date', { ascending: false });

      if (!payoutErr && payouts) {
        response.payoutSummary.totalPayouts = payouts.length;

        // Unique users with payouts
        const uniqueUsers = new Set(payouts.map((p: any) => p.user_id));
        response.payoutSummary.uniqueUsers = uniqueUsers.size;

        // Recent payouts
        response.payoutSummary.recentPayouts = payouts.slice(0, 50).map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          amount: p.amount,
          status: p.status,
          payout_date: p.payout_date,
        }));
      }
    } catch (err) {
      console.error('[admin-distribution] payouts query failed', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-distribution] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
