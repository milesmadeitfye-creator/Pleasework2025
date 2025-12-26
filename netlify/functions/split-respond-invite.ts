/**
 * Split Respond Invite
 * Handles recipient responses to split negotiation invites
 *
 * GET: Fetch negotiation details by participant invite token
 * POST: Accept/decline/counter the invite
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
  console.log('[split-respond-invite] Request received:', event.httpMethod);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return jsonResponse(400, { error: 'Missing token parameter' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // GET: Fetch negotiation details
  if (event.httpMethod === 'GET') {
    try {
      // Find participant by invite token
      const { data: participant, error: participantError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('invite_token', token)
        .maybeSingle();

      if (participantError || !participant) {
        console.error('[split-respond-invite] Participant not found:', participantError);
        return jsonResponse(404, {
          error: 'INVITE_NOT_FOUND',
          message: 'This invitation link is invalid or has expired.'
        });
      }

      // Fetch negotiation details
      const { data: negotiation, error: negotiationError } = await supabase
        .from('split_negotiations')
        .select('*')
        .eq('id', participant.negotiation_id)
        .maybeSingle();

      if (negotiationError || !negotiation) {
        console.error('[split-respond-invite] Negotiation not found:', negotiationError);
        return jsonResponse(404, {
          error: 'NEGOTIATION_NOT_FOUND',
          message: 'The split negotiation could not be found.'
        });
      }

      // Fetch all participants
      const { data: allParticipants, error: allParticipantsError } = await supabase
        .from('split_participants')
        .select('id, name, email, role, master_rights_pct, publishing_rights_pct, status')
        .eq('negotiation_id', participant.negotiation_id)
        .order('created_at', { ascending: true });

      if (allParticipantsError) {
        console.error('[split-respond-invite] Failed to fetch participants:', allParticipantsError);
      }

      // Get inviter info
      const { data: inviter } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', negotiation.user_id || negotiation.created_by)
        .maybeSingle();

      return jsonResponse(200, {
        success: true,
        participant: {
          id: participant.id,
          name: participant.name,
          email: participant.email,
          role: participant.role,
          master_rights_pct: participant.master_rights_pct,
          publishing_rights_pct: participant.publishing_rights_pct,
          status: participant.status,
          invited_at: participant.invited_at,
          responded_at: participant.responded_at,
          counter_master_pct: participant.counter_master_pct,
          counter_publishing_pct: participant.counter_publishing_pct,
          counter_notes: participant.counter_notes,
        },
        negotiation: {
          id: negotiation.id,
          project_name: negotiation.project_name,
          project_title: negotiation.project_title,
          description: negotiation.description,
          status: negotiation.status,
          notes: negotiation.notes,
          created_at: negotiation.created_at,
        },
        participants: allParticipants || [],
        inviter: inviter ? {
          name: inviter.full_name,
          email: inviter.email,
        } : null,
      });
    } catch (error: any) {
      console.error('[split-respond-invite] GET error:', error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'Failed to load invitation details.'
      });
    }
  }

  // POST: Accept/decline/counter
  if (event.httpMethod === 'POST') {
    try {
      if (!event.body) {
        return jsonResponse(400, { error: 'Missing request body' });
      }

      const body = JSON.parse(event.body);
      const { action, signature, reason, counter_master_pct, counter_publishing_pct, counter_notes } = body;

      if (!action || !['accept', 'decline', 'counter'].includes(action)) {
        return jsonResponse(400, {
          error: 'INVALID_ACTION',
          message: 'Action must be: accept, decline, or counter'
        });
      }

      // Find participant by invite token
      const { data: participant, error: participantError } = await supabase
        .from('split_participants')
        .select('*')
        .eq('invite_token', token)
        .maybeSingle();

      if (participantError || !participant) {
        console.error('[split-respond-invite] Participant not found:', participantError);
        return jsonResponse(404, {
          error: 'INVITE_NOT_FOUND',
          message: 'This invitation link is invalid.'
        });
      }

      // Check if already responded
      if (participant.status !== 'pending' && participant.status !== 'invited' && participant.status !== 'countered') {
        return jsonResponse(400, {
          error: 'ALREADY_RESPONDED',
          message: `You have already ${participant.status} this invitation.`
        });
      }

      const now = new Date().toISOString();

      // Handle ACCEPT
      if (action === 'accept') {
        if (!signature || !signature.trim()) {
          return jsonResponse(400, {
            error: 'SIGNATURE_REQUIRED',
            message: 'Signature is required to accept the split.'
          });
        }

        const { error: updateError } = await supabase
          .from('split_participants')
          .update({
            status: 'accepted',
            responded_at: now,
            signature_name: signature.trim(),
            signed_at: now,
            signature_status: 'signed',
          })
          .eq('id', participant.id);

        if (updateError) {
          console.error('[split-respond-invite] Accept error:', updateError);
          return jsonResponse(500, {
            error: 'UPDATE_FAILED',
            message: 'Failed to accept invitation.'
          });
        }

        // Send notification to creator
        try {
          const { data: negotiation } = await supabase
            .from('split_negotiations')
            .select('user_id, project_name')
            .eq('id', participant.negotiation_id)
            .maybeSingle();

          if (negotiation) {
            await supabase.from('notifications').insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'Split invitation accepted',
              message: `${participant.name} accepted your split invitation for "${negotiation.project_name}".`,
              entity_type: 'split_negotiation',
              entity_id: participant.negotiation_id,
              data: { participant_id: participant.id, action: 'accepted' },
            });
          }
        } catch (err) {
          console.error('[split-respond-invite] Notification error:', err);
        }

        return jsonResponse(200, {
          success: true,
          action: 'accepted',
          message: 'You have successfully accepted the split invitation.',
        });
      }

      // Handle DECLINE
      if (action === 'decline') {
        const { error: updateError } = await supabase
          .from('split_participants')
          .update({
            status: 'declined',
            responded_at: now,
            counter_notes: reason || null,
          })
          .eq('id', participant.id);

        if (updateError) {
          console.error('[split-respond-invite] Decline error:', updateError);
          return jsonResponse(500, {
            error: 'UPDATE_FAILED',
            message: 'Failed to decline invitation.'
          });
        }

        // Send notification to creator
        try {
          const { data: negotiation } = await supabase
            .from('split_negotiations')
            .select('user_id, project_name')
            .eq('id', participant.negotiation_id)
            .maybeSingle();

          if (negotiation) {
            await supabase.from('notifications').insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'Split invitation declined',
              message: `${participant.name} declined your split invitation for "${negotiation.project_name}".`,
              entity_type: 'split_negotiation',
              entity_id: participant.negotiation_id,
              data: { participant_id: participant.id, action: 'declined', reason },
            });
          }
        } catch (err) {
          console.error('[split-respond-invite] Notification error:', err);
        }

        return jsonResponse(200, {
          success: true,
          action: 'declined',
          message: 'You have declined the split invitation.',
        });
      }

      // Handle COUNTER
      if (action === 'counter') {
        if (counter_master_pct === undefined || counter_publishing_pct === undefined) {
          return jsonResponse(400, {
            error: 'MISSING_PERCENTAGES',
            message: 'Counter proposal must include master and publishing percentages.'
          });
        }

        if (counter_master_pct < 0 || counter_master_pct > 100 ||
            counter_publishing_pct < 0 || counter_publishing_pct > 100) {
          return jsonResponse(400, {
            error: 'INVALID_PERCENTAGES',
            message: 'Percentages must be between 0 and 100.'
          });
        }

        const { error: updateError } = await supabase
          .from('split_participants')
          .update({
            status: 'countered',
            responded_at: now,
            counter_master_pct,
            counter_publishing_pct,
            counter_notes: counter_notes || null,
          })
          .eq('id', participant.id);

        if (updateError) {
          console.error('[split-respond-invite] Counter error:', updateError);
          return jsonResponse(500, {
            error: 'UPDATE_FAILED',
            message: 'Failed to submit counter proposal.'
          });
        }

        // Send notification to creator
        try {
          const { data: negotiation } = await supabase
            .from('split_negotiations')
            .select('user_id, project_name')
            .eq('id', participant.negotiation_id)
            .maybeSingle();

          if (negotiation) {
            await supabase.from('notifications').insert({
              user_id: negotiation.user_id,
              type: 'split_negotiation',
              title: 'Counter proposal received',
              message: `${participant.name} sent a counter proposal for "${negotiation.project_name}".`,
              entity_type: 'split_negotiation',
              entity_id: participant.negotiation_id,
              data: {
                participant_id: participant.id,
                action: 'countered',
                counter_master_pct,
                counter_publishing_pct,
              },
            });
          }
        } catch (err) {
          console.error('[split-respond-invite] Notification error:', err);
        }

        return jsonResponse(200, {
          success: true,
          action: 'countered',
          message: 'Your counter proposal has been sent.',
        });
      }

      return jsonResponse(400, { error: 'Invalid action' });
    } catch (error: any) {
      console.error('[split-respond-invite] POST error:', error);
      return jsonResponse(500, {
        error: 'SERVER_ERROR',
        message: 'Failed to process your response.'
      });
    }
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};

export default handler;
