import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { completeOnboardingEvent } from '../lib/scheduler/complete';

interface OnboardingStateRow {
  user_id: string;
  has_chatted_with_ai: boolean;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingDerivedState {
  emailConfirmed: boolean;
  hasSmartLink: boolean;
  hasConnectedSpotify: boolean;
  hasChattedWithAI: boolean;
  dismissed: boolean;
  requiredStepsCompleted: number;
  allRequiredComplete: boolean;
}

export interface UseOnboardingStateReturn {
  state: OnboardingDerivedState | null;
  loading: boolean;
  error: Error | null;
  markChattedWithAI: () => Promise<void>;
  dismissOnboarding: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOnboardingState(): UseOnboardingStateReturn {
  const { user, emailConfirmed } = useAuth();
  const [state, setState] = useState<OnboardingDerivedState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadOnboardingState = async () => {
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load onboarding_state row
      let { data: onboardingRow, error: onboardingError } = await supabase
        .from('onboarding_state')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (onboardingError) {
        console.warn('[useOnboardingState] onboarding_state table missing or error:', onboardingError);
        // Don't throw - continue with default values
        onboardingRow = {
          user_id: user.id,
          has_chatted_with_ai: false,
          dismissed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // If no row exists, create one lazily
      if (!onboardingRow) {
        const { data: newRow, error: insertError } = await supabase
          .from('onboarding_state')
          .insert({
            user_id: user.id,
            has_chatted_with_ai: false,
            dismissed: false,
          })
          .select()
          .single();

        if (insertError) {
          console.error('[useOnboardingState] Failed to create row:', insertError);
          // Don't throw - continue with default values
          onboardingRow = {
            user_id: user.id,
            has_chatted_with_ai: false,
            dismissed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        } else {
          onboardingRow = newRow;
        }
      }

      // Check if user has at least one smart link
      const { data: smartLinks, error: smartLinksError } = await supabase
        .from('smart_links')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (smartLinksError) {
        console.error('[useOnboardingState] Failed to check smart links:', smartLinksError);
      }

      const hasSmartLink = (smartLinks && smartLinks.length > 0) || false;

      // Check if Spotify is connected
      // Try user_integrations table first
      const { data: spotifyIntegration, error: spotifyError } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', 'spotify')
        .limit(1);

      if (spotifyError) {
        console.error('[useOnboardingState] Failed to check Spotify:', spotifyError);
      }

      const hasConnectedSpotify = (spotifyIntegration && spotifyIntegration.length > 0) || false;

      // Mark corresponding scheduler events as complete (non-blocking)
      try {
        if (emailConfirmed) {
          await completeOnboardingEvent(user.id, 'Confirm your email');
        }
      } catch (e) {
        console.warn('[Onboarding] non-fatal: failed to complete email event', e);
      }

      try {
        if (hasSmartLink) {
          await completeOnboardingEvent(user.id, 'Create your first Ghoste Smart Link');
        }
      } catch (e) {
        console.warn('[Onboarding] non-fatal: failed to complete smart link event', e);
      }

      try {
        if (hasConnectedSpotify) {
          await completeOnboardingEvent(user.id, 'Connect your Spotify Artist account');
        }
      } catch (e) {
        console.warn('[Onboarding] non-fatal: failed to complete Spotify event', e);
      }

      // Calculate derived state
      const requiredSteps = [emailConfirmed, hasSmartLink, hasConnectedSpotify];
      const requiredStepsCompleted = requiredSteps.filter(Boolean).length;
      const allRequiredComplete = requiredStepsCompleted === 3;

      setState({
        emailConfirmed,
        hasSmartLink,
        hasConnectedSpotify,
        hasChattedWithAI: onboardingRow.has_chatted_with_ai,
        dismissed: onboardingRow.dismissed,
        requiredStepsCompleted,
        allRequiredComplete,
      });
    } catch (err: any) {
      console.error('[useOnboardingState] Error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOnboardingState();
  }, [user, emailConfirmed]);

  const markChattedWithAI = async () => {
    if (!user) return;

    try {
      const { error: upsertError } = await supabase
        .from('onboarding_state')
        .upsert(
          {
            user_id: user.id,
            has_chatted_with_ai: true,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (upsertError) {
        console.warn('[Onboarding] non-fatal: Failed to mark chatted with AI:', upsertError);
        // Don't throw - continue with best effort
      }

      try {
        await completeOnboardingEvent(user.id, 'Generate your first Ghoste AI campaign');
      } catch (e) {
        console.warn('[Onboarding] non-fatal: failed to complete AI campaign event', e);
      }

      // Refresh state
      await loadOnboardingState();
    } catch (err: any) {
      console.error('[useOnboardingState] markChattedWithAI error:', err);
      throw err;
    }
  };

  const dismissOnboarding = async () => {
    if (!user) return;

    try {
      const { error: upsertError } = await supabase
        .from('onboarding_state')
        .upsert(
          {
            user_id: user.id,
            dismissed: true,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (upsertError) {
        console.warn('[Onboarding] non-fatal: Failed to dismiss onboarding:', upsertError);
        // Don't throw - continue with best effort
      }

      // Refresh state
      await loadOnboardingState();
    } catch (err: any) {
      console.error('[useOnboardingState] dismissOnboarding error:', err);
      throw err;
    }
  };

  return {
    state,
    loading,
    error,
    markChattedWithAI,
    dismissOnboarding,
    refresh: loadOnboardingState,
  };
}
