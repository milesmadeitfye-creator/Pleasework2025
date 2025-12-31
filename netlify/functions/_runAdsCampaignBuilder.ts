import { getSupabaseAdmin } from './_supabaseAdmin';
import { CAMPAIGN_TEMPLATES, CampaignType, getAdSetRules } from './_campaignTemplates';

export interface RunAdsInput {
  user_id: string;
  ad_goal: 'promote_song' | 'grow_followers' | 'capture_fans';
  daily_budget_cents: number;
  automation_mode: 'assist' | 'guided' | 'autonomous';
  creative_ids: string[];
  total_budget_cents?: number;
  smart_link_id?: string;
  one_click_link_id?: string;
  platform?: string;
  profile_url?: string;
  capture_page_url?: string;
}

export interface CampaignBuildResult {
  success: boolean;
  campaign_id?: string;
  campaign_type?: CampaignType;
  reasoning: string;
  confidence: 'low' | 'medium' | 'high';
  guardrails_applied: string[];
  error?: string;
  error_code?: string;
}

export async function selectCampaignType(
  ad_goal: string,
  creative_analysis: any[]
): Promise<{ campaign_type: CampaignType; reasoning: string; confidence: string }> {
  let campaign_type: CampaignType;
  let reasoning = '';
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  const avgHookStrength = creative_analysis.length > 0
    ? creative_analysis.reduce((sum, c) => sum + (c.hook_strength || 50), 0) / creative_analysis.length
    : 50;

  switch (ad_goal) {
    case 'promote_song':
      if (avgHookStrength >= 70) {
        campaign_type = 'one_click_sound';
        reasoning = 'Strong creative hook detected. Using direct one-click promotion for maximum conversion. Creative strength allows for aggressive platform-specific targeting.';
        confidence = 'high';
      } else {
        campaign_type = 'smart_link_probe';
        reasoning = 'Starting with smart link to test audience engagement across platforms. Will recommend one-click campaigns if performance is strong.';
        confidence = 'medium';
      }
      break;

    case 'grow_followers':
      campaign_type = 'follower_growth';
      reasoning = 'Follower growth campaign optimized for warm audience engagement. Will target users who have interacted with your content.';
      confidence = 'high';
      break;

    case 'capture_fans':
      campaign_type = 'fan_capture';
      reasoning = 'Lead generation campaign optimized for email/SMS capture. Will drive traffic to capture page with conversion tracking.';
      confidence = 'high';
      break;

    default:
      campaign_type = 'smart_link_probe';
      reasoning = 'Defaulting to smart link probe for broad testing.';
      confidence = 'low';
  }

  return { campaign_type, reasoning, confidence };
}

