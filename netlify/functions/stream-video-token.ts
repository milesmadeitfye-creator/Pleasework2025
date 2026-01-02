import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { StreamClient } from "@stream-io/node-sdk";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STREAM_API_KEY = process.env.STREAM_API_KEY!;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET!;

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
        body: JSON.stringify({ ok: false, error: "Method not allowed" })
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.error('[stream-video-token] Missing Authorization header');
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: "Missing Authorization" })
      };
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const partyId = body.partyId || body.callId; // Support both parameter names
    const role = body.role || 'viewer'; // Default to viewer if not specified
    const callType = 'livestream'; // Always use livestream for listening parties

    if (!partyId) {
      console.error('[stream-video-token] Missing partyId in request body');
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing partyId parameter" })
      };
    }

    console.log('[stream-video-token] Request params:', { partyId, role, callType });

    // Verify auth
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      console.error('[stream-video-token] Invalid auth:', userErr);
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: "Invalid auth" })
      };
    }
    const user = userRes.user;

    console.log('[stream-video-token] User verified:', user.id);

    // Query listening party to validate permissions
    const { data: party, error: partyErr } = await supabaseAdmin
      .from('listening_parties')
      .select('id, owner_user_id, host_user_id, is_public, status')
      .eq('id', partyId)
      .maybeSingle();

    if (partyErr || !party) {
      console.error('[stream-video-token] Party not found:', partyErr?.message || 'No party');
      return {
        statusCode: 404,
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
          body: JSON.stringify({ ok: false, error: "Permission denied: Party is private" })
        };
      }
    }

    console.log('[stream-video-token] Permission check passed for role:', role);

    // Get user profile for display name
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('first_name, last_name, display_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const displayName =
      profile?.display_name ||
      profile?.first_name ||
      profile?.email?.split('@')[0] ||
      `User ${user.id.slice(0, 8)}`;

    console.log('[stream-video-token] User display name:', displayName);

    // Create Stream client (server-side SDK)
    const streamClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);

    // Generate user token
    const userId = user.id;

    // Create or update user in Stream (upsert)
    await streamClient.upsertUsers({
      users: {
        [userId]: {
          id: userId,
          name: displayName,
          role: 'user',
        },
      },
    });

    console.log('[stream-video-token] User upserted in Stream:', userId);

    // Ensure call exists (idempotent) - use partyId as callId
    console.log('[stream-video-token] Ensuring call exists:', { callType, callId: partyId });
    const call = streamClient.video.call(callType, partyId);

    // Create call with proper creator
    await call.getOrCreate({
      data: {
        created_by_id: ownerId, // Use party owner as creator
        members: role === 'host' ? [{ user_id: userId, role: 'host' }] : undefined,
      },
    });

    console.log('[stream-video-token] Call created/verified on Stream servers');

    // Generate token (expires in 24 hours)
    const expirationTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const token = streamClient.generateUserToken({
      user_id: userId,
      exp: expirationTime,
    });

    console.log('[stream-video-token] Token generated successfully:', {
      userId,
      role,
      partyId,
      callType,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: true,
        token,
        userId,
        userName: displayName,
        apiKey: STREAM_API_KEY,
        callType,
        callId: partyId, // Return as callId for client compatibility
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
