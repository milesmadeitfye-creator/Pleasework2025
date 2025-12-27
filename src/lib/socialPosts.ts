import { supabase } from '@/lib/supabase.client';

export type SocialPostType = 'standard' | 'story' | 'short' | 'carousel';
export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  user_id: string;
  content: string;
  platforms: string[];
  post_type: SocialPostType;
  status: SocialPostStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialMediaAsset {
  id: string;
  user_id: string;
  post_id: string;
  bucket: string;
  path: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface CreateSocialPostPayload {
  content: string;
  platforms: string[];
  post_type: SocialPostType;
  scheduled_at?: string | null;
  status?: SocialPostStatus;
  assets?: {
    bucket: string;
    path: string;
    mime_type: string;
    size_bytes: number;
  }[];
  target_accounts?: {
    facebook?: boolean;
    instagram?: boolean;
  };
}

/**
 * Creates a new social post with optional media assets
 * @param payload - Post data and assets
 * @returns Created post with assets
 */
export async function createSocialPost(
  payload: CreateSocialPostPayload
): Promise<{ post: SocialPost; assets: SocialMediaAsset[] }> {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const postData = {
      user_id: user.id,
      content: payload.content,
      platforms: payload.platforms,
      post_type: payload.post_type,
      status: payload.status || (payload.scheduled_at ? 'scheduled' : 'draft'),
      scheduled_at: payload.scheduled_at || null,
      target_accounts: payload.target_accounts || { facebook: false, instagram: false },
    };

    console.log('[createSocialPost] Creating post:', postData);

    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .insert(postData)
      .select()
      .single();

    if (postError) {
      console.error('[createSocialPost] Error creating post:', postError);
      throw new Error(`Failed to create post: ${postError.message}`);
    }

    if (!post) {
      throw new Error('Post created but no data returned');
    }

    console.log('[createSocialPost] Post created:', post.id);

    let assets: SocialMediaAsset[] = [];

    if (payload.assets && payload.assets.length > 0) {
      const assetsData = payload.assets.map((asset) => ({
        user_id: user.id,
        post_id: post.id,
        bucket: asset.bucket,
        path: asset.path,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
      }));

      console.log('[createSocialPost] Creating assets:', assetsData.length);

      const { data: createdAssets, error: assetsError } = await supabase
        .from('social_media_assets')
        .insert(assetsData)
        .select();

      if (assetsError) {
        console.error('[createSocialPost] Error creating assets:', assetsError);
        console.warn('[createSocialPost] Post created but assets failed');
      } else {
        assets = createdAssets || [];
        console.log('[createSocialPost] Assets created:', assets.length);
      }
    }

    return { post, assets };
  } catch (error: any) {
    console.error('[createSocialPost] Error:', error);
    throw error;
  }
}

/**
 * Fetches social posts for the current user
 * @param limit - Maximum number of posts to fetch
 * @returns List of posts with their assets
 */
export async function fetchSocialPosts(
  limit: number = 50
): Promise<{ posts: SocialPost[]; assetsByPostId: Record<string, SocialMediaAsset[]> }> {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('User not authenticated');
    }

    const { data: posts, error: postsError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (postsError) {
      console.error('[fetchSocialPosts] Error fetching posts:', postsError);
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }

    if (!posts || posts.length === 0) {
      return { posts: [], assetsByPostId: {} };
    }

    const postIds = posts.map((p) => p.id);

    const { data: assets, error: assetsError } = await supabase
      .from('social_media_assets')
      .select('*')
      .in('post_id', postIds);

    if (assetsError) {
      console.error('[fetchSocialPosts] Error fetching assets:', assetsError);
    }

    const assetsByPostId: Record<string, SocialMediaAsset[]> = {};
    if (assets) {
      for (const asset of assets) {
        if (!assetsByPostId[asset.post_id]) {
          assetsByPostId[asset.post_id] = [];
        }
        assetsByPostId[asset.post_id].push(asset);
      }
    }

    return { posts, assetsByPostId };
  } catch (error: any) {
    console.error('[fetchSocialPosts] Error:', error);
    throw error;
  }
}

