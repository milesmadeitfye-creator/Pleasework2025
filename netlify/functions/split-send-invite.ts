import type { Handler } from '@netlify/functions';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendSplitInviteEmail } from './_mailgunClient';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[split-send-invite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[split-send-invite] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[split-send-invite] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { participantId, negotiationId, splitId, collaboratorEmail, collaboratorName } = body;

    const actualNegotiationId = negotiationId || splitId;

    if (!actualNegotiationId) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'negotiationId is required',
      });
    }

    console.log('[split-send-invite] User verified', {
      userId: user.id.substring(0, 8) + '...',
      negotiationId: actualNegotiationId,
      participantId,
      collaboratorEmail,
    });

    // Ensure negotiation belongs to user
    const { data: negotiation, error: negError } = await supabase
      .from('split_negotiations')
      .select('id, project_name, user_id, created_by, public_token, recipient_email, recipient_name')
      .eq('id', actualNegotiationId)
      .maybeSingle();

    if (negError || !negotiation) {
      console.error('[split-send-invite] Negotiation not found', negError);
      return jsonResponse(404, {
        success: false,
        error: 'NEGOTIATION_NOT_FOUND',
        message: 'Split negotiation not found',
      });
    }

    if (negotiation.user_id !== user.id && negotiation.created_by !== user.id) {
      console.error('[split-send-invite] User does not own this negotiation');
      return jsonResponse(403, {
        success: false,
        error: 'FORBIDDEN',
        message: 'You do not have permission to invite collaborators to this split',
      });
    }

    // Look up participant - either by ID or by email
    let participant: any = null;

    if (participantId) {
      const { data, error } = await supabase
        .from('split_participants')
        .select('*')
        .eq('id', participantId)
        .eq('negotiation_id', actualNegotiationId)
        .maybeSingle();

      if (error) {
        console.error('[split-send-invite] Database error looking up participant by ID', {
          participantId,
          negotiationId: actualNegotiationId,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return jsonResponse(500, {
          success: false,
          error: 'DATABASE_ERROR',
          message: error.message || 'Failed to look up participant',
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }

      participant = data;
    } else if (collaboratorEmail) {
      // Try to find existing participant by email
      const { data: existing } = await supabase
        .from('split_participants')
        .select('*')
        .eq('negotiation_id', actualNegotiationId)
        .eq('email', collaboratorEmail)
        .maybeSingle();

      if (existing) {
        participant = existing;
      } else {
        // Create new participant with 0% splits
        const { data: newParticipant, error: createError } = await supabase
          .from('split_participants')
          .insert({
            negotiation_id: actualNegotiationId,
            email: collaboratorEmail,
            name: collaboratorName || collaboratorEmail,
            role: 'Collaborator',
            master_rights_pct: 0,
            publishing_rights_pct: 0,
            status: 'pending',
          })
          .select('*')
          .single();

        if (createError) {
          console.error('[split-send-invite] Database error creating participant', {
            email: collaboratorEmail,
            negotiationId: actualNegotiationId,
            message: createError.message,
            code: createError.code,
            details: createError.details,
            hint: createError.hint,
            fullError: JSON.stringify(createError, null, 2),
          });
          return jsonResponse(500, {
            success: false,
            error: 'DATABASE_ERROR',
            message: createError.message || 'Failed to create participant',
            code: createError.code,
            details: createError.details,
            hint: createError.hint,
          });
        }

        participant = newParticipant;
      }
    } else {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Either participantId or collaboratorEmail is required',
      });
    }

    if (!participant) {
      console.error('[split-send-invite] Participant not found after lookup', {
        participantId,
        collaboratorEmail,
        negotiationId: actualNegotiationId,
      });
      return jsonResponse(404, {
        success: false,
        error: 'PARTICIPANT_NOT_FOUND',
        message: 'Participant not found. Please refresh and try again.',
      });
    }

    // Ensure participant has email
    if (!participant.email) {
      console.error('[split-send-invite] Participant missing email', {
        participantId: participant.id,
        negotiationId: actualNegotiationId,
      });
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_EMAIL',
        message: 'Participant email is required to send invite',
      });
    }

    // Check if already invited
    if (participant.status === 'invited' && participant.invited_at) {
      console.log('[split-send-invite] Invite already sent to participant', {
        participantId: participant.id,
        email: participant.email,
        invitedAt: participant.invited_at,
      });
      return jsonResponse(400, {
        success: false,
        error: 'INVITE_ALREADY_SENT',
        message: 'An invite has already been sent to this participant',
      });
    }

    // Use participant-specific invite token for unique invite URL
    const publicUrl = process.env.PUBLIC_SITE_URL || 'https://ghoste.one';
    const inviteUrl = `${publicUrl}/splits/invite/${participant.invite_token || inviteToken}`;

    // Update negotiation with recipient info
    const { error: negUpdateError } = await supabase
      .from('split_negotiations')
      .update({
        recipient_email: participant.email,
        recipient_name: participant.name,
        status: 'pending',
      })
      .eq('id', actualNegotiationId);

    if (negUpdateError) {
      console.error('[split-send-invite] Failed to update negotiation recipient info', negUpdateError);
    }

    // Also generate secure token for participant (for legacy compatibility)
    const inviteToken = participant.invite_token || crypto.randomUUID();

    // Update participant with invite token and status
    const { error: updateError } = await supabase
      .from('split_participants')
      .update({
        invite_token: inviteToken,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .eq('id', participant.id);

    if (updateError) {
      console.error('[split-send-invite] Database error updating participant with invite token', {
        participantId: participant.id,
        negotiationId: actualNegotiationId,
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
        fullError: JSON.stringify(updateError, null, 2),
      });
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_ERROR',
        message: updateError.message || 'Failed to update participant',
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      });
    }

    console.log('[split-send-invite] Participant updated with invite token', { participantId: participant.id });

    // Get user profile for inviter name
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, full_name')
      .eq('id', user.id)
      .maybeSingle();

    const inviterName =
      profile?.display_name || profile?.full_name || user.email || 'A Ghoste user';

    // Send email via Mailgun
    try {
      await sendSplitInviteEmail({
        to: participant.email,
        collaboratorName: participant.name,
        inviterName,
        splitTitle: negotiation.project_name || 'Split',
        inviteUrl,
      });

      console.log('[split-send-invite] Email sent successfully');

      return jsonResponse(200, {
        success: true,
        participantId: participant.id,
        message: 'Invite sent successfully',
      });
    } catch (emailError: any) {
      console.error('[split-send-invite] Failed to send email', emailError);

      // Revert participant status since email failed
      await supabase
        .from('split_participants')
        .update({
          status: 'pending',
          invited_at: null,
        })
        .eq('id', participant.id);

      return jsonResponse(500, {
        success: false,
        error: 'EMAIL_SEND_FAILED',
        message: 'Failed to send invite email. Please check Mailgun configuration.',
      });
    }
  } catch (err: any) {
    console.error('[split-send-invite] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
