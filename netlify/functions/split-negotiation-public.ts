import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_supabaseAdmin';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: '',
    };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return json(400, { error: 'Missing token' });
  }

  if (event.httpMethod === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('split_negotiations')
      .select(
        `
        id,
        public_token,
        song_title,
        primary_artist,
        recipient_name,
        recipient_email,
        status,
        proposed_split,
        role,
        notes,
        created_at,
        updated_at
      `
      )
      .eq('public_token', token)
      .single();

    if (error || !data) {
      console.error('[split-negotiation-public] GET error:', error);
      return json(404, { error: 'Offer not found' });
    }

    return json(200, { negotiation: data });
  }

  if (event.httpMethod === 'POST') {
    if (!event.body) {
      return json(400, { error: 'Missing body' });
    }

    try {
      const body = JSON.parse(event.body);
      const action: 'accept' | 'reject' | 'counter' = body.action;
      const ip =
        event.headers['client-ip'] ||
        event.headers['x-forwarded-for'] ||
        event.headers['x-nf-client-connection-ip'] ||
        '';

      const { data: negotiation, error } = await supabaseAdmin
        .from('split_negotiations')
        .select('*')
        .eq('public_token', token)
        .single();

      if (error || !negotiation) {
        console.error('[split-negotiation-public] POST fetch error:', error);
        return json(404, { error: 'Offer not found' });
      }

      if (negotiation.status !== 'pending' && negotiation.status !== 'countered' && negotiation.status !== 'in_progress') {
        return json(400, { error: 'This offer is no longer active.' });
      }

      if (action === 'accept') {
        const signature = body.signature;
        if (!signature || typeof signature !== 'string') {
          return json(400, { error: 'Signature is required to accept.' });
        }

        const { data: updated, error: updateError } = await supabaseAdmin
          .from('split_negotiations')
          .update({
            status: 'accepted',
            recipient_signature: signature,
            recipient_signed_at: new Date().toISOString(),
            recipient_ip: ip || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', negotiation.id)
          .select('id, status, recipient_signed_at')
          .single();

        if (updateError) {
          console.error('[split-negotiation-public] accept error:', updateError);
          return json(500, { error: 'Failed to accept offer' });
        }

        // Send notification to creator (inline to avoid heavy import)
        try {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'Split offer accepted',
              message: `${negotiation.recipient_name ?? 'A collaborator'} accepted your split for "${negotiation.song_title}".`,
              entity_type: 'split_negotiation',
              entity_id: negotiation.id,
              data: { status: 'accepted' },
            });
        } catch (err) {
          console.error('[split-negotiation-public] notification error:', err);
        }

        return json(200, { ok: true, negotiation: updated });
      }

      if (action === 'reject') {
        const reason = body.reason as string | undefined;
        const newNotes = reason
          ? `${negotiation.notes ?? ''}\nRecipient note: ${reason}`
          : negotiation.notes;

        const { data: updated, error: updateError } = await supabaseAdmin
          .from('split_negotiations')
          .update({
            status: 'rejected',
            notes: newNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', negotiation.id)
          .select('id, status')
          .single();

        if (updateError) {
          console.error('[split-negotiation-public] reject error:', updateError);
          return json(500, { error: 'Failed to reject offer' });
        }

        // Send notification to creator (inline to avoid heavy import)
        try {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'Split offer rejected',
              message: `${negotiation.recipient_name ?? 'A collaborator'} rejected your split for "${negotiation.song_title}".`,
              entity_type: 'split_negotiation',
              entity_id: negotiation.id,
              data: { status: 'rejected' },
            });
        } catch (err) {
          console.error('[split-negotiation-public] notification error:', err);
        }

        return json(200, { ok: true, negotiation: updated });
      }

      if (action === 'counter') {
        const proposed_split = body.proposed_split;
        const role = body.role;
        const notes = body.notes;

        const { data: counter, error: insertError } = await supabaseAdmin
          .from('split_negotiations')
          .insert({
            song_title: negotiation.song_title,
            primary_artist: negotiation.primary_artist,
            user_id: negotiation.user_id,
            created_by: negotiation.created_by,
            recipient_email: negotiation.recipient_email,
            recipient_name: negotiation.recipient_name,
            proposed_split:
              proposed_split !== undefined ? proposed_split : negotiation.proposed_split,
            role: role ?? negotiation.role,
            notes: notes ?? negotiation.notes,
            status: 'countered',
            public_token: crypto.randomUUID(),
          })
          .select('*')
          .single();

        if (insertError) {
          console.error('[split-negotiation-public] counter insert error:', insertError);
          return json(500, { error: 'Failed to create counter-offer' });
        }

        await supabaseAdmin
          .from('split_negotiations')
          .update({
            status: 'countered',
            updated_at: new Date().toISOString(),
          })
          .eq('id', negotiation.id);

        // Send notification to creator (inline to avoid heavy import)
        try {
          await supabaseAdmin
            .from('notifications')
            .insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'New counter offer received',
              message: `${negotiation.recipient_name ?? 'A collaborator'} sent a counter offer for "${negotiation.song_title}".`,
              entity_type: 'split_negotiation',
              entity_id: counter.id,
              data: { status: 'countered' },
            });
        } catch (err) {
          console.error('[split-negotiation-public] notification error:', err);
        }

        return json(200, { ok: true, negotiation: counter });
      }

      return json(400, { error: 'Unknown action' });
    } catch (err: any) {
      console.error('[split-negotiation-public] POST error:', err);
      return json(500, { error: 'Failed to process request' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