export async function buildCampaignConfig(
  input: RunAdsInput,
  campaign_type: CampaignType,
  creatives: any[]
): Promise<any> {
  const supabase = getSupabaseAdmin();

  const config: any = {
    daily_budget_cents: input.daily_budget_cents,
    total_budget_cents: input.total_budget_cents,
  };

  switch (campaign_type) {
    case 'smart_link_probe':
      console.log('[buildCampaignConfig] Building smart_link_probe campaign:', {
        has_smart_link_id: !!input.smart_link_id,
        has_profile_url: !!input.profile_url,
        user_id: input.user_id,
      });

      if (!input.smart_link_id) {
        console.warn('[buildCampaignConfig] No smart_link_id provided for smart_link_probe, using profile_url as fallback');
        if (input.profile_url) {
          config.smart_link_url = input.profile_url;
          console.log('[buildCampaignConfig] Using profile_url as destination:', config.smart_link_url);
        } else {
          const error: any = new Error('Smart link ID or profile URL required for smart_link_probe campaign');
          error.code = 'SMART_LINK_NOT_FOUND';
          throw error;
        }
        break;
      }

      // Attempt to resolve smart link (optional - may have been resolved earlier)
      const { data: smartLink, error: linkError } = await supabase
        .from('smart_links')
        .select('slug')
        .eq('id', input.smart_link_id)
        .eq('owner_user_id', input.user_id)
        .maybeSingle();

      if (linkError) {
        console.error('[buildCampaignConfig] Error looking up smart link:', {
          error: linkError.message,
          code: linkError.code,
          smart_link_id: input.smart_link_id,
        });
      }

      if (smartLink?.slug) {
        // Smart link found - use canonical URL
        config.smart_link_id = input.smart_link_id;
        config.smart_link_url = `${process.env.VITE_APP_URL || 'https://ghoste.one'}/l/${smartLink.slug}`;
        console.log('[buildCampaignConfig] ✓ Smart link resolved:', {
          id: config.smart_link_id,
          url: config.smart_link_url,
        });
      } else if (input.profile_url) {
        // Fallback: use profile_url from run-ads-submit (which computed resolvedDestinationUrl)
        console.warn('[buildCampaignConfig] Smart link not found in DB, using pre-resolved destination URL');
        config.smart_link_id = input.smart_link_id;
        config.smart_link_url = input.profile_url;
        console.log('[buildCampaignConfig] Using fallback destination:', config.smart_link_url);
      } else {
        console.error('[buildCampaignConfig] Smart link resolution failed completely', {
          smart_link_id: input.smart_link_id,
          has_profile_url: !!input.profile_url,
        });
        const error: any = new Error('Smart link not found and no destination URL available');
        error.code = 'SMART_LINK_NOT_FOUND';
        throw error;
      }
      break;

    case 'one_click_sound':
      if (!input.one_click_link_id || !input.platform) {
        throw new Error('One-click link ID and platform required for one_click_sound campaign');
      }

      const { data: oneClickLink, error: oneClickError } = await supabase
        .from('one_click_links')
        .select('slug')
        .eq('id', input.one_click_link_id)
        .eq('owner_user_id', input.user_id)
        .maybeSingle();

      if (oneClickError) {
        console.error('[buildCampaignConfig] Error looking up one-click link:', oneClickError.message);
      }

      if (!oneClickLink) {
        throw new Error('One-click link not found. Create a one-click link first.');
      }

      config.one_click_link_id = input.one_click_link_id;
      config.one_click_url = `${process.env.VITE_APP_URL || 'https://ghoste.one'}/one/${oneClickLink.slug}`;
      config.platform = input.platform;
      break;

    case 'follower_growth':
      if (!input.profile_url || !input.platform) {
        throw new Error('Profile URL and platform required for follower_growth campaign');
      }

      config.profile_url = input.profile_url;
      config.platform = input.platform;
      break;

    case 'fan_capture':
      if (!input.capture_page_url) {
        throw new Error('Capture page URL required for fan_capture campaign');
      }

      config.capture_page_url = input.capture_page_url;
      break;
  }

  return config;
}

export async function applyGuardrails(
  input: RunAdsInput,
  campaign_type: CampaignType
): Promise<string[]> {
  const guardrails: string[] = [];
  const template = CAMPAIGN_TEMPLATES[campaign_type];

  if (input.daily_budget_cents < template.budget_cap_rules.min_daily_budget_cents) {
    throw new Error(`Minimum daily budget is $${template.budget_cap_rules.min_daily_budget_cents / 100}`);
  }

  if (input.daily_budget_cents > template.budget_cap_rules.max_daily_budget_cents) {
    guardrails.push(`Daily budget capped at $${template.budget_cap_rules.max_daily_budget_cents / 100}`);
    input.daily_budget_cents = template.budget_cap_rules.max_daily_budget_cents;
  }

  if (template.budget_cap_rules.max_total_budget_cents && input.total_budget_cents) {
    if (input.total_budget_cents > template.budget_cap_rules.max_total_budget_cents) {
      guardrails.push(`Total budget capped at $${template.budget_cap_rules.max_total_budget_cents / 100}`);
      input.total_budget_cents = template.budget_cap_rules.max_total_budget_cents;
    }
  }

  if (input.automation_mode === 'autonomous') {
    guardrails.push('Autonomous mode: AI can scale budget within caps');
  } else if (input.automation_mode === 'guided') {
    guardrails.push('Guided mode: AI will suggest actions for approval');
  } else {
    guardrails.push('Assist mode: Manual control with AI insights');
  }

  if (campaign_type === 'follower_growth') {
    guardrails.push('Follower growth: Warm audiences only (requires existing engagement)');
  }

  if (campaign_type === 'fan_capture') {
    guardrails.push(`Target CPL: $${template.budget_cap_rules.cost_per_lead_target_cents! / 100}`);
  }

  return guardrails;
}

