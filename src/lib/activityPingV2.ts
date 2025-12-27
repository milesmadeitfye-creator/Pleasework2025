import { supabase } from '@/lib/supabase.client';

export interface ActivityPingPayload {
  session_id?: string;
  source?: string;
  path?: string;
}

export interface ActivityPingResponse {
  ok: boolean;
  ping_id: string;
  created_at: string;
}

/**
 * Send an activity ping to the server.
 * This writes a record to the database for verification.
 */
export async function sendActivityPingV2(
  payload?: ActivityPingPayload
): Promise<ActivityPingResponse> {
  // Get current session token
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Not authenticated. Please log in.');
  }

  // Default payload
  const body: ActivityPingPayload = {
    session_id: payload?.session_id,
    source: payload?.source || 'app',
    path: payload?.path || window.location.pathname,
  };

  const response = await fetch('/.netlify/functions/activity-ping-v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Ping failed with status ${response.status}`
    );
  }

  const data = await response.json();
  return data;
}
