import { supabase } from './supabase';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'completed' | 'skipped';
  due_at: string | null;
  calendar_id: string | null;
  calendar_event_id: string | null;
  reminder_channel: 'none' | 'email' | 'sms' | 'both';
  reminder_minutes_before: number;
  created_at: string;
  updated_at: string;
  category?: string | null;
  color?: string | null;
  icon?: string | null;
  source?: string | null;
}

/**
 * Fetches all tasks for the current user, ordered by due date
 */
export async function fetchTasks(): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_at', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[fetchTasks] Error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[fetchTasks] Exception:', error);
    throw error;
  }
}

/**
 * Creates or updates a task
 */
export async function upsertTask(
  payload: Partial<Task> & { title: string }
): Promise<Task> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('[upsertTask] Error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[upsertTask] Exception:', error);
    throw error;
  }
}

/**
 * Marks a task as completed
 */
export async function completeTask(id: string): Promise<Task> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[completeTask] Error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[completeTask] Exception:', error);
    throw error;
  }
}

/**
 * Deletes a task
 */
export async function deleteTask(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[deleteTask] Error:', error);
      throw error;
    }
  } catch (error) {
    console.error('[deleteTask] Exception:', error);
    throw error;
  }
}
