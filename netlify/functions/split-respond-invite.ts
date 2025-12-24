/**
 * Split Respond Invite
 * Allows recipients to accept or decline split offers via invite token
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[split-respond-invite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { inviteToken, status, counterOffer } = body;

    if (!inviteToken || !status || !['accepted', 'declined', 'countered'].includes(status)) {
      return jsonResponse(400, {
        success: false,
        error: 'Invalid data. inviteToken and status (accepted/declined/countered) required',
      });
    }

    // Validate counter offer data if status is countered
    if (status === 'countered' && !counterOffer) {
      return jsonResponse(400, {
        success: false,
        error: 'Counter offer data required when status is countered',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Find participant by invite token with full details
    const { data: participant, error: participantError } = await supabase
      .from('split_participants')
      .select('id, invite_status, negotiation_id, name, email, role, master_percent, pub_percent')
      .eq('invite_token', inviteToken)
      .maybeSingle();

    if (participantError || !participant) {
      console.error('[split-respond-invite] Participant not found', participantError);
      return jsonResponse(404, {
        success: false,
        error: 'Invite not found',
      });
    }

    // Check if already responded
    if (participant.invite_status !== 'pending') {
      return jsonResponse(400, {
        success: false,
        error: 'Offer already responded to',
        currentStatus: participant.invite_status,
      });
    }

    // Handle counter offer
    if (status === 'countered') {
      const { master_percent, pub_percent, role, notes, reason } = counterOffer;

      // Get negotiation details to fetch the owner
      const { data: negotiation, error: negError } = await supabase
        .from('split_negotiations')
        .select('user_id, title, project_name')
        .eq('id', participant.negotiation_id)
        .maybeSingle();

      if (negError || !negotiation) {
        console.error('[split-respond-invite] Negotiation not found', negError);
        return jsonResponse(404, {
          success: false,
          error: 'Associated negotiation not found',
        });
      }

      // Create new counter-offer participant for the original sender
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('user_id', negotiation.user_id)
        .maybeSingle();

      const { data: counterParticipant, error: counterError } = await supabase
        .from('split_participants')
        .insert({
          negotiation_id: participant.negotiation_id,
          name: ownerProfile?.full_name || 'Original Sender',
          email: ownerProfile?.email || '',
          role: 'Received Counter Offer',
          master_percent: master_percent !== undefined ? master_percent : participant.master_percent,
          pub_percent: pub_percent !== undefined ? pub_percent : participant.pub_percent,
          invite_status: 'pending',
          invite_token: crypto.randomUUID(),
          invited_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (counterError) {
        console.error('[split-respond-invite] Failed to create counter participant', counterError);
        return jsonResponse(500, {
          success: false,
          error: 'Failed to create counter offer',
        });
      }

      // Update original participant to show countered
      await supabase
        .from('split_participants')
        .update({
          invite_status: 'countered',
          responded_at: new Date().toISOString(),
          notes: reason ? `Counter reason: ${reason}` : 'Counter offer sent',
        })
        .eq('id', participant.id);

      // TODO: Send email to original sender with counter offer details and new invite link
      // const counterReviewUrl = `${process.env.URL || 'https://ghoste.one'}/splits/review/${counterParticipant.invite_token}`;
      // ... send email ...

      console.log(`[split-respond-invite] Counter offer created for negotiation ${participant.negotiation_id}`);

      return jsonResponse(200, {
        success: true,
        status: 'countered',
        message: 'Counter offer sent successfully',
        counterParticipantId: counterParticipant.id,
      });
    }

    // Update participant status for accept/decline
    const { error: updateError } = await supabase
      .from('split_participants')
      .update({
        invite_status: status,
        responded_at: new Date().toISOString(),
      })
      .eq('id', participant.id);

    if (updateError) {
      console.error('[split-respond-invite] Failed to update status', updateError);
      return jsonResponse(500, {
        success: false,
        error: 'Failed to update offer status',
      });
    }

    console.log(`[split-respond-invite] Participant ${participant.id} ${status} the offer`);

    return jsonResponse(200, {
      success: true,
      status,
      message: `Offer ${status} successfully`,
    });
  } catch (err: any) {
    console.error('[split-respond-invite] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'Internal server error',
      message: err.message,
    });
  }
};

export default handler;
