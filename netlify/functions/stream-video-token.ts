import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const STREAM_API_KEY = process.env.STREAM_API_KEY || '';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || '';

/**
 * Generate a server-signed Stream Video user token for Listening Parties
 *
 * This function:
 * 1. Verifies the user's Supabase JWT
 * 2. Validates permissions (host must own party, viewers need public access)
 * 3. Creates a Stream user token signed with STREAM_API_SECRET
 * 4. Returns the token + user info for client-side Stream Video SDK initialization
 */
export const handler: Handler = async (event) => {
  console.log('[stream-video-token] Request received');

  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ ok: true })
      };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: "Method not allowed" })
      };
    }

    // Validate environment
    if (!STREAM_API_KEY || !STREAM_API_SECRET) {
      console.error('[stream-video-token] Missing Stream environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Stream not configured',
          code: 'STREAM_ENV_MISSING'
        })
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[stream-video-token] Missing Supabase environment variables');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Server configuration error',
          code: 'CONFIG_ERROR'
        })
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.error('[stream-video-token] Missing Authorization header');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: "Missing Authorization" })
      };
    }

    // Step 1: Verify JWT with auth client
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !user) {
      console.error('[stream-video-token] Invalid auth:', authError?.message);
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: "Invalid auth" })
      };
    }

    console.log('[stream-video-token] User verified:', user.id);

    // Step 2: Create admin client for database queries
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const partyId = body.partyId || body.callId; // Support both parameter names
    const role = body.role || 'viewer'; // Default to viewer if not specified

    if (!partyId) {
      console.error('[stream-video-token] Missing partyId in request body');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: "Missing partyId parameter" })
      };
    }

    console.log('[stream-video-token] Request params:', { partyId, role });

    // Query listening party to validate permissions
    const { data: party, error: partyErr } = await admin
      .from('listening_parties')
      .select('id, owner_user_id, host_user_id, is_public, status')
      .eq('id', partyId)
      .maybeSingle();

    if (partyErr || !party) {
      console.error('[stream-video-token] Party not found:', partyErr?.message || 'No party');
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: "Listening party not found" })
      };
    }

    // Determine actual owner (prefer owner_user_id, fallback to host_user_id)
    const ownerId = party.owner_user_id || party.host_user_id;

    console.log('[stream-video-token] Party found:', {
      partyId: party.id,
      ownerId,
      isPublic: party.is_public,
      status: party.status,
      requestingRole: role,
    });

    // Permission checks
    if (role === 'host') {
      // Host must be the owner
      if (user.id !== ownerId) {
        console.error('[stream-video-token] Permission denied: User is not party owner', {
          userId: user.id,
          ownerId,
        });
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: "Permission denied: Only party owner can be host" })
        };
      }
    } else {
      // Viewers can join if:
      // 1. Party is public, OR
      // 2. User is the owner
      const isOwner = user.id === ownerId;
      if (!party.is_public && !isOwner) {
        console.error('[stream-video-token] Permission denied: Party is not public and user is not owner', {
          userId: user.id,
          ownerId,
          isPublic: party.is_public,
        });
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: "Permission denied: Party is private" })
        };
      }
    }

    console.log('[stream-video-token] Permission check passed for role:', role);

    // Derive user name from metadata or email
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Host';

    console.log('[stream-video-token] User display name:', userName);

    // Step 3: Generate Stream Video token by signing JWT directly
    const userId = user.id;
    const issuedAt = Math.floor(Date.now() / 1000);
    const expirationTime = issuedAt + (24 * 60 * 60); // 24 hours

    const streamToken = jwt.sign(
      {
        user_id: userId,
        iat: issuedAt,
        exp: expirationTime,
      },
      STREAM_API_SECRET,
      { algorithm: 'HS256' }
    );

    console.log('[stream-video-token] Token generated successfully:', {
      userId,
      userName,
      role,
      partyId,
      tokenLength: streamToken.length,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: true,
        token: streamToken,
        userId,
        userName,
        apiKey: STREAM_API_KEY,
        callType: 'livestream',
        callId: partyId,
        partyId,
        role,
      }),
    };
  } catch (e: any) {
    console.error('[stream-video-token] Error:', e);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: false,
        error: e?.message || "Failed to generate video token"
      }),
    };
  }
};
