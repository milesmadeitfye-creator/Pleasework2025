/**
 * useUserPlan Hook
 *
 * Now uses user_profiles as the source of truth for Pro status.
 * Delegates to useUserProfile hook for consistency.
 */

import { useUserProfile } from './useUserProfile';

export function useUserPlan() {
  const { profile, isLoading, plan, isPro } = useUserProfile();

  const refresh = async () => {
    // Trigger a re-fetch by reloading the page or using a state update
    // For now, we rely on the useUserProfile hook's automatic refresh
    window.location.reload();
  };

  return {
    plan,
    isPro,
    loading: isLoading,
    refresh,
    profile,
  };
}
