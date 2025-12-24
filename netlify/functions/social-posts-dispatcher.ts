import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getMetaPageForUser, logSocialPostActivity } from './_metaPageHelper';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
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

        if (!uploadRes.ok) {
          console.error('[postToMeta] Failed to upload image:', uploadData);
          return {
            success: false,
            error: uploadData?.error?.message || 'Failed to upload carousel image',
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

    if (!res.ok) {
      console.error('[postToMeta] Meta API error:', data);
      return {
        success: false,
        error: data?.error?.message || 'Failed to post to Meta',
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
 * Processes scheduled social posts that are due for publishing
 */
async function processScheduledPosts(): Promise<{
  processed: number;
  published: number;
  failed: number;
  results: Array<{ postId: string; success: boolean; error?: string }>;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log('[processScheduledPosts] Starting scheduled posts processing');

  // Find all scheduled posts that are due (scheduled_at <= now())
  const { data: posts, error: queryError } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(50); // Process max 50 at a time

  if (queryError) {
    console.error('[processScheduledPosts] Query error:', queryError);
    throw new Error(`Failed to query scheduled posts: ${queryError.message}`);
  }

  if (!posts || posts.length === 0) {
    console.log('[processScheduledPosts] No scheduled posts due');
    return {
      processed: 0,
      published: 0,
      failed: 0,
      results: [],
    };
  }

  console.log('[processScheduledPosts] Found', posts.length, 'scheduled posts due for publishing');

  const results: Array<{ postId: string; success: boolean; error?: string }> = [];
  let published = 0;
  let failed = 0;

  // Process each post
  for (const post of posts) {
    console.log('[processScheduledPosts] Processing post:', post.id);

    try {
      // Fetch associated media assets
      const { data: assets } = await supabase
        .from('social_media_assets')
        .select('*')
        .eq('post_id', post.id);

      const mediaUrls = assets?.map((asset) => {
        const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.path);
        return data.publicUrl;
      });

      // Process each platform
      let anySuccess = false;
      let anyFailure = false;
      const platformResults: Record<string, any> = {};

      for (const platform of post.platforms || []) {
        console.log('[processScheduledPosts] Publishing to platform:', platform);

        if (platform === 'meta' || platform === 'facebook' || platform === 'instagram') {
          // Log dispatch
          await logSocialPostActivity({
            postId: post.id,
            userId: post.user_id,
            platform: 'meta',
            step: 'scheduled_dispatch',
            status: 'success',
            message: 'Processing scheduled post',
          });

          // Get Meta page
          const metaPage = await getMetaPageForUser(post.user_id);

          if (!metaPage) {
            console.error('[processScheduledPosts] No Meta page found for user');
            platformResults[platform] = {
              success: false,
              error: 'Meta page not connected',
            };

            await logSocialPostActivity({
              postId: post.id,
              userId: post.user_id,
              platform: 'meta',
              step: 'meta_request',
              status: 'error',
              message: 'No Meta page found',
            });

            anyFailure = true;
            continue;
          }

          // Post to Meta
          const metaResult = await postToMeta({
            pageId: metaPage.pageId,
            pageAccessToken: metaPage.pageAccessToken,
            content: post.content || '',
            mediaUrls,
            postType: post.post_type || 'standard',
          });

          platformResults[platform] = metaResult;

          if (metaResult.success) {
            anySuccess = true;

            // Log success
            await logSocialPostActivity({
              postId: post.id,
              userId: post.user_id,
              platform: 'meta',
              step: 'meta_response',
              status: 'success',
              message: 'Scheduled post published successfully',
              payload: {
                platform_post_id: metaResult.postId,
              },
            });

            // Update post with Meta post ID
            await supabase
              .from('social_posts')
              .update({
                platform_post_id: metaResult.postId,
              })
              .eq('id', post.id);
          } else {
            anyFailure = true;

            // Log error
            await logSocialPostActivity({
              postId: post.id,
              userId: post.user_id,
              platform: 'meta',
              step: 'meta_response',
              status: 'error',
              message: metaResult.error || 'Failed to publish scheduled post',
              payload: {
                error: metaResult.error,
              },
            });
          }
        } else {
          // Platform not yet implemented
          console.log(`[processScheduledPosts] Platform ${platform} not yet implemented`);
          platformResults[platform] = {
            success: false,
            error: 'Platform not yet supported',
          };
          anyFailure = true;
        }
      }

      // Update post status
      let newStatus: string;
      let errorMessage: string | null = null;

      if (anySuccess && !anyFailure) {
        newStatus = 'published';
        published++;
      } else if (anySuccess && anyFailure) {
        newStatus = 'published';
        errorMessage = 'Some platforms failed to publish';
        published++;
      } else {
        newStatus = 'failed';
        errorMessage = Object.values(platformResults)
          .map((r: any) => r.error)
          .filter(Boolean)
          .join('; ');
        failed++;
      }

      await supabase
        .from('social_posts')
        .update({
          status: newStatus,
          posted_at: anySuccess ? new Date().toISOString() : null,
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      results.push({
        postId: post.id,
        success: anySuccess,
        error: errorMessage || undefined,
      });

      console.log('[processScheduledPosts] Post processed:', {
        postId: post.id,
        status: newStatus,
        success: anySuccess,
      });
    } catch (error: any) {
      console.error('[processScheduledPosts] Error processing post:', post.id, error);

      // Mark as failed
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: error.message || 'Failed to process scheduled post',
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id);

      results.push({
        postId: post.id,
        success: false,
        error: error.message,
      });

      failed++;
    }
  }

  console.log('[processScheduledPosts] Processing complete:', {
    processed: posts.length,
    published,
    failed,
  });

  return {
    processed: posts.length,
    published,
    failed,
    results,
  };
}

export const handler: Handler = async (event) => {
  console.log('[social-posts-dispatcher] Request received');

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Support both GET and POST for Netlify scheduled functions
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // Process scheduled posts
    const result = await processScheduledPosts();

    return jsonResponse(200, {
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[social-posts-dispatcher] Fatal error:', {
      message: err.message,
      stack: err.stack,
    });
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message,
    });
  }
};
