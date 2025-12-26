import { supabase } from './supabase';

export type ValueAction =
  | 'smart_link_created'
  | 'one_click_created'
  | 'message_drafted'
  | 'ai_used'
  | 'analytics_viewed';

export async function trackValueAction(action: ValueAction): Promise<void> {
  try {
    await supabase.rpc('mark_value_action', { p_action_key: action });
  } catch (err) {
    console.warn('[trackValueAction] Failed to track action:', action, err);
  }
}
