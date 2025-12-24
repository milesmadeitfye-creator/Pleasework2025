import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event: HandlerEvent) => {
  const supabase = getSupabaseAdmin();

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // GET: Fetch participants for a negotiation
    if (event.httpMethod === 'GET') {
      const negotiationId = event.queryStringParameters?.negotiationId;

      if (!negotiationId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'negotiationId is required' }),
        };
      }

      // Verify ownership
      const { data: negotiation, error: negError } = await supabase
        .from('split_negotiations')
        .select('id, user_id')
        .eq('id', negotiationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (negError || !negotiation) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Not authorized to view this negotiation' }),
        };
      }

      // Fetch participants
      const { data: participants, error: participantsError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', negotiationId)
        .order('created_at', { ascending: true });

      if (participantsError) {
        console.error('[split-participants] Error fetching participants:', participantsError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: participantsError.message }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ participants: participants || [] }),
      };
    }

    // POST: Create a new participant
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const {
        negotiationId,
        name,
        email,
        role,
        masterShare,
        publishingShare,
        notes,
      } = body;

      if (!negotiationId || !name || !email || !role) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'negotiationId, name, email, and role are required',
          }),
        };
      }

      // Verify ownership
      const { data: negotiation, error: negError } = await supabase
        .from('split_negotiations')
        .select('id, user_id')
        .eq('id', negotiationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (negError || !negotiation) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Not authorized to modify this negotiation' }),
        };
      }

      // Insert participant
      const { data: participant, error: insertError } = await supabase
        .from('split_participants')
        .insert({
          negotiation_id: negotiationId,
          name: name.trim(),
          email: email.trim(),
          role: role.trim(),
          master_share: masterShare || 0,
          publishing_share: publishingShare || 0,
          notes: notes || null,
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[split-participants] Error creating participant:', insertError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: insertError.message }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ participant }),
      };
    }

    // PUT: Update an existing participant
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const {
        participantId,
        name,
        email,
        role,
        masterShare,
        publishingShare,
        notes,
      } = body;

      if (!participantId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'participantId is required' }),
        };
      }

      // Fetch participant and verify ownership of negotiation
      const { data: participant, error: fetchError } = await supabase
        .from('split_participants')
        .select('*, split_negotiations!inner(user_id)')
        .eq('id', participantId)
        .maybeSingle();

      if (fetchError || !participant) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Participant not found' }),
        };
      }

      if ((participant as any).split_negotiations?.user_id !== user.id) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Not authorized to modify this participant' }),
        };
      }

      // Build update object
      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name.trim();
      if (email !== undefined) updates.email = email.trim();
      if (role !== undefined) updates.role = role.trim();
      if (masterShare !== undefined) updates.master_share = masterShare;
      if (publishingShare !== undefined) updates.publishing_share = publishingShare;
      if (notes !== undefined) updates.notes = notes;

      // Update participant
      const { data: updated, error: updateError } = await supabase
        .from('split_participants')
        .update(updates)
        .eq('id', participantId)
        .select()
        .single();

      if (updateError) {
        console.error('[split-participants] Error updating participant:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: updateError.message }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ participant: updated }),
      };
    }

    // DELETE: Remove a participant
    if (event.httpMethod === 'DELETE') {
      const participantId = event.queryStringParameters?.participantId;

      if (!participantId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'participantId is required' }),
        };
      }

      // Fetch participant and verify ownership
      const { data: participant, error: fetchError } = await supabase
        .from('split_participants')
        .select('*, split_negotiations!inner(user_id)')
        .eq('id', participantId)
        .maybeSingle();

      if (fetchError || !participant) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Participant not found' }),
        };
      }

      if ((participant as any).split_negotiations?.user_id !== user.id) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Not authorized to delete this participant' }),
        };
      }

      // Delete participant
      const { error: deleteError } = await supabase
        .from('split_participants')
        .delete()
        .eq('id', participantId);

      if (deleteError) {
        console.error('[split-participants] Error deleting participant:', deleteError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: deleteError.message }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err: any) {
    console.error('[split-participants] Unexpected error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
