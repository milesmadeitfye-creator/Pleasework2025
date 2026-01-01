/**
 * Write user ads mode settings to Supabase
 */
import { supabase } from '@/lib/supabase.client';
import type { AdsModeSettings, AdsMode, PulseSettings, MomentumSettings, GoalSettings } from './types';

interface WriteModeSettingsParams {
  userId: string;
  ads_mode?: AdsMode;
  pulse_settings?: PulseSettings;
  momentum_settings?: MomentumSettings;
  goal_settings?: Record<string, GoalSettings>;
}

export async function writeModeSettings(params: WriteModeSettingsParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('upsert_user_ads_mode_settings', {
      p_user_id: params.userId,
      p_ads_mode: params.ads_mode || null,
      p_pulse_settings: params.pulse_settings || null,
      p_momentum_settings: params.momentum_settings || null,
      p_goal_settings: params.goal_settings || null,
    });

    if (error) {
      console.error('[writeModeSettings] RPC error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[writeModeSettings] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Update a single goal's settings
 */
export async function updateGoalSettings(
  userId: string,
  goalKey: string,
  goalSettings: Partial<GoalSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Read current settings first
    const { data, error: readError } = await supabase.rpc('get_user_ads_mode_settings', {
      p_user_id: userId,
    });

    if (readError) {
      console.error('[updateGoalSettings] Read error:', readError);
      return { success: false, error: readError.message };
    }

    const currentGoalSettings = data?.[0]?.goal_settings || {};
    const updatedGoalSettings = {
      ...currentGoalSettings,
      [goalKey]: {
        ...currentGoalSettings[goalKey],
        ...goalSettings,
      },
    };

    return writeModeSettings({
      userId,
      goal_settings: updatedGoalSettings,
    });
  } catch (err: any) {
    console.error('[updateGoalSettings] Error:', err);
    return { success: false, error: err.message };
  }
}
