/**
 * Smart Link Idempotent Creation
 *
 * Ensures a smart link exists for a given URL without duplicates.
 * Reuses existing links when possible, creates new ones safely.
 *
 * CRITICAL: No "unique constraint violation" errors blocking ad creation.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';
import crypto from 'crypto';

export interface SmartLinkResult {
  id: string;
  slug: string;
  title: string;
  destination_url: string;
  created: boolean; // true if newly created, false if reused
}

/**
 * Normalize platform URL (remove tracking params, keep canonical)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove common tracking params
    const cleanParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      // Keep only essential params
      if (!key.startsWith('utm_') && !key.startsWith('fbclid') && key !== 'si') {
        cleanParams.set(key, value);
      }
    }

    parsed.search = cleanParams.toString();
    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Generate deterministic slug from URL
 */
function generateSlugFromUrl(url: string, suffix?: number): string {
  const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
  const base = `link-${hash}`;
  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Detect platform and extract URL fields
 */
function detectPlatform(url: string): {
  spotify_url?: string;
  apple_music_url?: string;
  youtube_url?: string;
  tidal_url?: string;
  soundcloud_url?: string;
  generic_url?: string;
} {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('spotify.com') || urlLower.includes('spotify:')) {
    return { spotify_url: url };
  } else if (urlLower.includes('apple.com') || urlLower.includes('music.apple')) {
    return { apple_music_url: url };
  } else if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { youtube_url: url };
  } else if (urlLower.includes('tidal.com')) {
    return { tidal_url: url };
  } else if (urlLower.includes('soundcloud.com')) {
    return { soundcloud_url: url };
  } else {
    return { generic_url: url };
  }
}

/**
 * Check if smart link exists for this URL
 */
async function findExistingLink(userId: string, platformFields: any): Promise<SmartLinkResult | null> {
  const supabase = getSupabaseAdmin();

  // Build query based on which platform URL is set
  let query = supabase
    .from('smart_links')
    .select('id, slug, title, spotify_url, apple_music_url, youtube_url, tidal_url, soundcloud_url')
    .eq('user_id', userId);

  if (platformFields.spotify_url) {
    query = query.eq('spotify_url', platformFields.spotify_url);
  } else if (platformFields.apple_music_url) {
    query = query.eq('apple_music_url', platformFields.apple_music_url);
  } else if (platformFields.youtube_url) {
    query = query.eq('youtube_url', platformFields.youtube_url);
  } else if (platformFields.tidal_url) {
    query = query.eq('tidal_url', platformFields.tidal_url);
  } else if (platformFields.soundcloud_url) {
    query = query.eq('soundcloud_url', platformFields.soundcloud_url);
  } else {
    // Generic URL - no exact match possible
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[findExistingLink] Query error:', error);
    return null;
  }

  if (data) {
    console.log('[findExistingLink] Found existing link:', data.id);

    // Resolve destination URL
    let destination_url = '';
    if (data.spotify_url) destination_url = data.spotify_url;
    else if (data.apple_music_url) destination_url = data.apple_music_url;
    else if (data.youtube_url) destination_url = data.youtube_url;
    else if (data.tidal_url) destination_url = data.tidal_url;
    else if (data.soundcloud_url) destination_url = data.soundcloud_url;
    else if (data.slug) destination_url = `https://ghoste.one/s/${data.slug}`;

    return {
      id: data.id,
      slug: data.slug || '',
      title: data.title || 'Untitled',
      destination_url,
      created: false,
    };
  }

  return null;
}

/**
 * Create new smart link with retry on slug conflict
 */
