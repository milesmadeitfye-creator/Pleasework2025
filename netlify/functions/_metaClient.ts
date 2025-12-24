/**
 * Unified Meta Marketing API Client
 *
 * Production-only client using:
 * - META_ACCESS_TOKEN (long-lived user token for production)
 * - META_AD_ACCOUNT_ID (real ad account ID, format: act_123...)
 * - META_GRAPH_API_VERSION (defaults to v24.0)
 *
 * Supports both system-level operations (using env vars) and
 * user-level operations (using access tokens from database).
 */

// Support both old and new environment variable names for Graph API version
const GRAPH_API_VERSION =
  process.env.META_GRAPH_VERSION ||
  process.env.META_GRAPH_API_VERSION ||
  'v24.0';

const META_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Support both old and new environment variable names for system credentials
const SYSTEM_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const SYSTEM_ACCESS_TOKEN =
  process.env.META_USER_ACCESS_TOKEN ||
  process.env.META_ACCESS_TOKEN;

if (!SYSTEM_AD_ACCOUNT_ID) {
  console.warn('[MetaClient] META_AD_ACCOUNT_ID not configured - system-level operations will not work');
}

if (!SYSTEM_ACCESS_TOKEN) {
  console.warn('[MetaClient] META_USER_ACCESS_TOKEN or META_ACCESS_TOKEN not configured - system-level operations will not work');
}

console.log('[MetaClient] Configuration:', {
  apiVersion: GRAPH_API_VERSION,
  hasAdAccountId: !!SYSTEM_AD_ACCOUNT_ID,
  hasAccessToken: !!SYSTEM_ACCESS_TOKEN,
  adAccountId: SYSTEM_AD_ACCOUNT_ID ? `${SYSTEM_AD_ACCOUNT_ID.substring(0, 10)}...` : 'none',
});

export type MetaRequestOptions = RequestInit & {
  query?: Record<string, string | number | boolean | null | undefined>;
  accessToken?: string; // Optional override for user-level operations
};

/**
 * Make a request to the Meta Marketing API
 */
export async function metaRequest<T = any>(
  path: string,
  options: MetaRequestOptions = {}
): Promise<T> {
  const accessToken = options.accessToken || SYSTEM_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('Meta API error: No access token provided or configured');
  }

  const url = new URL(`${META_BASE_URL}${path}`);

  // Apply query params if provided
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Always include access token
  url.searchParams.set('access_token', accessToken);

  const { query, accessToken: _, ...fetchOptions } = options;

  const res = await fetch(url.toString(), {
    method: fetchOptions.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
    },
    body:
      fetchOptions.body && typeof fetchOptions.body !== 'string'
        ? JSON.stringify(fetchOptions.body)
        : fetchOptions.body,
  });

  if (!res.ok) {
    const text = await res.text();
    let errorData: any;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = { message: text };
    }
    console.error('[MetaClient] API error:', {
      status: res.status,
      path,
      error: errorData
    });
    throw errorData;
  }

  return (await res.json()) as T;
}

/**
 * Get the system Meta ad account ID
 */
export function getSystemAdAccountId(): string {
  if (!SYSTEM_AD_ACCOUNT_ID) {
    throw new Error('Meta API error: META_AD_ACCOUNT_ID not configured');
  }
  return SYSTEM_AD_ACCOUNT_ID;
}

/**
 * Normalize ad account ID (ensure it has act_ prefix)
 */
export function normalizeAdAccountId(adAccountId: string): string {
  if (adAccountId.startsWith('act_')) {
    return adAccountId.substring(4);
  }
  return adAccountId;
}

/**
 * Get the Meta Graph API version being used
 */
export function getGraphApiVersion(): string {
  return GRAPH_API_VERSION;
}

// ========================================
// High-Level Campaign Operations
// ========================================

/**
 * List campaigns for an ad account
 */
