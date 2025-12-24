/**
 * Shared Meta Campaign Creation Helper
 *
 * Creates a minimal valid Meta campaign with only required fields.
 * Does NOT include ad set or ad creation - campaign only.
 */

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

export type CreateCampaignOptions = {
  adAccountId: string; // numeric id without "act_"
  accessToken: string; // user's Meta access token
  name: string;
  objective?: string;
  status?: string;
  specialAdCategories?: string[];
};

export async function createMetaCampaign({
  adAccountId,
  accessToken,
  name,
  objective = 'OUTCOME_TRAFFIC',
  status = 'PAUSED',
  specialAdCategories = ['NONE'],
}: CreateCampaignOptions) {
  if (!accessToken) {
    throw new Error('Meta access token not configured');
  }

  if (!adAccountId) {
    throw new Error('Missing adAccountId');
  }

  if (!name) {
    throw new Error('Missing campaign name');
  }

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${adAccountId}/campaigns`;

  const params = new URLSearchParams({
    name,
    objective,
    status,
    buying_type: 'AUCTION',
    access_token: accessToken,
  });

  // Meta expects special_ad_categories as JSON string array
  params.append('special_ad_categories', JSON.stringify(specialAdCategories));

  console.log('[meta-campaign] Creating campaign', {
    url,
    adAccountId,
    name,
    objective,
    status,
    specialAdCategories,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[meta-campaign] Meta API error', {
        status: response.status,
        error: errorData,
      });
      throw errorData;
    }

    const data = await response.json();
    console.log('[meta-campaign] Meta response', data);
    return data;
  } catch (err: any) {
    const metaError = err?.error || err?.message || err;
    console.error('[meta-campaign] Error creating campaign', metaError);
    throw err;
  }
}
