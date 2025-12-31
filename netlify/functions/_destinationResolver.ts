import { SupabaseClient } from '@supabase/supabase-js';

export interface DestinationInput {
  destination_url?: string;
  smart_link_id?: string;
  smart_link_slug?: string;
  draft?: {
    destination?: string | { url?: string; smart_link_id?: string; smart_link_slug?: string };
  };
}

export interface DestinationResult {
  ok: boolean;
  url?: string;
  smart_link_id?: string;
  error?: string;
  debug?: {
    received_keys: string[];
    resolution_path: string;
  };
}

/**
 * Resolve campaign destination URL from multiple input formats.
 * Works for all campaign styles (LINK_CLICKS, STREAMS, CONVERSIONS, etc.).
 *
 * Priority:
 * 1. destination_url (direct URL)
 * 2. smart_link_id (lookup by ID)
 * 3. smart_link_slug (lookup by slug)
 * 4. draft.destination (nested formats)
 */
export async function resolveDestination(
  input: DestinationInput,
  userId: string,
  supabase: SupabaseClient
): Promise<DestinationResult> {
  const receivedKeys = Object.keys(input).filter(k => input[k as keyof DestinationInput]);

  console.log('[resolveDestination] Input:', {
    destination_url: !!input.destination_url,
    smart_link_id: !!input.smart_link_id,
    smart_link_slug: !!input.smart_link_slug,
    draft_destination: !!input.draft?.destination,
    user_id: userId,
  });

  // Path 1: Direct destination_url
  if (input.destination_url && typeof input.destination_url === 'string' && input.destination_url.trim()) {
    const url = input.destination_url.trim();
    console.log('[resolveDestination] ✓ Using destination_url:', url);
    return {
      ok: true,
      url,
      debug: {
        received_keys: receivedKeys,
        resolution_path: 'destination_url',
      },
    };
  }

  // Path 2: Lookup by smart_link_id
  if (input.smart_link_id) {
    console.log('[resolveDestination] Looking up smart_link_id:', input.smart_link_id);

    const { data: link, error } = await supabase
      .from('smart_links')
      .select('id, slug, destination_url, user_id, owner_user_id')
      .eq('id', input.smart_link_id)
      .maybeSingle();

    if (error) {
      console.error('[resolveDestination] Query error:', error);
      return {
        ok: false,
        error: 'Failed to query smart_links',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_id_query_failed',
        },
      };
    }

    if (!link) {
      console.warn('[resolveDestination] Smart link not found:', input.smart_link_id);
      return {
        ok: false,
        error: 'Smart link not found',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_id_not_found',
        },
      };
    }

    // Check ownership
    const linkOwner = link.owner_user_id || link.user_id;
    if (linkOwner && linkOwner !== userId) {
      console.warn('[resolveDestination] Ownership mismatch:', {
        link_owner: linkOwner,
        user_id: userId,
      });
      return {
        ok: false,
        error: 'Smart link does not belong to user',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_id_ownership_failed',
        },
      };
    }

    // Use the smart link's destination_url or build from slug
    const url = link.destination_url || `https://ghoste.one/l/${link.slug}`;
    console.log('[resolveDestination] ✓ Resolved via smart_link_id:', url);

    return {
      ok: true,
      url,
      smart_link_id: link.id,
      debug: {
        received_keys: receivedKeys,
        resolution_path: 'smart_link_id',
      },
    };
  }

  // Path 3: Lookup by smart_link_slug
  if (input.smart_link_slug) {
    console.log('[resolveDestination] Looking up smart_link_slug:', input.smart_link_slug);

    const { data: link, error } = await supabase
      .from('smart_links')
      .select('id, slug, destination_url, user_id, owner_user_id')
      .eq('slug', input.smart_link_slug)
      .maybeSingle();

    if (error) {
      console.error('[resolveDestination] Query error:', error);
      return {
        ok: false,
        error: 'Failed to query smart_links',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_slug_query_failed',
        },
      };
    }

    if (!link) {
      console.warn('[resolveDestination] Smart link not found:', input.smart_link_slug);
      return {
        ok: false,
        error: 'Smart link not found',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_slug_not_found',
        },
      };
    }

    const linkOwner = link.owner_user_id || link.user_id;
    if (linkOwner && linkOwner !== userId) {
      console.warn('[resolveDestination] Ownership mismatch:', {
        link_owner: linkOwner,
        user_id: userId,
      });
      return {
        ok: false,
        error: 'Smart link does not belong to user',
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'smart_link_slug_ownership_failed',
        },
      };
    }

    const url = link.destination_url || `https://ghoste.one/l/${link.slug}`;
    console.log('[resolveDestination] ✓ Resolved via smart_link_slug:', url);

    return {
      ok: true,
      url,
      smart_link_id: link.id,
      debug: {
        received_keys: receivedKeys,
        resolution_path: 'smart_link_slug',
      },
    };
  }

  // Path 4: Check draft.destination (nested format)
  if (input.draft?.destination) {
    const dest = input.draft.destination;

    if (typeof dest === 'string' && dest.trim()) {
      const url = dest.trim();
      console.log('[resolveDestination] ✓ Using draft.destination (string):', url);
      return {
        ok: true,
        url,
        debug: {
          received_keys: receivedKeys,
          resolution_path: 'draft.destination_string',
        },
      };
    }

    if (typeof dest === 'object') {
      if (dest.url && typeof dest.url === 'string' && dest.url.trim()) {
        const url = dest.url.trim();
        console.log('[resolveDestination] ✓ Using draft.destination.url:', url);
        return {
          ok: true,
          url,
          debug: {
            received_keys: receivedKeys,
            resolution_path: 'draft.destination.url',
          },
        };
      }

      if (dest.smart_link_id) {
        return resolveDestination(
          { smart_link_id: dest.smart_link_id },
          userId,
          supabase
        );
      }

      if (dest.smart_link_slug) {
        return resolveDestination(
          { smart_link_slug: dest.smart_link_slug },
          userId,
          supabase
        );
      }
    }
  }

  // No valid destination found
  console.error('[resolveDestination] No valid destination provided:', {
    received_keys: receivedKeys,
  });

  return {
    ok: false,
    error: 'No valid destination provided',
    debug: {
      received_keys: receivedKeys,
      resolution_path: 'none',
    },
  };
}
