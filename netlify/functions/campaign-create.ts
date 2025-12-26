import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { validateCampaignConfig, getAdSetRules, CAMPAIGN_TEMPLATES, CampaignType } from "./_campaignTemplates";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const campaign_type = body.campaign_type as CampaignType;
    const campaign_name = body.campaign_name;
    const daily_budget_cents = body.daily_budget_cents;
    const destination_config = body.destination_config || {};

    if (!campaign_type || !campaign_name || !daily_budget_cents) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_required_fields" }),
      };
    }

    const template = CAMPAIGN_TEMPLATES[campaign_type];
    if (!template) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "invalid_campaign_type" }),
      };
    }

    const validation = validateCampaignConfig(campaign_type, {
      daily_budget_cents,
      ...destination_config,
    });

    if (!validation.valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "validation_failed", errors: validation.errors }),
      };
    }

    const adSetRules = getAdSetRules(campaign_type, destination_config);

    const campaignData: any = {
      owner_user_id: user.id,
      campaign_type,
      campaign_name,
      status: 'draft',
      daily_budget_cents,
      total_budget_cents: body.total_budget_cents || null,
      destination_url: adSetRules.destination_url,
      destination_platform: adSetRules.platform || null,
      automation_enabled: body.automation_enabled || false,
      max_daily_budget_cents: body.max_daily_budget_cents || daily_budget_cents * 2,
      ai_mode: body.ai_mode || 'manual',
      config: {
        template: template.campaign_type,
        ad_set_rules: adSetRules,
        destination_config,
      },
    };

    if (campaign_type === 'smart_link_probe' && destination_config.smart_link_id) {
      campaignData.smart_link_id = destination_config.smart_link_id;
    }

    if (campaign_type === 'one_click_sound' && destination_config.one_click_link_id) {
      campaignData.one_click_link_id = destination_config.one_click_link_id;
    }

    const { data: campaign, error: insertError } = await supabase
      .from('ghoste_campaigns')
      .insert([campaignData])
      .select()
      .single();

    if (insertError) {
      console.error('[campaign-create] Insert error:', insertError);
      throw insertError;
    }

    console.log('[campaign-create] ✅ Campaign created:', campaign.id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        campaign,
      }),
    };
  } catch (e: any) {
    console.error("[campaign-create] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "create_error" }),
    };
  }
};
