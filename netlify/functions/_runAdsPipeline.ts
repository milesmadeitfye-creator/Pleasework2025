/**
 * Run Ads Pipeline - Deterministic Flow
 *
 * This is the ONLY way to create ads from "run ads" chat command.
 * NO LLM responses, NO questions, NO contradictions.
 *
 * Flow:
 * 1. Extract intent (budget, duration, destination)
 * 2. Ensure smart link (auto-create if needed)
 * 3. Ensure media is Meta-ready
 * 4. Create campaign draft
 * 5. Create Meta objects (paused)
 * 6. Return short response
 */

import { createClient } from '@supabase/supabase-js';
import { getRunAdsContext } from './_runAdsContext';
import { ensureMediaMetaReady, pickBestMediaAssetForAds } from './_metaMediaHelper';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

interface RunAdsInput {
  user_id: string;
  conversation_id: string;
  text: string;
  attachments: Array<{
    media_asset_id: string;
    kind: string;
  }>;
}

interface RunAdsResult {
  ok: boolean;
  draft_id?: string;
  status?: 'draft_created' | 'meta_created_paused';
  response: string; // Short response for user
  blocker?: string;
}

/**
 * Extract budget from user message
 * Examples:
 * - "budget is $20" -> 20
 * - "budget 50" -> 50
 * - "$100 budget" -> 100
 * - no match -> default 10
 */
function extractBudget(text: string): number {
  const budgetPatterns = [
    /budget\s*(?:is\s*)?\$?(\d+)/i,
    /\$(\d+)\s*budget/i,
    /spend\s*\$?(\d+)/i,
  ];

  for (const pattern of budgetPatterns) {
    const match = text.match(pattern);
    if (match) {
      const budget = parseInt(match[1], 10);
      if (budget > 0 && budget <= 10000) {
        return budget;
      }
    }
  }

  return 10; // Safe default
}

/**
 * Extract duration from user message
 * Examples:
 * - "7 days" -> 7
 * - "run for 14 days" -> 14
 * - no match -> default 7
 */
function extractDuration(text: string): number {
  const durationPatterns = [
    /(\d+)\s*days?/i,
    /for\s*(\d+)\s*days?/i,
    /run\s*(\d+)\s*days?/i,
  ];

  for (const pattern of durationPatterns) {
    const match = text.match(pattern);
    if (match) {
      const days = parseInt(match[1], 10);
      if (days > 0 && days <= 90) {
        return days;
      }
    }
  }

  return 7; // Safe default
}

/**
 * Extract destination URL from message
 * Supports:
 * - open.spotify.com/track/...
 * - music.apple.com/...
 * - youtube.com/watch?v=...
 * - youtu.be/...
 */
function extractDestinationUrl(text: string): string | null {
  const urlPatterns = [
    /https?:\/\/open\.spotify\.com\/track\/[^\s]+/i,
    /https?:\/\/music\.apple\.com\/[^\s]+/i,
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s]+/i,
    /https?:\/\/youtu\.be\/[^\s]+/i,
    /https?:\/\/[^\s]+/i, // Generic URL fallback
  ];

  for (const pattern of urlPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Ensure smart link exists for URL
 * If URL is spotify/apple/youtube, try to create/find smart link
 * If fails, return raw URL (non-blocking)
 */
async function ensureSmartLinkFromUrl(
  user_id: string,
  url: string
): Promise<{ smart_link_id: string | null; destination_url: string }> {
  console.log('[ensureSmartLinkFromUrl]', url);

  // Check if smart link already exists for this destination
  const { data: existing } = await supabase
    .from('smart_links')
    .select('id, slug')
    .eq('owner_user_id', user_id)
    .eq('destination_url', url)
    .maybeSingle();

  if (existing) {
    console.log('[ensureSmartLinkFromUrl] Found existing:', existing.id);
    const smartLinkUrl = `https://ghoste.one/l/${existing.slug}`;
    return {
      smart_link_id: existing.id,
      destination_url: smartLinkUrl,
    };
  }

  // Try to create smart link (non-blocking)
  try {
    const slug = `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: newLink, error } = await supabase
      .from('smart_links')
      .insert({
        owner_user_id: user_id,
        slug,
        destination_url: url,
        title: 'Run Ads Link',
      })
      .select('id')
      .single();

    if (!error && newLink) {
      console.log('[ensureSmartLinkFromUrl] Created:', newLink.id);
      const smartLinkUrl = `https://ghoste.one/l/${slug}`;
      return {
        smart_link_id: newLink.id,
        destination_url: smartLinkUrl,
      };
    }
  } catch (err) {
    console.warn('[ensureSmartLinkFromUrl] Failed to create, using raw URL:', err);
  }

  // Fallback: use raw URL
  return {
    smart_link_id: null,
    destination_url: url,
  };
}