async function createNewLink(
  userId: string,
  platformFields: any,
  title: string,
  maxRetries: number = 2
): Promise<SmartLinkResult> {
  const supabase = getSupabaseAdmin();

  // Generate base slug from URL
  const baseUrl = platformFields.spotify_url || platformFields.apple_music_url || platformFields.youtube_url || platformFields.generic_url || '';
  const normalizedUrl = normalizeUrl(baseUrl);

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const slug = generateSlugFromUrl(normalizedUrl, attempt > 0 ? attempt : undefined);

    console.log('[createNewLink] Attempt', attempt + 1, 'with slug:', slug);

    const payload: any = {
      user_id: userId,
      title,
      slug,
      template: 'Modern',
      ...platformFields,
    };

    const { data, error } = await supabase
      .from('smart_links')
      .insert([payload])
      .select('id, slug, title, spotify_url, apple_music_url, youtube_url, tidal_url, soundcloud_url')
      .single();

    if (!error && data) {
      console.log('[createNewLink] Created new link:', data.id);

      // Resolve destination URL
      let destination_url = '';
      if (data.spotify_url) destination_url = data.spotify_url;
      else if (data.apple_music_url) destination_url = data.apple_music_url;
      else if (data.youtube_url) destination_url = data.youtube_url;
      else if (data.tidal_url) destination_url = data.tidal_url;
      else if (data.soundcloud_url) destination_url = data.soundcloud_url;
      else if (data.slug) destination_url = `https://ghoste.one/s/${data.slug}`;

      return {
        id: data.id,
        slug: data.slug || '',
        title: data.title || 'Untitled',
        destination_url,
        created: true,
      };
    }

    // Check if error is slug conflict
    if (error && error.code === '23505' && error.message.includes('slug')) {
      console.log('[createNewLink] Slug conflict, retrying...');
      lastError = error;
      continue;
    }

    // Other error - throw
    console.error('[createNewLink] Insert error:', error);
    lastError = error;
    break;
  }

  // All retries failed
  throw new Error(`Failed to create smart link after ${maxRetries + 1} attempts: ${lastError?.message || 'unknown error'}`);
}

/**
 * Ensure smart link exists for URL (idempotent)
 *
 * @param userId - User ID
 * @param inputUrl - Platform URL (Spotify, Apple Music, YouTube, etc.)
 * @param title - Optional title (defaults to "Auto-created Link")
 * @returns Smart link result (existing or newly created)
 */
export async function ensureSmartLinkFromUrl(
  userId: string,
  inputUrl: string,
  title?: string
): Promise<SmartLinkResult> {
  console.log('[ensureSmartLinkFromUrl] Ensuring link for:', { userId, inputUrl, title });

  // 1. Normalize URL
  const normalizedUrl = normalizeUrl(inputUrl);

  // 2. Detect platform
  const platformFields = detectPlatform(normalizedUrl);

  // 3. Check if link already exists
  const existing = await findExistingLink(userId, platformFields);
  if (existing) {
    console.log('[ensureSmartLinkFromUrl] Reusing existing link:', existing.id);
    return existing;
  }

  // 4. Create new link (with retry on conflict)
  const effectiveTitle = title || 'Auto-created Link';
  const newLink = await createNewLink(userId, platformFields, effectiveTitle);

  console.log('[ensureSmartLinkFromUrl] Created new link:', newLink.id);
  return newLink;
}

/**
 * Ensure smart link from URL with fallback
 *
 * Same as ensureSmartLinkFromUrl but returns the raw URL if creation fails.
 * This prevents ad creation from being blocked by link creation errors.
 *
 * @param userId - User ID
 * @param inputUrl - Platform URL
 * @param title - Optional title
 * @returns Smart link result OR fallback with raw URL
 */
export async function ensureSmartLinkFromUrlSafe(
  userId: string,
  inputUrl: string,
  title?: string
): Promise<SmartLinkResult> {
  try {
    return await ensureSmartLinkFromUrl(userId, inputUrl, title);
  } catch (error: any) {
    console.error('[ensureSmartLinkFromUrlSafe] Creation failed, using fallback:', error.message);

    // Return fallback result with raw URL
    return {
      id: '', // No DB record
      slug: '', // No slug
      title: title || 'Link',
      destination_url: inputUrl, // Use raw URL
      created: false,
    };
  }
}
