import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { fetchMetaCredentials } from "./_metaCredentialsHelper";

interface EnsureAudiencesRequest {
  goal_key: string;
  seed_types?: string[]; // e.g., ['video_viewers_25', 'engagers_365', 'website_180']
}

interface AudienceResult {
  id: string;
  meta_audience_id: string;
  type: 'custom' | 'lookalike';
  name: string;
  source?: string;
}

/**
 * Ensure required Meta Custom Audiences and Lookalikes exist
 * Creates audiences if missing, reuses existing ones
 * Gracefully handles failures - returns what it can create
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body: EnsureAudiencesRequest = event.body ? JSON.parse(event.body) : {};
    const { goal_key, seed_types = ['website_180', 'engagers_365', 'video_viewers_25'] } = body;

    console.log('[meta-audiences-ensure] Ensuring audiences for goal:', goal_key);

    // Get Meta credentials
    const creds = await fetchMetaCredentials(supabase, user.id);
    if (!creds) {
      console.log('[meta-audiences-ensure] No Meta credentials found');
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          audiences: [],
          message: 'Meta not connected - will use broad targeting',
        }),
      };
    }

    const { access_token, ad_account_id, pixel_id, ig_actor_id, page_id } = creds;

    if (!access_token || !ad_account_id) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          audiences: [],
          message: 'Meta credentials incomplete - will use broad targeting',
        }),
      };
    }

    const audiences: AudienceResult[] = [];
    const errors: string[] = [];

    // Ensure custom audiences
    for (const seedType of seed_types) {
      try {
        const customAudience = await ensureCustomAudience(
          supabase,
          user.id,
          ad_account_id,
          access_token,
          seedType,
          { pixel_id, ig_actor_id, page_id }
        );

        if (customAudience) {
          audiences.push(customAudience);

          // Create 1% lookalike for this custom audience
          try {
            const lookalike = await ensureLookalikeAudience(
              supabase,
              user.id,
              ad_account_id,
              access_token,
              customAudience,
              1,
              'US'
            );

            if (lookalike) {
              audiences.push(lookalike);
            }
          } catch (lookalikeErr) {
            console.error(`[meta-audiences-ensure] Lookalike creation failed for ${seedType}:`, lookalikeErr);
            errors.push(`Lookalike for ${seedType}: ${lookalikeErr instanceof Error ? lookalikeErr.message : 'Unknown error'}`);
          }
        }
      } catch (err) {
        console.error(`[meta-audiences-ensure] Custom audience creation failed for ${seedType}:`, err);
        errors.push(`Custom ${seedType}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        audiences,
        errors: errors.length > 0 ? errors : undefined,
        message: `Created/reused ${audiences.length} audiences${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      }),
    };
  } catch (err: any) {
    console.error('[meta-audiences-ensure] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: "internal_error",
        message: err.message || "Failed to ensure audiences",
      }),
    };
  }
};

async function ensureCustomAudience(
  supabase: any,
  userId: string,
  adAccountId: string,
  accessToken: string,
  seedType: string,
  context: { pixel_id?: string; ig_actor_id?: string; page_id?: string }
): Promise<AudienceResult | null> {
  const audienceName = `Ghoste_${seedType}`;

  // Check if audience already exists in DB
  const { data: existing } = await supabase
    .from('meta_audiences')
    .select('id, meta_audience_id, name')
    .eq('user_id', userId)
    .eq('name', audienceName)
    .eq('audience_type', 'custom')
    .maybeSingle();

  if (existing) {
    console.log(`[meta-audiences-ensure] Custom audience ${audienceName} already exists: ${existing.meta_audience_id}`);
    return {
      id: existing.id,
      meta_audience_id: existing.meta_audience_id,
      type: 'custom',
      name: existing.name,
      source: seedType,
    };
  }

  // Create new custom audience via Meta API
  console.log(`[meta-audiences-ensure] Creating custom audience ${audienceName}`);

  const payload: any = {
    name: audienceName,
    subtype: 'CUSTOM',
    description: `Ghoste auto-created custom audience: ${seedType}`,
  };

  // Set audience source based on seed type
  if (seedType === 'website_180' && context.pixel_id) {
    payload.rule = JSON.stringify({
      inclusions: {
        operator: 'or',
        rules: [{
          event_sources: [{ id: context.pixel_id, type: 'pixel' }],
          retention_seconds: 180 * 86400, // 180 days
          filter: {
            operator: 'and',
            filters: [{
              field: 'event',
              operator: 'eq',
              value: 'PageView'
            }]
          }
        }]
      }
    });
  } else if (seedType === 'engagers_365' && (context.ig_actor_id || context.page_id)) {
    payload.prefill = true;
    payload.retention_days = 365;
    payload.rule = JSON.stringify({
      inclusions: {
        operator: 'or',
        rules: [{
          event_sources: context.ig_actor_id ? [{ id: context.ig_actor_id, type: 'instagram_account' }] : [{ id: context.page_id, type: 'page' }],
          retention_seconds: 365 * 86400,
        }]
      }
    });
  } else if (seedType === 'video_viewers_25') {
    payload.prefill = true;
    payload.retention_days = 365;
    if (context.ig_actor_id) {
      payload.rule = JSON.stringify({
        inclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ id: context.ig_actor_id, type: 'instagram_account' }],
            retention_seconds: 365 * 86400,
            filter: {
              operator: 'and',
              filters: [{
                field: 'video_play_actions',
                operator: 'i_contains',
                value: ['video_view_25']
              }]
            }
          }]
        }
      });
    }
  } else {
    console.log(`[meta-audiences-ensure] Skipping ${seedType} - missing required context`);
    return null;
  }

  const url = `https://graph.facebook.com/v18.0/act_${adAccountId}/customaudiences`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      access_token: accessToken,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const metaAudienceId = data.id;

  console.log(`[meta-audiences-ensure] Created custom audience ${metaAudienceId}`);

  // Store in DB
  const { data: inserted } = await supabase
    .from('meta_audiences')
    .insert({
      user_id: userId,
      audience_type: 'custom',
      source: seedType,
      meta_audience_id: metaAudienceId,
      name: audienceName,
      status: 'active',
    })
    .select('id, meta_audience_id, name')
    .single();

  return {
    id: inserted.id,
    meta_audience_id: inserted.meta_audience_id,
    type: 'custom',
    name: inserted.name,
    source: seedType,
  };
}

async function ensureLookalikeAudience(
  supabase: any,
  userId: string,
  adAccountId: string,
  accessToken: string,
  seedAudience: AudienceResult,
  percent: number,
  country: string
): Promise<AudienceResult | null> {
  const audienceName = `Ghoste_LAL_${seedAudience.source}_${percent}pct_${country}`;

  // Check if lookalike already exists
  const { data: existing } = await supabase
    .from('meta_audiences')
    .select('id, meta_audience_id, name')
    .eq('user_id', userId)
    .eq('name', audienceName)
    .eq('audience_type', 'lookalike')
    .maybeSingle();

  if (existing) {
    console.log(`[meta-audiences-ensure] Lookalike ${audienceName} already exists: ${existing.meta_audience_id}`);
    return {
      id: existing.id,
      meta_audience_id: existing.meta_audience_id,
      type: 'lookalike',
      name: existing.name,
    };
  }

  // Create lookalike via Meta API
  console.log(`[meta-audiences-ensure] Creating lookalike ${audienceName}`);

  const payload = {
    name: audienceName,
    subtype: 'LOOKALIKE',
    origin_audience_id: seedAudience.meta_audience_id,
    lookalike_spec: JSON.stringify({
      type: 'similarity',
      country,
      ratio: percent / 100,
    }),
    access_token: accessToken,
  };

  const url = `https://graph.facebook.com/v18.0/act_${adAccountId}/customaudiences`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const metaAudienceId = data.id;

  console.log(`[meta-audiences-ensure] Created lookalike ${metaAudienceId}`);

  // Store in DB
  const { data: inserted } = await supabase
    .from('meta_audiences')
    .insert({
      user_id: userId,
      audience_type: 'lookalike',
      meta_audience_id: metaAudienceId,
      name: audienceName,
      status: 'active',
      lookalike_spec: {
        percent,
        country,
        source_audience_id: seedAudience.meta_audience_id,
      },
      parent_audience_id: seedAudience.id,
    })
    .select('id, meta_audience_id, name')
    .single();

  return {
    id: inserted.id,
    meta_audience_id: inserted.meta_audience_id,
    type: 'lookalike',
    name: inserted.name,
  };
}
