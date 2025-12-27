import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';

interface UpgradeEligibility {
  isEligible: boolean;
  hasSeenPrompt: boolean;
  loginCount: number;
  valueActions: {
    smartLinkCreated: boolean;
    oneClickCreated: boolean;
    messageDrafted: boolean;
    aiUsed: boolean;
    analyticsViewed: boolean;
  };
  billingStatus: string;
  loading: boolean;
}

export function useUpgradeEligibility() {
  const { user } = useAuth();
  const [eligibility, setEligibility] = useState<UpgradeEligibility>({
    isEligible: false,
    hasSeenPrompt: false,
    loginCount: 0,
    valueActions: {
      smartLinkCreated: false,
      oneClickCreated: false,
      messageDrafted: false,
      aiUsed: false,
      analyticsViewed: false,
    },
    billingStatus: 'free',
    loading: true,
  });

  useEffect(() => {
    if (user) {
      loadEligibility();
    }
  }, [user]);

  const loadEligibility = async () => {
    if (!user) return;

    try {
      const { data: isEligible } = await supabase.rpc('is_upgrade_eligible');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('login_count, has_seen_upgrade_prompt, value_actions_completed')
        .eq('user_id', user.id)
        .single();

      const { data: billing } = await supabase
        .from('user_billing_v2')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        const actions = profile.value_actions_completed || {};
        setEligibility({
          isEligible: isEligible || false,
          hasSeenPrompt: profile.has_seen_upgrade_prompt || false,
          loginCount: profile.login_count || 0,
          valueActions: {
            smartLinkCreated: actions.smart_link_created || false,
            oneClickCreated: actions.one_click_created || false,
            messageDrafted: actions.message_drafted || false,
            aiUsed: actions.ai_used || false,
            analyticsViewed: actions.analytics_viewed || false,
          },
          billingStatus: billing?.status || 'free',
          loading: false,
        });
      }
    } catch (err) {
      console.error('[useUpgradeEligibility] Error loading eligibility:', err);
      setEligibility((prev) => ({ ...prev, loading: false }));
    }
  };

  const markValueAction = async (actionKey: string) => {
    if (!user) return;

    try {
      await supabase.rpc('mark_value_action', { p_action_key: actionKey });
      await loadEligibility();
    } catch (err) {
      console.error('[useUpgradeEligibility] Error marking value action:', err);
    }
  };

  const markPromptShown = async () => {
    if (!user) return;

    try {
      await supabase.rpc('mark_upgrade_prompt_shown');
      setEligibility((prev) => ({ ...prev, hasSeenPrompt: true }));
    } catch (err) {
      console.error('[useUpgradeEligibility] Error marking prompt shown:', err);
    }
  };

  const shouldShowUpgradePrompt = (): boolean => {
    if (eligibility.loading) return false;
    if (eligibility.hasSeenPrompt) return false;
    if (!eligibility.isEligible) return false;
    if (['active', 'trialing'].includes(eligibility.billingStatus)) return false;

    return true;
  };

  return {
    ...eligibility,
    markValueAction,
    markPromptShown,
    shouldShowUpgradePrompt,
    refresh: loadEligibility,
  };
}
