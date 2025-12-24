import { supabase } from '../supabase';

export async function completeOnboardingEvent(userId: string, eventTitle: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('scheduler_events')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('title', eventTitle)
      .eq('source', 'auto_onboarding');

    if (error) {
      console.error('[completeOnboardingEvent] Error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[completeOnboardingEvent] Exception:', err);
    return false;
  }
}

export async function completeOnboardingEventById(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('scheduler_events')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    if (error) {
      console.error('[completeOnboardingEventById] Error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[completeOnboardingEventById] Exception:', err);
    return false;
  }
}
