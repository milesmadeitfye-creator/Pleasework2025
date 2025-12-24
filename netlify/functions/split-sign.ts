import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
  console.log('[split-sign] Request received');

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
    const { token, signature_name } = body;

    if (!token || !signature_name) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'token and signature_name are required',
      });
    }

    if (!signature_name.trim()) {
      return jsonResponse(400, {
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Signature name cannot be empty',
      });
    }

    console.log('[split-sign] Token provided, looking up participant...');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Look up participant by invite token
    const { data: participant, error: lookupError } = await supabase
      .from('split_participants')
      .select('id, negotiation_id, email, name, signed_at, status')
      .eq('invite_token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('[split-sign] Database error:', lookupError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to look up participant',
      });
    }

    if (!participant) {
      console.error('[split-sign] Invalid or expired token');
      return jsonResponse(400, {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired invitation link',
      });
    }

    if (participant.signed_at) {
      console.log('[split-sign] Participant already signed');
      return jsonResponse(400, {
        success: false,
        error: 'ALREADY_SIGNED',
        message: 'You have already signed this split sheet',
      });
    }

    // Get IP address from headers
    const forwardedFor = event.headers['x-forwarded-for'];
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : event.headers['client-ip'] || 'unknown';

    console.log('[split-sign] Signing participant:', {
      participantId: participant.id,
      signatureName: signature_name.trim(),
      ip: clientIp,
    });

    // Update participant with signature
    const { error: updateError } = await supabase
      .from('split_participants')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signature_name: signature_name.trim(),
        signature_ip: clientIp,
      })
      .eq('id', participant.id);

    if (updateError) {
      console.error('[split-sign] Failed to update participant:', updateError);
      return jsonResponse(500, {
        success: false,
        error: 'UPDATE_FAILED',
        message: 'Failed to save signature',
      });
    }

    console.log('[split-sign] Participant signed successfully');

    // Check if all participants have signed
    const { data: allParticipants, error: checkError } = await supabase
      .from('split_participants')
      .select('id, signed_at')
      .eq('negotiation_id', participant.negotiation_id);

    if (!checkError && allParticipants && allParticipants.length > 0) {
      const allSigned = allParticipants.every(p => p.signed_at);

      if (allSigned) {
        console.log('[split-sign] All participants signed, marking negotiation as completed');

        // Mark negotiation as completed
        await supabase
          .from('split_negotiations')
          .update({ status: 'completed' })
          .eq('id', participant.negotiation_id);
      }
    }

    return jsonResponse(200, {
      success: true,
      message: 'Split sheet signed successfully',
      participant: {
        name: participant.name,
        email: participant.email,
      },
    });
  } catch (err: any) {
    console.error('[split-sign] Unexpected error:', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
