import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';

interface CreativesResponse {
  totalAssets: number;
  assetsByKind: Record<string, number>;
  assetsByMimeType: Record<string, number>;
  recentUploads: Array<{
    id: string;
    user_id: string;
    asset_kind: string;
    mime_type: string;
    size: number;
    object_path: string;
    created_at?: string;
  }>;
  coverArtJobs: {
    total: number;
    statusCounts: Record<string, number>;
  };
  visualJobs: {
    total: number;
    statusCounts: Record<string, number>;
  };
}

export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    const sb = getServiceClient();
    const response: CreativesResponse = {
      totalAssets: 0,
      assetsByKind: {},
      assetsByMimeType: {},
      recentUploads: [],
      coverArtJobs: {
        total: 0,
        statusCounts: {},
      },
      visualJobs: {
        total: 0,
        statusCounts: {},
      },
    };

    // Media assets
    try {
      const { data: assets, error: assetsErr } = await sb
        .from('media_assets')
        .select('id, user_id, asset_kind, mime_type, size, object_path, created_at');

      if (!assetsErr && assets) {
        response.totalAssets = assets.length;

        // Count by kind and mime type
        const kindCounts: Record<string, number> = {};
        const mimeTypeCounts: Record<string, number> = {};

        assets.forEach((a: any) => {
          kindCounts[a.asset_kind] = (kindCounts[a.asset_kind] || 0) + 1;
          mimeTypeCounts[a.mime_type] = (mimeTypeCounts[a.mime_type] || 0) + 1;
        });

        response.assetsByKind = kindCounts;
        response.assetsByMimeType = mimeTypeCounts;

        // Recent uploads (last 20)
        response.recentUploads = assets
          .sort((a: any, b: any) => {
            const aDate = new Date(a.created_at || 0).getTime();
            const bDate = new Date(b.created_at || 0).getTime();
            return bDate - aDate;
          })
          .slice(0, 20)
          .map((a: any) => ({
            id: a.id,
            user_id: a.user_id,
            asset_kind: a.asset_kind,
            mime_type: a.mime_type,
            size: a.size || 0,
            object_path: a.object_path,
            created_at: a.created_at,
          }));
      }
    } catch (err) {
      console.error('[admin-creatives] media assets query failed', err);
    }

    // AI cover art jobs (check if table exists)
    try {
      const { data: coverArtJobs, error: coverErr } = await sb
        .from('ai_cover_art_jobs')
        .select('id, status');

      if (!coverErr && coverArtJobs) {
        response.coverArtJobs.total = coverArtJobs.length;

        const statusCounts: Record<string, number> = {};
        coverArtJobs.forEach((j: any) => {
          statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
        });
        response.coverArtJobs.statusCounts = statusCounts;
      }
    } catch (err) {
      console.error('[admin-creatives] cover art jobs query failed (table may not exist)', err);
    }

    // Music visual jobs (check if table exists)
    try {
      const { data: visualJobs, error: visualErr } = await sb
        .from('music_visual_jobs')
        .select('id, status');

      if (!visualErr && visualJobs) {
        response.visualJobs.total = visualJobs.length;

        const statusCounts: Record<string, number> = {};
        visualJobs.forEach((j: any) => {
          statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
        });
        response.visualJobs.statusCounts = statusCounts;
      }
    } catch (err) {
      console.error('[admin-creatives] visual jobs query failed (table may not exist)', err);
    }

    return json(200, response);
  } catch (err) {
    console.error('[admin-creatives] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