export async function buildAndLaunchCampaign(input: RunAdsInput): Promise<CampaignBuildResult> {
  const supabase = getSupabaseAdmin();

  try {
    const { data: creatives, error: creativesError } = await supabase
      .from('ad_creatives')
      .select('*, ai_creative_analysis(*)')
      .in('id', input.creative_ids)
      .eq('owner_user_id', input.user_id);

    if (creativesError || !creatives || creatives.length === 0) {
      throw new Error('No creatives found');
    }

    const { campaign_type, reasoning, confidence } = await selectCampaignType(
      input.ad_goal,
      creatives
    );

    const guardrails = await applyGuardrails(input, campaign_type);

    const destinationConfig = await buildCampaignConfig(input, campaign_type, creatives);

    const adSetRules = getAdSetRules(campaign_type, destinationConfig);

    const campaign_name = `${input.ad_goal.replace('_', ' ')} - ${new Date().toLocaleDateString()}`;

    const { data: campaign, error: campaignError } = await supabase
      .from('ghoste_campaigns')
      .insert([{
        owner_user_id: input.user_id,
        campaign_type,
        campaign_name,
        status: 'draft',
        daily_budget_cents: input.daily_budget_cents,
        total_budget_cents: input.total_budget_cents || null,
        destination_url: adSetRules.destination_url,
        destination_platform: adSetRules.platform || null,
        automation_enabled: input.automation_mode !== 'assist',
        max_daily_budget_cents: input.daily_budget_cents * 2,
        ai_mode: input.automation_mode,
        smart_link_id: input.smart_link_id || null,
        one_click_link_id: input.one_click_link_id || null,
        config: {
          template: campaign_type,
          ad_set_rules: adSetRules,
          destination_config: destinationConfig,
          creative_ids: input.creative_ids,
          run_ads_flow: true,
        },
      }])
      .select()
      .single();

    if (campaignError || !campaign) {
      throw campaignError || new Error('Failed to create campaign');
    }

    await supabase
      .from('campaign_launch_log')
      .insert([{
        owner_user_id: input.user_id,
        campaign_id: campaign.id,
        daily_budget_cents: input.daily_budget_cents,
        automation_mode: input.automation_mode,
        ad_goal: input.ad_goal,
        campaign_type_selected: campaign_type,
        reasoning,
        confidence,
        creative_count: creatives.length,
        creative_ids: input.creative_ids,
        budget_cap_enforced: true,
        guardrails_applied: guardrails,
      }]);

    console.log('[buildAndLaunchCampaign] ✅ Campaign created:', campaign.id);

    return {
      success: true,
      campaign_id: campaign.id,
      campaign_type,
      reasoning,
      confidence: confidence as 'low' | 'medium' | 'high',
      guardrails_applied: guardrails,
    };
  } catch (error: any) {
    console.error('[buildAndLaunchCampaign] Error:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n')[0],
    });
    return {
      success: false,
      reasoning: 'Failed to build campaign',
      confidence: 'low',
      guardrails_applied: [],
      error: error.message || 'Unknown error',
      error_code: error.code,
    };
  }
}
