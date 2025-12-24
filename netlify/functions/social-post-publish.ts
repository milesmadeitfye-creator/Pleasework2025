import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getMetaPageForUser, logSocialPostActivity } from './_metaPageHelper';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const META_APP_ID = process.env.META_APP_ID!;
const META_APP_SECRET = process.env.META_APP_SECRET!;

const DEBUG_VERSION = 'social-publish-2025-12-13-v7';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Helper: Safe boolean - treats null/undefined as default value
 */
const safeBool = (v: any, defaultValue = true) =>
  v === null || v === undefined ? defaultValue : !!v;

/**
 * Helper: Returns first non-empty string value from arguments
 */
const firstNonEmpty = (...vals: Array<any>) => {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
  }
  return null;
};

/**
 * Get Page Access Token for Facebook posting (required for Page posts)
 */
async function getPageAccessToken(pageId: string, userAccessToken: string) {
  const url = `https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(userAccessToken)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok || !j?.access_token) {
      return { ok: false, error: j?.error?.message || 'Failed to fetch page access token', raw: j };
    }
    return { ok: true, token: j.access_token };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Network error fetching page token', raw: null };
  }
}

/**
 * Get user's Meta permissions to check for specific grants
 */
async function getUserPermissions(userAccessToken: string) {
  const url = `https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(userAccessToken)}`;
  try {
    const r = await fetch(url);
    const j = await r.json();
    return { ok: r.ok, raw: j, data: j?.data || [] };
  } catch (error: any) {
    return { ok: false, raw: null, data: [] };
  }
}

/**
 * Check if a specific permission is granted
 */
function hasGrantedPermission(perms: any[], permName: string) {
  return perms?.some((p) => p?.permission === permName && p?.status === 'granted');
}

/**
 * CRITICAL: Ensures results object is NEVER empty
 * If results is missing or empty, fills it with fallback diagnostic info
 * This guarantees frontend always gets actionable debugging data
 */
function ensureResults(payload: any, fallbackStep = 'unknown_failure') {
  const out = payload ?? {};

  // Initialize results if missing or not an object
  if (!out.results || typeof out.results !== 'object') {
    out.results = {};
  }

  // If results is empty, populate with fallback diagnostic data
  if (Object.keys(out.results).length === 0) {
    out.results = {
      step: fallbackStep,
      debug_version: DEBUG_VERSION,
      ts: new Date().toISOString(),
      note: 'results was empty; normalized at response boundary',
    };
  } else {
    // Ensure required fields exist
    if (!out.results.step) out.results.step = fallbackStep;
    out.results.debug_version = out.results.debug_version || DEBUG_VERSION;
    out.results.ts = out.results.ts || new Date().toISOString();
  }

  return out;
}

/**
 * Normalized response wrapper - ALWAYS returns HTTP 200 with non-empty results
 * Applies ensureResults to guarantee debugging info is present
 */
function reply(payload: any, fallbackStep?: string) {
  const normalized = ensureResults(payload, fallbackStep);

  return {
    statusCode: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      debug_version: DEBUG_VERSION,
      ...normalized,
    }),
  };
}

/**
 * Structured failure response - NEVER returns empty results
 * Always includes step, error message, and context
 */
function fail(step: string, message: string, extra: Record<string, any> = {}) {
  return reply(
    {
      success: false,
      message,
      results: {
        step,
        error: message,
        timestamp: new Date().toISOString(),
        ...extra,
      },
    },
    step
  );
}

/**
 * Resolves which platforms should be attempted based on available credentials, user flags, and selected platforms
 * Returns null for platforms that shouldn't be attempted
 */
function resolveTargetAccounts(meta: any, selectedPlatforms: string[]): {
  facebook: { pageId: string; enabled: boolean } | null;
  instagram: { actorId: string; enabled: boolean } | null;
} {
  // Check if platforms are selected in the post
  const facebookSelected = selectedPlatforms?.includes('facebook') || false;
  const instagramSelected = selectedPlatforms?.includes('instagram') || false;

  // Facebook resolution order (prioritize page_id over facebook_page_id)
  const facebookPageId = meta.page_id || meta.facebook_page_id || meta.default_page_id;
  const facebookEnabled = meta.use_page_for_posting === true;

  // Instagram resolution order (prioritize instagram_actor_id)
  const instagramActorId = meta.instagram_actor_id || meta.instagram_id || meta.default_instagram_id;
  const instagramEnabled = meta.use_instagram_for_posting === true;

  console.log('[resolveTargetAccounts] Resolution:', {
    facebook: {
      selected: facebookSelected,
      pageId: facebookPageId ? 'present' : 'missing',
      enabled: facebookEnabled,
      sources: {
        page_id: meta.page_id || null,
        facebook_page_id: meta.facebook_page_id || null,
        default_page_id: meta.default_page_id || null,
      },
    },
    instagram: {
      selected: instagramSelected,
      actorId: instagramActorId ? 'present' : 'missing',
      enabled: instagramEnabled,
      sources: {
        instagram_actor_id: meta.instagram_actor_id || null,
        instagram_id: meta.instagram_id || null,
        default_instagram_id: meta.default_instagram_id || null,
      },
    },
  });

  return {
    facebook: facebookSelected && facebookPageId && facebookEnabled
      ? { pageId: facebookPageId, enabled: true }
      : null,
    instagram: instagramSelected && instagramActorId && instagramEnabled
      ? { actorId: instagramActorId, enabled: true }
      : null,
  };
}

/**
 * Posts content to Meta (Facebook/Instagram) using the Graph API
 * Supports text, images, videos, and carousels
 */
async function postToMeta({
  pageId,
  pageAccessToken,
  content,
  mediaUrls,
  postType,
}: {
  pageId: string;
  pageAccessToken: string;
  content: string;
  mediaUrls?: string[];
  postType: string;
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  console.log('[postToMeta] Publishing to Meta page:', pageId);
  console.log('[postToMeta] Post type:', postType);
  console.log('[postToMeta] Media count:', mediaUrls?.length || 0);

  try {
    let endpoint: string;
    let payload: any = {
      access_token: pageAccessToken,
    };

    const hasMedia = mediaUrls && mediaUrls.length > 0;
    const isVideo = hasMedia && mediaUrls[0].match(/\.(mp4|mov|avi|webm)(\?|$)/i);
    const isImage = hasMedia && mediaUrls[0].match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);

    if (isVideo) {
      // VIDEO POST
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      payload.file_url = mediaUrls[0];
      if (content) payload.description = content;

      console.log('[postToMeta] Posting video to:', endpoint);
    } else if (isImage && mediaUrls!.length === 1) {
      // SINGLE IMAGE POST
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      payload.url = mediaUrls[0];
      if (content) payload.caption = content;

      // Extract link from content if present
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        payload.caption = (payload.caption || '') + `\n\n${urlMatch[0]}`;
      }

      console.log('[postToMeta] Posting single image to:', endpoint);
    } else if (isImage && mediaUrls!.length > 1) {
      // MULTIPLE IMAGES (CAROUSEL)
      console.log('[postToMeta] Posting carousel with', mediaUrls.length, 'images');

      // Step 1: Upload each photo and get photo IDs
      const photoIds: string[] = [];

      for (const mediaUrl of mediaUrls) {
        const uploadEndpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
        const uploadPayload = {
          url: mediaUrl,
          published: false, // Don't publish yet
          access_token: pageAccessToken,
        };

        const uploadRes = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uploadPayload),
        });

        const uploadData = await uploadRes.json();

        // Check for Meta error in upload response
        if (uploadData?.error || !uploadRes.ok) {
          const metaError = uploadData?.error;
          console.error('[postToMeta] Failed to upload image:', uploadData);

          // Handle permissions error during upload
          if (metaError?.code === 200) {
            return {
              success: false,
              error:
                metaError.error_user_msg ||
                metaError.error_user_title ||
                'Meta permissions error (#200). Cannot upload images to this page.',
            };
          }

          return {
            success: false,
            error: metaError?.message || `Failed to upload carousel image (HTTP ${uploadRes.status})`,
          };
        }

        photoIds.push(uploadData.id);
        console.log('[postToMeta] Uploaded image:', uploadData.id);
      }

      // Step 2: Create the feed post with attached photos
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      payload.message = content;
      payload.attached_media = photoIds.map(id => ({ media_fbid: id }));

      console.log('[postToMeta] Creating carousel post with', photoIds.length, 'photos');
    } else {
      // TEXT / LINK ONLY POST
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      payload.message = content;

      // Extract link from content if present
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        payload.link = urlMatch[0];
      }

      console.log('[postToMeta] Posting text/link to:', endpoint);
    }

    // Make the API request
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // IMPORTANT: Meta can return HTTP 200 with an error object inside
    // Check for error object first, regardless of HTTP status
    if (data?.error) {
      const metaError = data.error;
      const code = metaError.code;
      const subcode = metaError.error_subcode;
      const userTitle = metaError.error_user_title;
      const userMsg = metaError.error_user_msg;

      console.error('[postToMeta] Meta API error:', {
        code,
        subcode,
        message: metaError.message,
        type: metaError.type,
        userTitle,
        userMsg,
      });

      // Explicit handling for permissions error (#200)
      if (code === 200) {
        return {
          success: false,
          error:
            userMsg ||
            userTitle ||
            'Meta permissions error (#200). Please ensure you granted pages_manage_posts and are posting to a page you manage.',
        };
      }

      // Handle other error codes with specific messages
      if (code === 190) {
        return {
          success: false,
          error: 'Meta access token expired. Please reconnect your Meta account.',
        };
      }

      if (code === 100) {
        return {
          success: false,
          error: metaError.message || 'Invalid Meta API request parameters.',
        };
      }

      // Generic Meta error
      return {
        success: false,
        error: metaError.message || userMsg || `Meta error (code ${code})`,
      };
    }

    // Also check HTTP status
    if (!res.ok) {
      console.error('[postToMeta] HTTP error:', { status: res.status, data });
      return {
        success: false,
        error: `Meta API returned ${res.status}: ${res.statusText}`,
      };
    }

    console.log('[postToMeta] Post published successfully:', data.id);

    return {
      success: true,
      postId: data.id,
    };
  } catch (error: any) {
    console.error('[postToMeta] Error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Process and publish a social post to the specified platforms
 */
async function publishSocialPost(postId: string): Promise<{
  success: boolean;
  message: string;
  results?: Record<string, any>;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('[publishSocialPost] Processing post:', postId);

  // Set status to "publishing" before starting
  await supabase
    .from('social_posts')
    .update({
      status: 'publishing',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  // Fetch the post
  const { data: post, error: postError } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (postError || !post) {
    console.error('[publishSocialPost] Post not found:', postError);
    return {
      success: false,
      message: 'Post not found',
      results: {
        step: 'load_social_post',
        postId,
        error: postError?.message || 'Post does not exist in database',
      },
    };
  }

  console.log('[publishSocialPost] Post details:', {
    id: post.id,
    userId: post.user_id,
    status: post.status,
    targetAccounts: post.target_accounts,
    platforms: post.platforms,
  });

  // Fetch Meta credentials (SINGLE SOURCE OF TRUTH)
  const { data: meta, error: metaError } = await supabase
    .from('meta_credentials')
    .select('access_token, facebook_page_id, page_id, default_page_id, instagram_id, instagram_actor_id, default_instagram_id, is_active, use_page_for_posting, use_instagram_for_posting')
    .eq('user_id', post.user_id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (metaError || !meta) {
    console.error('[publishSocialPost] meta_credentials not found:', metaError);
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        error_message: 'Meta account not connected or inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return {
      success: false,
      message: 'Meta account not connected or inactive',
      results: {
        step: 'meta_credentials_check',
        error: metaError?.message || 'No active Meta credentials found',
        hasAccessToken: false,
      },
    };
  }

  // CRITICAL: Validate access token first
  if (!meta.access_token) {
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        error_message: 'Missing Meta access token',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return {
      success: false,
      message: 'Missing Meta access token',
      results: {
        step: 'validate_access_token',
        error: 'access_token is null or empty',
        meta: { hasToken: false },
      },
    };
  }

  // Resolve platform IDs using firstNonEmpty helper
  const pageId = firstNonEmpty(
    meta?.facebook_page_id,
    meta?.page_id,
    meta?.default_page_id
  );

  const igActorId = firstNonEmpty(
    meta?.instagram_actor_id,
    meta?.instagram_id,
    meta?.default_instagram_id
  );

  // Use safeBool to handle null/undefined flags (default to true if not explicitly set)
  const fbEnabled = safeBool(meta?.page_posting_enabled, true) && safeBool(meta?.use_page_for_posting, true);
  const igEnabled = safeBool(meta?.instagram_posting_enabled, true) && safeBool(meta?.use_instagram_for_posting, true);

  const platforms_available = {
    facebook: pageId ? { pageId } : null,
    instagram: igActorId ? { actorId: igActorId } : null,
  };

  const canFacebook = !!pageId && fbEnabled;
  const canInstagram = !!igActorId && igEnabled;

  console.log('[publishSocialPost] Platform resolution:', {
    facebook: { id: pageId ? 'present' : 'missing', enabled: fbEnabled, can: canFacebook },
    instagram: { id: igActorId ? 'present' : 'missing', enabled: igEnabled, can: canInstagram },
    meta_fields: {
      facebook_page_id: meta?.facebook_page_id ?? null,
      page_id: meta?.page_id ?? null,
      default_page_id: meta?.default_page_id ?? null,
      instagram_actor_id: meta?.instagram_actor_id ?? null,
      instagram_id: meta?.instagram_id ?? null,
      default_instagram_id: meta?.default_instagram_id ?? null,
      page_posting_enabled: meta?.page_posting_enabled ?? null,
      instagram_posting_enabled: meta?.instagram_posting_enabled ?? null,
      use_page_for_posting: meta?.use_page_for_posting ?? null,
      use_instagram_for_posting: meta?.use_instagram_for_posting ?? null,
    }
  });

  if (!canFacebook && !canInstagram) {
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        error_message: 'No platforms available for posting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId);

    return {
      success: false,
      message: 'No platforms available for posting',
      results: {
        step: 'validate_platforms',
        error: 'Neither Facebook nor Instagram is configured and enabled',
        debug_version: DEBUG_VERSION,
        timestamp: new Date().toISOString(),
        platforms_available,
        meta: {
          facebook_page_id: meta?.facebook_page_id ?? null,
          page_id: meta?.page_id ?? null,
          default_page_id: meta?.default_page_id ?? null,
          instagram_actor_id: meta?.instagram_actor_id ?? null,
          instagram_id: meta?.instagram_id ?? null,
          default_instagram_id: meta?.default_instagram_id ?? null,
          page_posting_enabled: meta?.page_posting_enabled ?? null,
          instagram_posting_enabled: meta?.instagram_posting_enabled ?? null,
          use_page_for_posting: meta?.use_page_for_posting ?? null,
          use_instagram_for_posting: meta?.use_instagram_for_posting ?? null,
        },
      },
    };
  }

  // Fetch media assets
  const { data: assets } = await supabase
    .from('social_media_assets')
    .select('*')
    .eq('post_id', postId);

  const mediaUrls = assets?.map((asset) => {
    const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.path);
    return data.publicUrl;
  });

  console.log('[publishSocialPost] Media assets:', mediaUrls?.length || 0);

  const platforms_results: Record<string, any> = {};
  let anySuccess = false;

  // Publish to Facebook (if capable)
  if (canFacebook) {
    console.log('[publishSocialPost] Publishing to Facebook page:', pageId);

    // Step 1: Check for pages_manage_posts permission
    if (meta.page_posting_enabled === false) {
      console.error('[publishSocialPost] Missing pages_manage_posts permission');
      platforms_results.facebook = {
        success: false,
        step: 'facebook_permissions',
        error: 'Missing pages_manage_posts permission. Reconnect Meta and approve Facebook Page posting permissions.',
        missing: ['pages_manage_posts'],
      };
    } else {
      // Step 2: Get Page Access Token (required for Page posting)
      const tokenResult = await getPageAccessToken(pageId!, meta.access_token);
      if (!tokenResult.ok) {
        console.error('[publishSocialPost] Facebook page token failed:', tokenResult.error);
        platforms_results.facebook = {
          success: false,
          step: 'facebook_page_token',
          error: tokenResult.error,
          raw: tokenResult.raw,
        };
      } else {
        const pageToken = tokenResult.token;

        // Step 3: Post to Facebook Page feed using Page Access Token
      const fbUrl = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      const body = new URLSearchParams();
      body.set('message', post.content || post.caption || '');
      body.set('access_token', pageToken);

      if (post.link_url) {
        body.set('link', post.link_url);
      }

      try {
        const fbRes = await fetch(fbUrl, { method: 'POST', body });
        const fbJson = await fbRes.json();

        if (!fbRes.ok || fbJson.error) {
          const errorMsg = fbJson?.error?.message || 'Facebook publish failed';

          // Detect if posting to a group instead of page
          if (errorMsg.toLowerCase().includes('group') || errorMsg.toLowerCase().includes('unsupported')) {
            platforms_results.facebook = {
              success: false,
              step: 'facebook_publish',
              error: 'You can only publish to Pages. Switch target to a Page.',
              code: fbJson?.error?.code,
              subcode: fbJson?.error?.error_subcode,
              raw: fbJson,
            };
          } else {
            platforms_results.facebook = {
              success: false,
              step: 'facebook_publish',
              error: errorMsg,
              code: fbJson?.error?.code,
              subcode: fbJson?.error?.error_subcode,
              raw: fbJson,
            };
          }
        } else {
          console.log('[publishSocialPost] Facebook success:', fbJson.id);
          platforms_results.facebook = {
            success: true,
            step: 'facebook_publish',
            post_id: fbJson?.id || null,
            raw: fbJson,
          };
          anySuccess = true;
        }
      } catch (err: any) {
          console.error('[publishSocialPost] Facebook network error:', err.message);
          platforms_results.facebook = {
            success: false,
            step: 'facebook_publish',
            error: err.message || 'Network error',
          };
        }
      }
    }
  }

  // Publish to Instagram (if capable)
  if (canInstagram) {
    console.log('[publishSocialPost] Publishing to Instagram actor:', igActorId);

    // Step 1: Check for instagram_content_publish permission (use stored flag first for speed)
    if (meta.instagram_posting_enabled === false) {
      console.error('[publishSocialPost] Missing instagram_content_publish permission (from stored flag)');
      platforms_results.instagram = {
        success: false,
        step: 'instagram_permissions',
        error: 'Missing instagram_content_publish permission. Reconnect Meta and approve Instagram posting permissions.',
        missing: ['instagram_content_publish'],
      };
    } else {
      // Double-check with live API call if flag is not explicitly false (for backwards compatibility)
      const permsRes = await getUserPermissions(meta.access_token);
      const granted = permsRes.ok ? permsRes.data : [];

      if (!hasGrantedPermission(granted, 'instagram_content_publish')) {
        console.error('[publishSocialPost] Missing instagram_content_publish permission (from live check)');
        platforms_results.instagram = {
          success: false,
          step: 'instagram_permissions',
          error: 'Missing instagram_content_publish permission. Reconnect Meta and approve Instagram posting permissions.',
          missing: ['instagram_content_publish'],
          raw: permsRes.raw,
        };
      } else {
      // Step 2: Check for media
      if (!post.image_url && (!mediaUrls || mediaUrls.length === 0)) {
        platforms_results.instagram = {
          success: false,
          step: 'instagram_validate',
          error: 'Instagram requires an image or video',
        };
      } else {
        const imageUrl = post.image_url || mediaUrls?.[0];

        try {
          // Step 3: Create media container
          const containerParams = new URLSearchParams({
            image_url: imageUrl,
            caption: post.caption || post.content || '',
            access_token: meta.access_token,
          });

          const containerRes = await fetch(
            `https://graph.facebook.com/v21.0/${igActorId}/media`,
            {
              method: 'POST',
              body: containerParams,
            }
          );

          const containerData = await containerRes.json();

          if (containerData.error || !containerRes.ok || !containerData.id) {
            const igError = containerData.error;
            platforms_results.instagram = {
              success: false,
              step: 'instagram_create_container',
              error: igError?.message || `Instagram container creation failed (code ${igError?.code})`,
              code: igError?.code,
              subcode: igError?.error_subcode,
              raw: containerData,
            };
          } else {
            console.log('[publishSocialPost] Instagram container created:', containerData.id);

            // Step 4: Publish the container
            const publishParams = new URLSearchParams({
              creation_id: containerData.id,
              access_token: meta.access_token,
            });

            const publishRes = await fetch(
              `https://graph.facebook.com/v21.0/${igActorId}/media_publish`,
              {
                method: 'POST',
                body: publishParams,
              }
            );

            const publishData = await publishRes.json();

            if (publishData.error || !publishRes.ok) {
              const igError = publishData.error;
              platforms_results.instagram = {
                success: false,
                step: 'instagram_publish',
                error: igError?.message || `Instagram publish failed (code ${igError?.code})`,
                code: igError?.code,
                subcode: igError?.error_subcode,
                raw: publishData,
              };
            } else {
              console.log('[publishSocialPost] Instagram success:', publishData.id);
              platforms_results.instagram = {
                success: true,
                step: 'instagram_publish',
                post_id: publishData.id,
                raw: publishData,
              };
              anySuccess = true;
            }
          }
        } catch (err: any) {
          console.error('[publishSocialPost] Instagram network error:', err.message);
          platforms_results.instagram = {
            success: false,
            step: 'instagram_error',
            error: err.message || 'Network error',
          };
        }
      }
      }
    }
  }

  // Determine attempted platforms
  const attempted = { facebook: canFacebook, instagram: canInstagram };

  // Calculate summary
  const summary = {
    total_platforms: (attempted.facebook ? 1 : 0) + (attempted.instagram ? 1 : 0),
    successes: ['facebook', 'instagram'].filter((p) => platforms_results?.[p]?.success).length,
    failures: ['facebook', 'instagram'].filter((p) => platforms_results?.[p] && !platforms_results[p]?.success).length,
  };

  // Determine overall status
  const hasFailures = Object.values(platforms_results).some((r: any) => !r.success);
  let newStatus: string;
  let errorMessage: string | null = null;

  if (anySuccess && !hasFailures) {
    newStatus = 'published';
    console.log('[publishSocialPost] All requested platforms succeeded');
  } else if (anySuccess && hasFailures) {
    newStatus = 'published';
    const failedErrors = Object.entries(platforms_results)
      .filter(([_, r]: any) => !r.success && r.error)
      .map(([platform, r]: any) => `${platform}: ${r.error}`)
      .join('; ');
    errorMessage = failedErrors || 'Some platforms failed';
    console.log('[publishSocialPost] Partial success:', errorMessage);
  } else {
    newStatus = 'failed';
    const allErrors = Object.entries(platforms_results)
      .filter(([_, r]: any) => r.error)
      .map(([platform, r]: any) => `${platform}: ${r.error}`)
      .filter(Boolean);

    errorMessage = allErrors.length > 0
      ? allErrors.join('; ')
      : 'Failed to publish';

    console.log('[publishSocialPost] All platforms failed:', errorMessage);
  }

  // Update final post status
  await supabase
    .from('social_posts')
    .update({
      status: newStatus,
      published_at: anySuccess ? new Date().toISOString() : null,
      error_message: errorMessage,
      platform_results: platforms_results,
      meta_result: platforms_results, // Also save to meta_result for backwards compatibility
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  console.log('[publishSocialPost] Final status:', newStatus, 'Results:', JSON.stringify(platforms_results));

  // Build final results object - NEVER empty
  const finalResults = {
    step: anySuccess ? 'publish_success' : 'publish_failed',
    timestamp: new Date().toISOString(),
    debug_version: DEBUG_VERSION,
    platforms_attempted: attempted,
    platforms_available,
    platforms_results,
    summary,
  };

  return {
    success: anySuccess,
    message: anySuccess ? 'Post published successfully' : 'Failed to publish post',
    results: finalResults,
  };
}

export const handler: Handler = async (event) => {
  console.log(`[social-post-publish] Request received (v${DEBUG_VERSION})`);

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    console.warn('[social-post-publish] Invalid method:', event.httpMethod);
    return fail('validate_method', 'Only POST method is allowed', {
      method: event.httpMethod,
    });
  }

  // Parse postId early for error context
  let postId: string | undefined;

  try {
    // Get user from Supabase auth header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[social-post-publish] Missing or invalid authorization header');
      return fail('auth_header_missing', 'Missing or invalid authorization header', {
        hasAuthHeader: !!authHeader,
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify the JWT and get the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[social-post-publish] Auth verification failed', authError);
      return fail('auth_verification', 'Authentication failed', {
        error: authError?.message || 'Invalid token',
      });
    }

    console.log('[social-post-publish] User verified:', user.id.substring(0, 8) + '...');

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    postId = body.postId;

    if (!postId) {
      return fail('validate_request', 'Missing postId in request body', {
        bodyKeys: Object.keys(body),
      });
    }

    console.log('[social-post-publish] Processing post:', postId);

    // Verify post belongs to user
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return fail('load_post', 'Post not found', {
        postId,
        error: postError?.message || 'Post does not exist',
      });
    }

    if (post.user_id !== user.id) {
      return fail('verify_ownership', 'Not authorized to publish this post', {
        postId,
        userId: user.id.substring(0, 8) + '...',
        postUserId: post.user_id.substring(0, 8) + '...',
      });
    }

    // Publish the post
    console.log('[social-post-publish] Calling publishSocialPost for:', postId);
    const result = await publishSocialPost(postId);

    console.log('[social-post-publish] Publish result:', {
      success: result.success,
      message: result.message,
      hasResults: !!result.results,
      resultsKeys: result.results ? Object.keys(result.results) : [],
    });

    // Use reply to ensure results is never empty
    return reply(result, result.success ? 'published' : 'publish_failed');
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    const errorStack = err?.stack?.split('\n').slice(0, 5).join('\n') || '';

    console.error('[social-post-publish] UNHANDLED EXCEPTION:', {
      message: errorMsg,
      postId: postId || 'unknown',
      stack: errorStack,
    });

    // Try to update the post status with the error (if we have postId)
    if (postId) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        });

        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            error_message: `Unhandled exception: ${errorMsg}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', postId);
      } catch (updateErr) {
        console.error('[social-post-publish] Failed to update post status:', updateErr);
      }
    }

    // Return structured error with full context
    return fail('exception_handler', `Unhandled exception: ${errorMsg}`, {
      postId: postId || null,
      error: errorMsg,
      stack: errorStack,
      eventMethod: event.httpMethod,
      hasBody: !!event.body,
    });
  }
};
