import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdsTemplateRecord } from './types';

/**
 * Fetch active ad campaign templates from database
 * @param supabase - Supabase client instance
 * @returns Array of active templates sorted by sort_order and created_at
 */
export async function fetchAdsTemplates(
  supabase: SupabaseClient
): Promise<AdsTemplateRecord[]> {
  try {
    const { data, error } = await supabase
      .from('ad_campaign_templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[fetchAdsTemplates] Error fetching templates:', error);
      return getDefaultTemplates();
    }

    if (!data || data.length === 0) {
      console.warn('[fetchAdsTemplates] No templates found in database, using defaults');
      return getDefaultTemplates();
    }

    console.log('[fetchAdsTemplates] Loaded templates:', data.length);
    return data as AdsTemplateRecord[];
  } catch (err) {
    console.error('[fetchAdsTemplates] Exception:', err);
    return getDefaultTemplates();
  }
}

/**
 * Fallback templates if database unavailable
 */
function getDefaultTemplates(): AdsTemplateRecord[] {
  return [
    {
      id: 'default-oneclick',
      template_key: 'oneclick_segmentation_sales',
      title: 'One-Click Segmentation (Sales)',
      purpose: 'Drive conversions through segmented one-click links',
      core_signal: 'Custom oneclick conversion events',
      objective: 'OUTCOME_SALES',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      destination_mode: 'oneclick_redirect',
      tracking_events: [
        'onclicklink',
        'oneclickspotify',
        'oneclickyoutube',
        'oneclickapplemusic',
        'oneclicksoundcloud',
        'oneclickaudiomack',
        'oneclicktidal',
      ],
      is_active: true,
      sort_order: 1,
    },
    {
      id: 'default-virality',
      template_key: 'virality_engagement_thruplay_sound',
      title: 'Virality + Engagement (ThruPlay)',
      purpose: 'Maximize video engagement and sound virality',
      core_signal: 'ThruPlay video views',
      objective: 'VIDEO_VIEWS',
      optimization_goal: 'THRUPLAY',
      destination_mode: 'native_sound',
      tracking_events: ['thruplay', 'post_engagement', 'video_view'],
      is_active: true,
      sort_order: 2,
    },
    {
      id: 'default-follower-growth',
      template_key: 'follower_growth_profile_visits',
      title: 'Follower Growth (Profile Visits)',
      purpose: 'Drive profile visits and follower growth',
      core_signal: 'Profile visits and follows',
      objective: 'OUTCOME_TRAFFIC',
      optimization_goal: 'LINK_CLICKS',
      destination_mode: 'native_profile',
      tracking_events: ['profile_view', 'follow'],
      is_active: true,
      sort_order: 3,
    },
    {
      id: 'default-email-capture',
      template_key: 'email_capture_leads',
      title: 'Email Capture (Leads)',
      purpose: 'Generate leads through email capture forms',
      core_signal: 'Lead form submissions',
      objective: 'OUTCOME_LEADS',
      optimization_goal: 'LEAD',
      destination_mode: 'lead_form',
      tracking_events: ['lead', 'email_capture', 'form_submit'],
      is_active: true,
      sort_order: 4,
    },
  ];
}
