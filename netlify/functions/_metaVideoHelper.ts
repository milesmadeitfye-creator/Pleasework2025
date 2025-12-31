/**
 * Meta Video Upload and Processing Helper
 * Handles video upload, thumbnail attachment, and processing polling
 */

const DEFAULT_VIDEO_THUMBNAIL_URL =
  process.env.DEFAULT_VIDEO_THUMBNAIL_URL ||
  'https://knvvdeomfncujsiiqxsg.supabase.co/storage/v1/object/public/public-assets/ads/default-video-thumbnail.png';

const MAX_POLL_ATTEMPTS = 12; // 12 attempts x 7.5s = 90s max wait
const POLL_INTERVAL_MS = 7500; // 7.5 seconds

interface VideoStatus {
  video_status: 'uploading' | 'processing' | 'ready' | 'error';
  processing_progress?: number;
  permalink_url?: string;
  error?: {
    message: string;
    code?: number;
  };
}

interface VideoUploadResult {
  video_id: string;
  status: VideoStatus;
  thumbnail_url: string;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload video to Meta
 * @param accessToken Meta access token
 * @param adAccountId Ad account ID (e.g., "act_123456")
 * @param videoUrl Public URL to video file or video file buffer
 * @param title Video title
 * @param thumbnailUrl Optional custom thumbnail (falls back to default)
 * @returns Video ID and upload status
 */
export async function uploadVideoToMeta(
  accessToken: string,
  adAccountId: string,
  videoUrl: string,
  title: string,
  thumbnailUrl?: string
): Promise<VideoUploadResult> {
  console.log('[uploadVideoToMeta] Starting video upload:', {
    adAccountId,
    videoUrl: videoUrl.substring(0, 100) + '...',
    title,
    hasThumbnail: !!thumbnailUrl,
  });

  const thumbnail = thumbnailUrl || DEFAULT_VIDEO_THUMBNAIL_URL;

  try {
    // Upload video using file_url parameter
    // Meta will fetch the video from the URL
    const uploadResponse = await fetch(
      `https://graph.facebook.com/v20.0/${adAccountId}/advideos`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_url: videoUrl,
          title,
          thumb: thumbnail, // Thumbnail URL
          access_token: accessToken,
        }),
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json();
      console.error('[uploadVideoToMeta] Upload failed:', errorData);
      throw new Error(
        JSON.stringify(errorData.error || { message: 'Video upload failed', code: uploadResponse.status })
      );
    }

    const data = await uploadResponse.json();
    const videoId = data.id;

    console.log('[uploadVideoToMeta] ✅ Video uploaded successfully:', {
      video_id: videoId,
      thumbnail_url: thumbnail,
    });

    // Get initial status
    const initialStatus = await getVideoStatus(accessToken, videoId);

    return {
      video_id: videoId,
      status: initialStatus,
      thumbnail_url: thumbnail,
    };
  } catch (error: any) {
    console.error('[uploadVideoToMeta] Exception:', error);
    throw error;
  }
}

/**
 * Get video processing status from Meta
 * @param accessToken Meta access token
 * @param videoId Meta video ID
 * @returns Video status object
 */
export async function getVideoStatus(accessToken: string, videoId: string): Promise<VideoStatus> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${videoId}?fields=status,processing_progress,permalink_url&access_token=${accessToken}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[getVideoStatus] Fetch failed:', errorData);
      return {
        video_status: 'error',
        error: errorData.error || { message: 'Failed to get video status', code: response.status },
      };
    }

    const data = await response.json();
    console.log('[getVideoStatus] Status:', data);

    // Extract status
    const status: VideoStatus = {
      video_status: data.status?.video_status || 'processing',
      processing_progress: data.status?.processing_progress?.video_processing_progress || 0,
      permalink_url: data.permalink_url,
    };

    return status;
  } catch (error: any) {
    console.error('[getVideoStatus] Exception:', error);
    return {
      video_status: 'error',
      error: { message: error.message },
    };
  }
}

/**
 * Poll video status until ready or timeout
 * @param accessToken Meta access token
 * @param videoId Meta video ID
 * @param onProgress Optional callback for progress updates
 * @returns Final video status
 * @throws Error if video processing fails or times out
 */
export async function waitForVideoReady(
  accessToken: string,
  videoId: string,
  onProgress?: (status: VideoStatus) => void
): Promise<VideoStatus> {
  console.log('[waitForVideoReady] Polling video processing status:', videoId);

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    console.log(`[waitForVideoReady] Attempt ${attempt}/${MAX_POLL_ATTEMPTS}`);

    const status = await getVideoStatus(accessToken, videoId);

    // Call progress callback if provided
    if (onProgress) {
      onProgress(status);
    }

    // Check if ready
    if (status.video_status === 'ready' || status.processing_progress === 100) {
      console.log('[waitForVideoReady] ✅ Video is ready!');
      return status;
    }

    // Check if error
    if (status.video_status === 'error') {
      console.error('[waitForVideoReady] ❌ Video processing failed:', status.error);
      throw new Error(
        JSON.stringify({
          code: 'VIDEO_PROCESSING_ERROR',
          message: status.error?.message || 'Video processing failed on Meta',
          video_id: videoId,
        })
      );
    }

    // Continue polling
    console.log(
      `[waitForVideoReady] Video still processing (${status.processing_progress || 0}%), waiting ${POLL_INTERVAL_MS}ms...`
    );
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout
  console.error('[waitForVideoReady] ⏱️ Timeout waiting for video to be ready');
  throw new Error(
    JSON.stringify({
      code: 'VIDEO_NOT_READY',
      message: 'Video is still processing on Meta. Please retry in 1-2 minutes.',
      video_id: videoId,
    })
  );
}

/**
 * Build video creative object for Meta ad
 * @param videoId Meta video ID (must be ready/processed)
 * @param thumbnailUrl Thumbnail URL
 * @param destinationUrl Landing page URL
 * @param message Ad message/copy
 * @param pageId Facebook page ID
 * @param instagramActorId Optional Instagram actor ID for IG placements
 * @returns Creative object for Meta API
 */
export function buildVideoCreative(
  videoId: string,
  thumbnailUrl: string,
  destinationUrl: string,
  message: string,
  pageId: string,
  instagramActorId?: string
): any {
  const creative: any = {
    object_story_spec: {
      page_id: pageId,
      video_data: {
        video_id: videoId,
        image_url: thumbnailUrl, // Critical: always include thumbnail
        link_description: 'Stream now',
        message: message || 'Check out this music!',
        title: 'New Release',
        call_to_action: {
          type: 'LEARN_MORE',
          value: {
            link: destinationUrl,
          },
        },
      },
    },
  };

  // Add Instagram actor if provided and valid
  if (instagramActorId) {
    creative.object_story_spec.instagram_actor_id = instagramActorId;
  }

  return creative;
}

/**
 * Get default thumbnail URL
 */
export function getDefaultThumbnailUrl(): string {
  return DEFAULT_VIDEO_THUMBNAIL_URL;
}

/**
 * Validate Instagram placement requirements
 * @param instagramActorId Instagram actor ID
 * @param hasInstagramPlacements Whether IG placements are enabled
 * @returns Validation result with error message if invalid
 */
export function validateInstagramRequirements(
  instagramActorId: string | undefined,
  hasInstagramPlacements: boolean
): { valid: boolean; error?: string } {
  if (hasInstagramPlacements && !instagramActorId) {
    return {
      valid: false,
      error:
        'Instagram placements enabled but no Instagram account connected. Please connect Instagram in Profile → Connected Accounts or disable Instagram placements.',
    };
  }

  return { valid: true };
}
