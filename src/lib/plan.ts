import { SupabaseClient, User } from '@supabase/supabase-js';

export type UserPlan = {
  plan: 'free' | 'pro';
  isPro: boolean;
};

const OWNER_EMAIL = 'miles@ghostemedia.com';

export async function getUserPlan(
  supabase: SupabaseClient,
  user: User | null
): Promise<UserPlan> {
  if (!user) {
    return { plan: 'free', isPro: false };
  }

  if (user.email && user.email.toLowerCase() === OWNER_EMAIL) {
    return { plan: 'pro', isPro: true };
  }

  // Check for ads_unlocked flag in app_metadata or user_metadata
  const adsUnlockedFromAppMeta =
    user.app_metadata &&
    (user.app_metadata.ads_unlocked === true ||
      user.app_metadata['ads_unlocked'] === true);

  const adsUnlockedFromUserMeta =
    user.user_metadata &&
    (user.user_metadata.ads_unlocked === true ||
      user.user_metadata['ads_unlocked'] === true);

  if (adsUnlockedFromAppMeta || adsUnlockedFromUserMeta) {
    return { plan: 'pro', isPro: true };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) {
    return { plan: 'free', isPro: false };
  }

  const plan = (data.plan as 'free' | 'pro') || 'free';
  return { plan, isPro: plan === 'pro' };
}
