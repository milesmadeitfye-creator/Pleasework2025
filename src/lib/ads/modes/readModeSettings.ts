/**
 * Read user ads mode settings from Supabase
 */
import { supabase } from '@/lib/supabase.client';
import type { AdsModeSettings } from './types';
import { DEFAULT_PULSE_SETTINGS, DEFAULT_MOMENTUM_SETTINGS } from './types';

export async function readModeSettings(userId?: string): Promise<AdsModeSettings> {
  try {
    const { data, error } = await supabase.rpc('get_user_ads_mode_settings', {
      p_user_id: userId || undefined,
    });

    if (error) {
      console.error('[readModeSettings] RPC error:', error);
      return getDefaultSettings();
    }

    if (!data || data.length === 0) {
      return getDefaultSettings();
    }

    const settings = data[0];
    return {
      ads_mode: settings.ads_mode || 'pulse',
      pulse_settings: settings.pulse_settings || DEFAULT_PULSE_SETTINGS,
      momentum_settings: settings.momentum_settings || DEFAULT_MOMENTUM_SETTINGS,
      goal_settings: settings.goal_settings || {},
    };
  } catch (err) {
    console.error('[readModeSettings] Error:', err);
    return getDefaultSettings();
  }
}

function getDefaultSettings(): AdsModeSettings {
  return {
    ads_mode: 'pulse',
    pulse_settings: DEFAULT_PULSE_SETTINGS,
    momentum_settings: DEFAULT_MOMENTUM_SETTINGS,
    goal_settings: {},
  };
}