export async function listMetaCampaigns(params: {
  adAccountId: string;
  accessToken: string;
  query?: Record<string, any>;
}): Promise<any> {
  const { adAccountId, accessToken, query = {} } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/campaigns`, {
    method: 'GET',
    accessToken,
    query: {
      effective_status: 'ACTIVE,PAUSED',
      limit: 50,
      ...query,
    },
  });
}

/**
 * Create a campaign
 */
export async function createMetaCampaign(params: {
  adAccountId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adAccountId, accessToken, payload } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/campaigns`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

/**
 * Update a campaign
 */
export async function updateMetaCampaign(params: {
  campaignId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { campaignId, accessToken, payload } = params;

  return metaRequest(`/${campaignId}`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

/**
 * Get campaign details
 */
export async function getMetaCampaign(params: {
  campaignId: string;
  accessToken: string;
  fields?: string;
}): Promise<any> {
  const { campaignId, accessToken, fields } = params;

  return metaRequest(`/${campaignId}`, {
    method: 'GET',
    accessToken,
    query: fields ? { fields } : undefined,
  });
}

// ========================================
// High-Level Ad Set Operations
// ========================================

/**
 * Create an ad set
 */
export async function createMetaAdSet(params: {
  adAccountId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adAccountId, accessToken, payload } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/adsets`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

/**
 * Update an ad set
 */
export async function updateMetaAdSet(params: {
  adSetId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adSetId, accessToken, payload } = params;

  return metaRequest(`/${adSetId}`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

// ========================================
// High-Level Creative & Ad Operations
// ========================================

/**
 * Create an ad creative
 */
export async function createMetaAdCreative(params: {
  adAccountId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adAccountId, accessToken, payload } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/adcreatives`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

/**
 * Create an ad
 */
export async function createMetaAd(params: {
  adAccountId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adAccountId, accessToken, payload } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/ads`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

/**
 * Update an ad
 */
export async function updateMetaAd(params: {
  adId: string;
  accessToken: string;
  payload: Record<string, any>;
}): Promise<any> {
  const { adId, accessToken, payload } = params;

  return metaRequest(`/${adId}`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

// ========================================
// Asset Upload Operations
// ========================================

/**
 * Upload an image to Meta Marketing API
 */
export async function uploadMetaImage(params: {
  adAccountId: string;
  accessToken: string;
  fileUrl: string;
}): Promise<string> {
  const { adAccountId, accessToken, fileUrl } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  console.log('[uploadMetaImage] Uploading image:', fileUrl);

  // Fetch the image and convert to base64
  const imageRes = await fetch(fileUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch image from ${fileUrl}`);
  }

  const arrayBuffer = await imageRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  const data: any = await metaRequest(`/act_${normalizedAccountId}/adimages`, {
    method: 'POST',
    accessToken,
    body: { bytes: base64 },
  });

  // Response format: { images: { bytes: { hash: "..." } } }
  const imageHash = data?.images?.bytes?.hash || data?.images?.[Object.keys(data?.images || {})[0]]?.hash;

  if (!imageHash) {
    console.error('[uploadMetaImage] No hash in response:', data);
    throw new Error('Failed to upload image to Meta – missing image hash in response');
  }

  console.log('[uploadMetaImage] Image uploaded successfully, hash:', imageHash);
  return imageHash;
}

/**
 * Upload a video to Meta Marketing API
 */
export async function uploadMetaVideo(params: {
  adAccountId: string;
  accessToken: string;
  fileUrl: string;
}): Promise<string> {
  const { adAccountId, accessToken, fileUrl } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  console.log('[uploadMetaVideo] Uploading video:', fileUrl);

  const data: any = await metaRequest(`/act_${normalizedAccountId}/advideos`, {
    method: 'POST',
    accessToken,
    body: { file_url: fileUrl },
  });

  if (!data?.id) {
    throw new Error('Failed to upload video to Meta – missing video id');
  }

  console.log('[uploadMetaVideo] Video uploaded successfully:', data.id);
  return data.id;
}

// ========================================
// Conversion & Pixel Operations
// ========================================

/**
 * Get custom conversions for a pixel
 */
export async function getMetaCustomConversions(params: {
  adAccountId: string;
  accessToken: string;
}): Promise<any> {
  const { adAccountId, accessToken } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/customconversions`, {
    method: 'GET',
    accessToken,
    query: {
      fields: 'id,name,pixel',
      limit: 200,
    },
  });
}

/**
 * Get pixels for an ad account
 */
export async function getMetaPixels(params: {
  adAccountId: string;
  accessToken: string;
}): Promise<any> {
  const { adAccountId, accessToken } = params;
  const normalizedAccountId = normalizeAdAccountId(adAccountId);

  return metaRequest(`/act_${normalizedAccountId}/adspixels`, {
    method: 'GET',
    accessToken,
    query: {
      fields: 'id,name',
    },
  });
}

// ========================================
// Interest Targeting Operations
// ========================================

/**
 * Search for Meta interests
 */
export async function searchMetaInterests(params: {
  terms: string[];
  accessToken: string;
}): Promise<{ interests: Array<{ id: string; name: string }> }> {
  const { terms, accessToken } = params;
  const interests: Array<{ id: string; name: string }> = [];

  console.log('[searchMetaInterests] Searching for', terms.length, 'terms');

  for (const term of terms) {
    try {
      const data: any = await metaRequest('/search', {
        method: 'GET',
        accessToken,
        query: {
          type: 'adinterest',
          q: term,
          limit: 1,
        },
      });

      if (data.data && data.data.length > 0) {
        const interest = data.data[0];
        interests.push({ id: interest.id, name: interest.name });
        console.log('[searchMetaInterests] Matched:', term, '→', interest.name);
      } else {
        console.log('[searchMetaInterests] No match for:', term);
      }
    } catch (error) {
      console.error('[searchMetaInterests] Error searching term:', term, error);
    }
  }

  console.log('[searchMetaInterests] Found', interests.length, 'interests');
  return { interests };
}

// ========================================
// Utility Functions
// ========================================

/**
 * Make a raw Meta API call (for custom operations)
 */
export async function callMetaApi(params: {
  endpoint: string;
  accessToken: string;
  method?: string;
  payload?: any;
}): Promise<any> {
  const { endpoint, accessToken, method = 'POST', payload = {} } = params;

  console.log(`[callMetaApi] ${method} ${endpoint}`);

  return metaRequest(`/${endpoint}`, {
    method,
    accessToken,
    body: method === 'POST' ? payload : undefined,
    query: method === 'GET' ? payload : undefined,
  });
}
