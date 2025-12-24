import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { corsHeaders } from "./_headers";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * Execute AI-proposed actions after user approval
 *
 * POST /.netlify/functions/ai-actions-execute
 * Body: { action_id: "uuid" }
 *
 * Process:
 * 1. Verify auth (user must own the action)
 * 2. Verify status is "approved"
 * 3. Execute based on action_type
 * 4. Update action with result/error
 */

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Get user from auth header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = getSupabaseAdmin();

    // Verify token and get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }

    // Parse body
    const body = JSON.parse(event.body || "{}");
    const actionId = body.action_id;

    if (!actionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "action_id required" }),
      };
    }

    // Fetch action
    const { data: action, error: fetchError } = await supabase
      .from("ai_actions")
      .select("*")
      .eq("id", actionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !action) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Action not found" }),
      };
    }

    if (action.status !== "approved") {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Action must be approved first" }),
      };
    }

    // Execute action
    let result: any;
    let error: string | null = null;

    try {
      result = await executeAction(action, user.id, supabase);
    } catch (err: any) {
      console.error("[ai-actions-execute] Execution error", err);
      error = err.message || "Execution failed";
    }

    // Update action
    await supabase
      .from("ai_actions")
      .update({
        status: error ? "failed" : "executed",
        result: result || {},
        error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actionId);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        action_id: actionId,
        status: error ? "failed" : "executed",
        result,
        error,
      }),
    };
  } catch (err: any) {
    console.error("[ai-actions-execute] error", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

/**
 * Execute action based on type
 */
async function executeAction(action: any, userId: string, supabase: any): Promise<any> {
  const { action_type, payload, entity_id } = action;

  switch (action_type) {
    case "create_campaign":
      return await createCampaign(userId, payload, supabase);

    case "pause_campaign":
      return await pauseCampaign(userId, entity_id, supabase);

    case "update_budget":
      return await updateCampaignBudget(userId, entity_id, payload, supabase);

    case "refresh_performance":
      return await refreshPerformance(userId, entity_id, supabase);

    default:
      throw new Error(`Unknown action type: ${action_type}`);
  }
}

/**
 * Create new ad campaign (draft only for now)
 */
async function createCampaign(userId: string, payload: any, supabase: any) {
  const {
    platform = "meta",
    objective,
    daily_budget_cents,
    total_budget_cents,
    creative_brief,
    targeting,
    tracking,
    destination_url,
  } = payload;

  // Generate campaign name
  const name = payload.name || `AI Campaign ${new Date().toISOString().split("T")[0]}`;

  // Create draft campaign
  const { data: campaign, error } = await supabase
    .from("ad_campaigns")
    .insert({
      user_id: userId,
      platform,
      name,
      status: "draft",
      objective,
      daily_budget_cents,
      total_budget_cents,
      targeting: targeting || {},
      creatives: [{ type: "brief", content: creative_brief, destination_url }],
      tracking: tracking || {},
    })
    .select("id, name, status")
    .single();

  if (error) throw error;

  return {
    campaign_id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    message: "Campaign draft created. Review in Ads Manager to launch.",
  };
}

/**
 * Pause campaign
 */
async function pauseCampaign(userId: string, campaignId: string, supabase: any) {
  if (!campaignId) throw new Error("Campaign ID required");

  const { error } = await supabase
    .from("ad_campaigns")
    .update({
      status: "paused",
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("user_id", userId);

  if (error) throw error;

  return {
    campaign_id: campaignId,
    status: "paused",
    message: "Campaign paused successfully.",
  };
}

/**
 * Update campaign budget
 */
async function updateCampaignBudget(userId: string, campaignId: string, payload: any, supabase: any) {
  if (!campaignId) throw new Error("Campaign ID required");

  const { daily_budget_cents, total_budget_cents } = payload;

  const updates: any = { updated_at: new Date().toISOString() };
  if (daily_budget_cents !== undefined) updates.daily_budget_cents = daily_budget_cents;
  if (total_budget_cents !== undefined) updates.total_budget_cents = total_budget_cents;

  const { error } = await supabase
    .from("ad_campaigns")
    .update(updates)
    .eq("id", campaignId)
    .eq("user_id", userId);

  if (error) throw error;

  return {
    campaign_id: campaignId,
    daily_budget_cents,
    total_budget_cents,
    message: "Budget updated successfully.",
  };
}

/**
 * Refresh campaign performance
 *
 * TODO: When Meta/TikTok/Google APIs are wired:
 * - Fetch latest insights from platform
 * - Write to ad_campaign_performance
 *
 * For now: placeholder
 */
async function refreshPerformance(userId: string, campaignId: string, supabase: any) {
  if (!campaignId) throw new Error("Campaign ID required");

  // TODO: Call Meta Insights API
  // const insights = await fetchMetaInsights(campaignId);

  // Placeholder: just return existing data
  const { data: performance } = await supabase
    .from("ad_campaign_performance")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    campaign_id: campaignId,
    latest_performance: performance || null,
    message: "Performance data refreshed (placeholder - wire API when ready).",
  };
}

export { handler };
