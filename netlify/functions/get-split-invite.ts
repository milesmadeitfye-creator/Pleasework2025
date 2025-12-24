/**
 * Get Split Invite Details
 * Fetches split invitation details by invite token
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
  console.log('[get-split-invite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Invite token is required',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch participant by invite_token with split details
    const { data: participant, error: participantError } = await supabase
      .from('split_participants')
      .select(`
        id,
        invite_status,
        email,
        name,
        role,
        master_percent,
        pub_percent,
        negotiation_id,
        responded_at,
        split_negotiations:negotiation_id (
          id,
          title,
          project_name,
          artist_name,
          beat_fee,
          user_id,
          user_profiles!split_negotiations_user_id_fkey(full_name, email)
        )
      `)
      .eq('invite_token', token)
      .maybeSingle();

    if (participantError) {
      console.error('[get-split-invite] Database error:', participantError);
      return jsonResponse(500, {
        success: false,
        error: 'SERVER_ERROR',
        message: 'Failed to fetch invite details',
      });
    }

    if (!participant) {
      return jsonResponse(404, {
        success: false,
        error: 'INVITE_NOT_FOUND',
        message: 'This invite link is invalid or has expired',
      });
    }

    // Extract split negotiation data
    const splitNegotiation = (participant as any).split_negotiations;
    const ownerProfile = splitNegotiation?.user_profiles;

    const response = {
      success: true,
      participant: {
        id: participant.id,
        status: participant.invite_status || 'pending',
        email: participant.email,
        name: participant.name,
        role: participant.role,
        masterShare: participant.master_percent ?? 0,
        publishingShare: participant.pub_percent ?? 0,
        respondedAt: participant.responded_at,
      },
      split: {
        id: splitNegotiation?.id,
        title: splitNegotiation?.title,
        projectName: splitNegotiation?.project_name,
        artistName: splitNegotiation?.artist_name,
        beatFee: splitNegotiation?.beat_fee,
        ownerName: ownerProfile?.full_name,
        ownerEmail: ownerProfile?.email,
      },
    };

    console.log('[get-split-invite] Successfully fetched invite details');

    return jsonResponse(200, response);
  } catch (err: any) {
    console.error('[get-split-invite] Unexpected error:', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    });
  }
};

export default handler;
