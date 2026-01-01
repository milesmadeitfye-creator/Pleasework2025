import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { StreamClient } from "@stream-io/node-sdk";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STREAM_API_KEY = process.env.STREAM_API_KEY!;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET!;

/**
 * Generate a server-signed Stream Video user token
 *
 * This function:
 * 1. Verifies the user's Supabase JWT
 * 2. Creates a Stream user token signed with STREAM_API_SECRET
 * 3. Returns the token + user info for client-side Stream Video SDK initialization
 */
export const handler: Handler = async (event) => {
  console.log('[stream-video-token] Request received');

  try {
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

    // Generate token (expires in 24 hours)
    const expirationTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    const token = streamClient.generateUserToken({
      user_id: userId,
      exp: expirationTime,
    });

    console.log('[stream-video-token] Token generated successfully for user:', userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        token,
        userId,
        userName: displayName,
        apiKey: STREAM_API_KEY,
      }),
    };
  } catch (e: any) {
    console.error('[stream-video-token] Error:', e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: e?.message || "Failed to generate video token"
      }),
    };
  }
};