/**
 * Updates a social post's status
 * @param postId - Post ID
 * @param status - New status
 * @param errorMessage - Optional error message for failed posts
 */
export async function updateSocialPostStatus(
  postId: string,
  status: SocialPostStatus,
  errorMessage?: string | null
): Promise<void> {
  try {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'published') {
      updateData.posted_at = new Date().toISOString();
    }

    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('social_posts')
      .update(updateData)
      .eq('id', postId);

    if (error) {
      console.error('[updateSocialPostStatus] Error:', error);
      throw new Error(`Failed to update post status: ${error.message}`);
    }

    console.log('[updateSocialPostStatus] Status updated:', postId, status);
  } catch (error: any) {
    console.error('[updateSocialPostStatus] Error:', error);
    throw error;
  }
}

/**
 * Deletes a social post and its associated assets
 * @param postId - Post ID to delete
 */
export async function deleteSocialPost(postId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', postId);

    if (error) {
      console.error('[deleteSocialPost] Error:', error);
      throw new Error(`Failed to delete post: ${error.message}`);
    }

    console.log('[deleteSocialPost] Post deleted:', postId);
  } catch (error: any) {
    console.error('[deleteSocialPost] Error:', error);
    throw error;
  }
}

/**
 * Publishes a social post to the selected platforms
 * @param postId - Post ID to publish
 */
export async function publishSocialPost(postId: string): Promise<{
  success: boolean;
  message: string;
  results?: Record<string, any>;
}> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    console.log('[publishSocialPost] Publishing post:', postId);

    // Always use relative path for Netlify functions
    const functionUrl = '/.netlify/functions/social-post-publish';
    console.log('[publishSocialPost] Calling function:', functionUrl);

    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ postId }),
    });

    console.log('[publishSocialPost] Response status:', res.status, res.statusText);

    // Try to parse JSON response
    let data: any;
    try {
      const responseText = await res.text();
      console.log('[publishSocialPost] Response body (first 500 chars):', responseText.substring(0, 500));

      if (responseText) {
        data = JSON.parse(responseText);

        // Log full response with debug_version for troubleshooting
        console.log('[social-post-publish] FULL RESPONSE:', {
          debug_version: data?.debug_version,
          success: data?.success,
          message: data?.message,
          step: data?.results?.step,
          results: data?.results,
        });

        // Log debug version prominently
        if (data?.debug_version) {
          console.log(`[social-post-publish] 🔍 Debug version: ${data.debug_version}`);
        }
      } else {
        data = null;
      }
    } catch (parseError) {
      console.error('[publishSocialPost] Failed to parse JSON response:', parseError);
      throw new Error(`Server error (${res.status}): Invalid JSON response from server`);
    }

    // Check success field instead of HTTP status (function now returns 200 always)
    if (!data?.success) {
      console.error('[publishSocialPost] Publish failed:', {
        debug_version: data?.debug_version,
        step: data?.results?.step,
        message: data?.message,
        error: data?.results?.error,
        results: data?.results,
      });

      // Build error message with step context
      let errorMessage = data?.message || 'Failed to publish post';

      if (data?.results?.step) {
        errorMessage = `${errorMessage} (step: ${data.results.step})`;
      }

      // Add specific context from results
      if (data?.results?.error && data.results.error !== errorMessage) {
        errorMessage += ` - ${data.results.error}`;
      }

      throw new Error(errorMessage);
    }

    console.log('[publishSocialPost] Post published successfully:', {
      debug_version: data?.debug_version,
      message: data?.message,
      results: data?.results,
    });

    return data;
  } catch (error: any) {
    console.error('[publishSocialPost] Error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    // Provide specific error messages for common issues
    if (error.message === 'Failed to fetch') {
      throw new Error('Network error: Unable to reach server. Check your internet connection or try refreshing the page.');
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Connection error: Unable to connect to the publishing service.');
    }

    // Re-throw with the original message (already formatted)
    throw error;
  }
}
