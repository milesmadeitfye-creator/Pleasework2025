import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export type NotificationType =
  | 'stats_update'
  | 'ad_campaign'
  | 'split_negotiation'
  | 'ai_calendar'
  | 'system';

export type NotificationRecord = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  data: any;
  read_at: string | null;
  created_at: string;
};

export async function createNotification(args: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  data?: any;
}): Promise<NotificationRecord> {
  const { userId, type, title, message, entityType, entityId, data } = args;

  const { data: inserted, error } = await supabaseAdmin
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      data: data ?? null,
    })
    .select('*')
    .single();

  if (error || !inserted) {
    console.error('createNotification error', error);
    throw new Error('Failed to create notification');
  }

  return inserted as NotificationRecord;
}

export async function listNotificationsForUser(args: {
  userId: string;
  limit?: number;
}): Promise<NotificationRecord[]> {
  const { userId, limit = 30 } = args;

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('listNotificationsForUser error', error);
    throw new Error('Failed to list notifications');
  }

  return data as NotificationRecord[];
}

export async function markAllNotificationsRead(args: {
  userId: string;
}): Promise<void> {
  const { userId } = args;

  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .eq('user_id', userId);

  if (error) {
    console.error('markAllNotificationsRead error', error);
    throw new Error('Failed to mark notifications read');
  }
}
