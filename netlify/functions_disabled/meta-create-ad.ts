import type { Handler } from "@netlify/functions";
import { getMetaConfig } from "./_metaConfig";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const {
      name,
      adAccountId,
      campaignObjective,
      budget,
      targeting,
      creative,
      smartLinkId
    } = body;

    console.log("[meta-create-ad] Creating ad for user:", user.id);

    const { data: metaConnection } = await supabase
      .from("meta_connections")
      .select("access_token, ad_accounts")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!metaConnection || !metaConnection.access_token) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Meta account not connected" })
      };
    }

    const accessToken = metaConnection.access_token;

    const campaignData = {
      name: `${name} - Campaign`,
      objective: campaignObjective || "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: []
    };

    console.log("[meta-create-ad] Creating campaign:", campaignData);

    const campaignRes = await fetch(
      `https://graph.facebook.com/v20.0/act_${adAccountId}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campaignData,
          access_token: accessToken
        })
      }
    );

    const campaignJson: any = await campaignRes.json();

    if (!campaignRes.ok || campaignJson.error) {
      console.error("[meta-create-ad] Campaign creation error:", campaignJson);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: campaignJson.error?.message || "Failed to create campaign"
        })
      };
    }

    const campaignId = campaignJson.id;
    console.log("[meta-create-ad] Campaign created:", campaignId);

    const adSetData = {
      name: `${name} - Ad Set`,
      campaign_id: campaignId,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_amount: Math.round((budget / 30) * 100),
      daily_budget: Math.round(budget * 100),
      targeting: targeting || {
        geo_locations: { countries: ["US"] },
        age_min: 18,
        age_max: 65
      },
      status: "PAUSED"
    };

    console.log("[meta-create-ad] Creating ad set");

    const adSetRes = await fetch(
      `https://graph.facebook.com/v20.0/act_${adAccountId}/adsets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adSetData,
          access_token: accessToken
        })
      }
    );

    const adSetJson: any = await adSetRes.json();

    if (!adSetRes.ok || adSetJson.error) {
      console.error("[meta-create-ad] Ad set creation error:", adSetJson);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: adSetJson.error?.message || "Failed to create ad set"
        })
      };
    }

    const adSetId = adSetJson.id;
    console.log("[meta-create-ad] Ad set created:", adSetId);

    let destinationUrl = creative.link;
    if (smartLinkId) {
      const { data: smartLink } = await supabase
        .from("smart_links")
        .select("slug")
        .eq("id", smartLinkId)
        .maybeSingle();

      if (smartLink) {
        destinationUrl = `https://ghoste.one/l/${smartLink.slug}`;
      }
    }

    const creativeData = {
      name: `${name} - Creative`,
      object_story_spec: {
        page_id: creative.pageId,
        link_data: {
          message: creative.message,
          link: destinationUrl,
          name: creative.headline,
          description: creative.description,
          image_hash: creative.imageHash,
          call_to_action: {
            type: "LEARN_MORE"
          }
        }
      }
    };

    console.log("[meta-create-ad] Creating creative");

    const creativeRes = await fetch(
      `https://graph.facebook.com/v20.0/act_${adAccountId}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...creativeData,
          access_token: accessToken
        })
      }
    );

    const creativeJson: any = await creativeRes.json();

    if (!creativeRes.ok || creativeJson.error) {
      console.error("[meta-create-ad] Creative creation error:", creativeJson);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: creativeJson.error?.message || "Failed to create creative"
        })
      };
    }

    const creativeId = creativeJson.id;
    console.log("[meta-create-ad] Creative created:", creativeId);

    const adData = {
      name: name,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED"
    };

    console.log("[meta-create-ad] Creating ad");

    const adRes = await fetch(
      `https://graph.facebook.com/v20.0/act_${adAccountId}/ads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...adData,
          access_token: accessToken
        })
      }
    );

    const adJson: any = await adRes.json();

    if (!adRes.ok || adJson.error) {
      console.error("[meta-create-ad] Ad creation error:", adJson);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: adJson.error?.message || "Failed to create ad"
        })
      };
    }

    const adId = adJson.id;
    console.log("[meta-create-ad] Ad created successfully:", adId);

    await supabase.from("ad_campaigns").insert([
      {
        user_id: user.id,
        name: name,
        platform: "meta",
        status: "paused",
        budget: budget,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        meta_campaign_id: campaignId,
        meta_adset_id: adSetId,
        meta_ad_id: adId,
        smart_link_id: smartLinkId || null
      }
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        campaignId,
        adSetId,
        adId
      })
    };
  } catch (err: any) {
    console.error("[meta-create-ad] Fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
