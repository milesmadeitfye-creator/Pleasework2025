import { supabaseAdmin } from '../_supabaseAdmin';

function getBaseUrl() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.VITE_FUNCTIONS_ORIGIN ||
    'http://localhost:8888'
  );
}

async function callInternalFn(name: string, body: any) {
  const origin = getBaseUrl();
  const url = `${origin}/.netlify/functions/${name}`;

  console.log(`[agentToolExecutor] Calling internal function: ${name}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({ error: 'Failed to parse response' }));

  if (!res.ok) {
    throw new Error(`${name} failed: ${json?.error || res.statusText}`);
  }

  return json;
}

export interface ToolContext {
  userId: string;
  userEmail?: string;
}

export async function executeTool(toolName: string, input: any, ctx: ToolContext) {
  console.log(`[agentToolExecutor] Executing tool: ${toolName}`);

  const sb = supabaseAdmin();

  switch (toolName) {
    // === CALENDAR TOOLS ===
    case 'schedule_events':
      return callInternalFn('ghoste-tools', {
        action: 'schedule_events',
        userId: ctx.userId,
        ...input
      });

    // === SMART LINKS TOOLS ===
    case 'smartlink_create':
      return callInternalFn('ghoste-tools', {
        action: 'create_smart_link',
        userId: ctx.userId,
        ...input
      });

    case 'oneclick_create':
      return callInternalFn('ghoste-tools', {
        action: 'create_one_click_link',
        userId: ctx.userId,
        ...input
      });

    case 'presave_create':
      return callInternalFn('ghoste-tools', {
        action: 'create_presave',
        userId: ctx.userId,
        ...input
      });

    case 'email_capture_create':
      return callInternalFn('ghoste-tools', {
        action: 'create_email_capture_link',
        userId: ctx.userId,
        ...input
      });

    case 'listening_party_create':
      return callInternalFn('ghoste-tools', {
        action: 'create_listening_party',
        userId: ctx.userId,
        ...input
      });

    case 'list_links':
      return callInternalFn('ghoste-tools', {
        action: 'list_links',
        userId: ctx.userId
      });

    // === META ADS TOOLS ===
    case 'meta_ads_draft': {
      // Create campaigns as drafts only
      const campaigns = input.campaigns || [];
      const results = [];

      for (const campaign of campaigns) {
        const result = await callInternalFn('meta-create-campaign', {
          userId: ctx.userId,
          mode: 'draft_only',
          ...campaign
        });
        results.push(result);
      }

      return { ok: true, campaigns: results, mode: 'draft_only' };
    }

    case 'meta_ads_publish': {
      // Launch draft campaigns to Meta
      const draftIds = input.draft_ids || [];
      const results = [];

      for (const draftId of draftIds) {
        // Fetch draft, then launch it
        const { data: draft } = await sb
          .from('meta_ad_campaigns')
          .select('*')
          .eq('id', draftId)
          .eq('user_id', ctx.userId)
          .maybeSingle();

        if (!draft) {
          throw new Error(`Draft ${draftId} not found`);
        }

        const result = await callInternalFn('meta-create-campaign', {
          userId: ctx.userId,
          mode: 'launch_now',
          draftId: draft.id,
          ...draft
        });
        results.push(result);
      }

      return { ok: true, campaigns: results, mode: 'launched' };
    }

    case 'meta_ads_list':
      return callInternalFn('meta-manage-campaigns', {
        userId: ctx.userId,
        action: 'list'
      });

    case 'meta_ads_toggle':
      return callInternalFn('meta-manage-campaigns', {
        userId: ctx.userId,
        action: 'toggle',
        campaign_id: input.campaign_id,
        status: input.status
      });

    case 'get_ads_context':
      return callInternalFn('meta-ads-context', {
        userId: ctx.userId
      });

    // === SOCIAL MEDIA TOOLS ===
    case 'social_post_schedule': {
      // Schedule post across platforms
      const { caption, media_urls, scheduled_at, platforms } = input;

      const { data: post, error } = await sb
        .from('social_posts')
        .insert({
          user_id: ctx.userId,
          caption: caption || '',
          media_urls: media_urls || [],
          scheduled_at: scheduled_at || new Date().toISOString(),
          target_accounts: platforms || [],
          status: 'scheduled'
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      return {
        ok: true,
        post,
        message: `Scheduled post for ${platforms?.join(', ') || 'all platforms'}`
      };
    }

    // === SPLIT SHEET TOOLS ===
    case 'split_create': {
      const { song_title, participants } = input;

      // Create split negotiation
      const { data: split, error } = await sb
        .from('split_negotiations')
        .insert({
          user_id: ctx.userId,
          song_title: song_title || 'Untitled',
          status: 'pending'
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      // Add participants
      const participantRecords = (participants || []).map((p: any) => ({
        split_negotiation_id: split.id,
        user_id: ctx.userId,
        email: p.email,
        name: p.name || '',
        split_percentage: p.split_percentage || 0,
        role: p.role || 'collaborator',
        status: 'pending'
      }));

      if (participantRecords.length > 0) {
        const { error: partError } = await sb
          .from('split_participants')
          .insert(participantRecords);

        if (partError) throw partError;
      }

      // Send invites
      await callInternalFn('split-send-invite', {
        userId: ctx.userId,
        negotiationId: split.id,
        participants
      }).catch(err => {
        console.error('[agentToolExecutor] Failed to send split invites:', err);
      });

      return {
        ok: true,
        split,
        message: `Created split for "${song_title}" with ${participants?.length || 0} participants`
      };
    }

    // === ANALYTICS TOOLS ===
    case 'analytics_refresh': {
      const { force = false } = input;

      // Get user's saved artist
      const { data: savedArtist } = await sb
        .from('saved_artists')
        .select('spotify_artist_id, artist_name')
        .eq('user_id', ctx.userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!savedArtist) {
        return {
          ok: false,
          error: 'No saved artist found. Save an artist first in the Analytics page.'
        };
      }

      // Trigger enrich
      const result = await callInternalFn('analytics-artist-enrich', {
        userId: ctx.userId,
        spotifyArtistId: savedArtist.spotify_artist_id,
        force
      });

      return {
        ok: true,
        artist: savedArtist,
        refreshed: result,
        message: `Refreshed analytics for ${savedArtist.artist_name}`
      };
    }

    // === CONTENT TOOLS ===
    case 'cover_art_generate':
      return callInternalFn('ghoste-tools', {
        action: 'generate_cover_art',
        userId: ctx.userId,
        ...input
      });

    case 'list_media_assets': {
      const { limit = 5, media_type } = input;

      let query = sb
        .from('ghoste_media_assets')
        .select('id, url, path, media_type, file_name, file_size, created_at')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false });

      if (media_type) {
        query = query.eq('media_type', media_type);
      }

      query = query.limit(limit);

      const { data: assets, error } = await query;

      if (error) throw error;

      return {
        ok: true,
        assets: assets || [],
        count: assets?.length || 0
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
