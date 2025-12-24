import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event: HandlerEvent) => {
  const supabase = getSupabaseAdmin();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // GET: Fetch participant and negotiation details by token
    if (event.httpMethod === 'GET') {
      const token = event.queryStringParameters?.token;

      if (!token) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'token is required' }),
        };
      }

      // Fetch participant with negotiation details
      const { data: participant, error: fetchError } = await supabase
        .from('split_participants')
        .select('*, split_negotiations!inner(*)')
        .eq('invite_token', token)
        .gt('invite_expires_at', new Date().toISOString())
        .maybeSingle();

      if (fetchError || !participant) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired invite link' }),
        };
      }

      // Fetch all participants for this negotiation (to show full split table)
      const { data: allParticipants, error: allError } = await supabase
        .from('split_participants')
        .select('id, name, role, email, master_share, publishing_share, status')
        .eq('negotiation_id', (participant as any).split_negotiations.id)
        .order('created_at', { ascending: true });

      if (allError) {
        console.error('[respond-split-invitation] Error fetching all participants:', allError);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          participant,
          negotiation: (participant as any).split_negotiations,
          allParticipants: allParticipants || [],
        }),
      };
    }

    // POST: Respond to invitation (accept/counter/decline)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { token, action, masterShare, publishingShare, counterMessage } = body;

      if (!token || !action) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'token and action are required' }),
        };
      }

      if (!['accept', 'counter', 'decline'].includes(action)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'action must be accept, counter, or decline' }),
        };
      }

      // Fetch participant
      const { data: participant, error: fetchError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('invite_token', token)
        .gt('invite_expires_at', new Date().toISOString())
        .maybeSingle();

      if (fetchError || !participant) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid or expired invite link' }),
        };
      }

      // Build update object based on action
      const updates: any = {
        updated_at: new Date().toISOString(),
      };

      if (action === 'accept') {
        updates.status = 'accepted';
        updates.counter_message = null;
      } else if (action === 'decline') {
        updates.status = 'declined';
        if (counterMessage) {
          updates.counter_message = counterMessage.trim();
        }
      } else if (action === 'counter') {
        if (masterShare === undefined || publishingShare === undefined) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'masterShare and publishingShare are required for counter action',
            }),
          };
        }

        updates.status = 'countered';
        updates.master_share = masterShare;
        updates.publishing_share = publishingShare;
        if (counterMessage) {
          updates.counter_message = counterMessage.trim();
        }
      }

      // Update participant
      const { data: updated, error: updateError } = await supabase
        .from('split_participants')
        .update(updates)
        .eq('id', participant.id)
        .select()
        .single();

      if (updateError) {
        console.error('[respond-split-invitation] Error updating participant:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: updateError.message }),
        };
      }

      // Fetch negotiation to return overall status
      const { data: negotiation, error: negError } = await supabase
        .from('split_negotiations')
        .select('*')
        .eq('id', participant.negotiation_id)
        .single();

      // Check if all participants have accepted
      const { data: allParticipants, error: allError } = await supabase
        .from('split_participants')
        .select('status')
        .eq('negotiation_id', participant.negotiation_id);

      const allAccepted = allParticipants?.every((p) => p.status === 'accepted');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          participant: updated,
          negotiation,
          allAccepted,
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err: any) {
    console.error('[respond-split-invitation] Unexpected error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
