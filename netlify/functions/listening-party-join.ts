import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { StreamChat } from "stream-chat";
import { StreamClient } from "@stream-io/node-sdk";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STREAM_API_KEY = process.env.STREAM_API_KEY!;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET!;

/**
 * Join a listening party - creates Stream Chat users and channel
 * This function MUST be called BEFORE client tries to connect to Stream
 * to avoid "users don't exist" errors
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Missing Authorization" }) };

    const jwt = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Invalid auth" }) };
    }
    const user = userRes.user;

    const body = event.body ? JSON.parse(event.body) : {};
    const publicSlug = String(body.public_slug || "").trim();
    const partyId = String(body.party_id || "").trim();

    if (!publicSlug && !partyId) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing public_slug or party_id" }) };
    }

    // Load party (slug for public pages, id for host pages)
    let partyQuery = supabaseAdmin.from("listening_parties").select("*");

    if (partyId) partyQuery = partyQuery.eq("id", partyId);
    else partyQuery = partyQuery.eq("public_slug", publicSlug);

    const { data: party, error: partyErr } = await partyQuery.maybeSingle();

    if (partyErr || !party) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: "Party not found", details: partyErr }) };
    }

    console.log('[listening-party-join] Party loaded:', {
      id: party.id,
      public_slug: party.public_slug,
      host_user_id: party.host_user_id,
      owner_user_id: party.owner_user_id
    });

    // Create Stream Chat server client
    const chat = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

    // Viewer Stream user id (must be stable + unique)
    const viewerId = user.id; // use Supabase UUID as Stream user id

    // Use whatever name you want; never required but nice
    const viewerName = body.userName ? String(body.userName).trim() : (user.email || "Guest");

    // Host user (if stored)
    const hostId = party.host_user_id || party.owner_user_id || null;

    console.log('[listening-party-join] User info:', {
      viewerId,
      viewerName,
      hostId
    });

    // ✅ IMPORTANT: upsert users BEFORE touching channel membership
    const usersToUpsert: Record<string, any> = {
      [viewerId]: {
        id: viewerId,
        name: viewerName,
        role: "user",
      },
    };

    if (hostId) {
      usersToUpsert[String(hostId)] = {
        id: String(hostId),
        name: party.host_display_name || party.host_username || "Host",
        role: "user",
      };
    }

    console.log('[listening-party-join] Upserting users to Stream Chat:', Object.keys(usersToUpsert));
    await chat.upsertUsers(Object.values(usersToUpsert));

    // Also upsert users to Stream Video (uses same user data structure)
    const streamVideoClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);

    const videoUsersToUpsert: Record<string, any> = {};
    for (const [userId, userData] of Object.entries(usersToUpsert)) {
      videoUsersToUpsert[userId] = {
        id: userId,
        name: userData.name,
        role: userData.role,
      };
    }

    console.log('[listening-party-join] Upserting users to Stream Video:', Object.keys(videoUsersToUpsert));
    await streamVideoClient.upsertUsers({ users: videoUsersToUpsert });

    // Channel id should be deterministic + safe
    const channelId = `lp_${String(party.id).replace(/-/g, "")}`;

    // Create/update channel and ensure viewer is a member
    const members = hostId ? [String(hostId), viewerId] : [viewerId];

    console.log('[listening-party-join] Creating/updating channel:', {
      channelId,
      members
    });

    const channel = chat.channel("messaging", channelId, {
      name: party.title || "Listening Party",
      members,
      party_id: party.id,
      public_slug: party.public_slug,
    });

    // create() is idempotent-ish; Stream will return existing channel if already created
    await channel.create();

    console.log('[listening-party-join] Channel created/updated successfully');

    // Return client token + channel id
    const chatToken = chat.createToken(viewerId);

    console.log('[listening-party-join] Returning success response');

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        partyId: party.id,
        public_slug: party.public_slug,
        title: party.title,
        spotify_track_url: party.spotify_track_url,
        host_display_name: party.host_display_name,
        is_live: party.is_live,
        chat: {
          apiKey: STREAM_API_KEY,
          userId: viewerId,
          userName: viewerName,
          token: chatToken,
          channelId,
          channelType: "messaging",
        },
      }),
    };
  } catch (e: any) {
    console.error('[listening-party-join] Error:', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || "Server error" }) };
  }
};