/**
 * Run Ads Pipeline
 * Entry point for "run ads" command
 */
export async function runAdsFromChat(input: RunAdsInput): Promise<RunAdsResult> {
  console.log('[runAdsFromChat] Starting:', input.user_id);

  // 1. Get context (single source of truth)
  const context = await getRunAdsContext(input.user_id);

  // 2. Check Meta connection (blocker)
  if (!context.hasMeta) {
    return {
      ok: false,
      response: "Meta isn't connected — connect it and say 'run ads' again.",
      blocker: 'meta_not_connected',
    };
  }

  // 3. Extract budget and duration
  const budget = extractBudget(input.text);
  const duration = extractDuration(input.text);

  console.log('[runAdsFromChat] Budget:', budget, 'Duration:', duration);

  // 4. Extract/ensure destination
  let destinationUrl = extractDestinationUrl(input.text);
  let smartLinkId: string | null = null;

  if (destinationUrl) {
    // Try to create/find smart link
    const smartLink = await ensureSmartLinkFromUrl(input.user_id, destinationUrl);
    smartLinkId = smartLink.smart_link_id;
    destinationUrl = smartLink.destination_url;
  } else if (context.latestSmartLinks.length > 0) {
    // Use most recent smart link
    const latest = context.latestSmartLinks[0];
    smartLinkId = latest.id;
    destinationUrl = `https://ghoste.one/l/${latest.slug}`;
  } else {
    // Blocker: no destination
    return {
      ok: false,
      response: "I need the song link.",
      blocker: 'no_destination',
    };
  }

  console.log('[runAdsFromChat] Destination:', destinationUrl);

  // 5. Handle media (non-blocking)
  let creativeMediaAssetId: string | null = null;
  let creativeUrl: string | null = null;

  if (input.attachments.length > 0) {
    const mediaAssetId = pickBestMediaAssetForAds(input.attachments);

    if (mediaAssetId) {
      console.log('[runAdsFromChat] Ensuring media Meta-ready:', mediaAssetId);

      const metaReady = await ensureMediaMetaReady(
        mediaAssetId,
        '/.netlify/functions'
      );

      if (metaReady.ok) {
        creativeMediaAssetId = mediaAssetId;
        creativeUrl = metaReady.meta_ready_url || null;
        console.log('[runAdsFromChat] Media ready:', creativeUrl);
      } else {
        console.warn('[runAdsFromChat] Media not ready:', metaReady.error);
        // Non-blocking: proceed with text-only ad
      }
    }
  }

  // 6. Create campaign draft
  const { data: draft, error: draftError } = await supabase
    .from('campaign_drafts')
    .insert({
      user_id: input.user_id,
      conversation_id: input.conversation_id,
      goal: 'song_promo',
      budget_daily: budget,
      duration_days: duration,
      destination_url: destinationUrl,
      smart_link_id: smartLinkId,
      creative_media_asset_id: creativeMediaAssetId,
      creative_url: creativeUrl,
      ad_account_id: context.meta?.ad_account_id,
      page_id: context.meta?.page_id,
      pixel_id: context.meta?.pixel_id,
      status: 'draft',
    })
    .select('id')
    .single();

  if (draftError || !draft) {
    console.error('[runAdsFromChat] Failed to create draft:', draftError);
    return {
      ok: false,
      response: "Something went wrong. Try again.",
      blocker: 'draft_creation_failed',
    };
  }

  console.log('[runAdsFromChat] Draft created:', draft.id);

  // 7. TODO: Create Meta objects in paused state
  // For now, just return draft created
  // In future: call meta-create-campaign-simple with paused=true

  return {
    ok: true,
    draft_id: draft.id,
    status: 'draft_created',
    response: "Say less. I'm on it. Approve to launch?",
  };
}
