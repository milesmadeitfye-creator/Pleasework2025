import type { Handler } from "@netlify/functions";
import { StreamChat } from "stream-chat";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const APP_ID = process.env.STREAM_APP_ID;
const API_KEY = process.env.STREAM_API_KEY;
const API_SECRET = process.env.STREAM_API_SECRET;

if (!APP_ID || !API_KEY || !API_SECRET) {
  console.warn(
    "STREAM_APP_ID, STREAM_API_KEY, or STREAM_API_SECRET is missing. Listening party API will not work."
  );
}

type PartyAction = "create" | "join";

type RequestBody = {
  action: PartyAction;
  partyId?: string;
  title?: string;
  trackUrl?: string;
  userId: string;
  userName: string;
};

function generatePublicSlug(): string {
  // Generate URL-safe, unique slug with prefix
  // Format: lp_xxxxxxxxxx (3 + 10 chars = 13 total)
  const a = Math.random().toString(36).slice(2, 10); // 8 chars
  const b = Math.random().toString(36).slice(2, 6);  // 4 chars
  return `lp_${a}${b}`;
}

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    if (!APP_ID || !API_KEY || !API_SECRET) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error:
            "Stream credentials are not configured. Ask the admin to set STREAM_APP_ID, STREAM_API_KEY, and STREAM_API_SECRET.",
        }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Empty request body." }),
      };
    }

    const body: RequestBody = JSON.parse(event.body);

    const { action, userId, userName } = body;

    if (!userId || !userName || !action) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "Missing userId, userName, or action.",
        }),
      };
    }

    const client = StreamChat.getInstance(API_KEY, API_SECRET);

    let partyId = body.partyId;
    let title = body.title?.trim();
    const trackUrl = body.trackUrl?.trim();

    if (action === "create") {
      if (!title) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "Title is required to create a listening party.",
          }),
        };
      }

      // Save to Supabase FIRST to get real UUID
      const supabase = getSupabaseAdmin();

      // Get authenticated user from headers (REQUIRED for host ownership)
      const authHeader = event.headers.authorization || event.headers.Authorization;
      let authenticatedUserId: string | null = null;

      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const { data: { user } } = await supabase.auth.getUser(token);
          authenticatedUserId = user?.id || null;
          console.log('[stream-listening-party] Authenticated user:', authenticatedUserId);
        } catch (e) {
          console.error('[stream-listening-party] Auth error:', e);
        }
      }

      if (!authenticatedUserId) {
        console.warn('[stream-listening-party] No authenticated user - host authorization will fail');
      }

      // Generate public slug with collision retry
      let publicSlug = generatePublicSlug();
      let dbError: any = null;
      let dbRow: any = null;

      // Try up to 5 times to insert with unique slug
      for (let attempt = 0; attempt < 5; attempt++) {
        const insertResult = await supabase
          .from("listening_parties")
          .insert({
            // ✅ Don't set id - let Postgres generate UUID
            owner_user_id: authenticatedUserId,   // ✅ Set owner for authorization
            host_user_id: authenticatedUserId,     // ✅ Set host for authorization
            user_id: authenticatedUserId,          // ✅ Legacy compat
            host_username: userName || "Host",
            host_display_name: userName || "Host",
            title: title,
            scheduled_time: new Date().toISOString(),
            stream_url: trackUrl || null,
            spotify_track_url: trackUrl || null,
            chat_enabled: true,
            status: "draft",                       // ✅ Start as draft (host clicks Go Live)
            slug: publicSlug,
            public_slug: publicSlug,
            is_public: false,                      // ✅ Start private (host clicks Go Live)
            share_path: `/live/${publicSlug}`,
            is_live: false,                        // ✅ Start not live (host clicks Go Live)
            current_track_url: trackUrl || null,
            current_track_title: title || null,
          })
          .select("id, public_slug, is_public, title, created_at, owner_user_id, host_user_id")
          .single();

        dbError = insertResult.error;
        dbRow = insertResult.data;

        if (!dbError && dbRow) {
          console.log(`[stream-listening-party] Party created with id: ${dbRow.id}, public_slug: ${dbRow.public_slug}`);
          break;
        }

        // Check if error is due to slug collision
        const errorMsg = String(dbError?.message || "").toLowerCase();
        if (errorMsg.includes("public_slug") || errorMsg.includes("duplicate key")) {
          console.log(`[stream-listening-party] Slug collision on attempt ${attempt + 1}, retrying...`);
          publicSlug = generatePublicSlug();
          continue;
        }

        // Other error - break and log
        break;
      }

      if (!dbRow || dbError) {
        console.error("[stream-listening-party] Failed to save party to database:", dbError);
        return {
          statusCode: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: dbError?.message || "Failed to create party in database",
            details: dbError,
          }),
        };
      }

      // ✅ Verify host fields were set
      if (!dbRow.owner_user_id || !dbRow.host_user_id) {
        console.warn('[stream-listening-party] Warning: Party created without owner/host user IDs');
      }

      // ✅ Now use the REAL UUID for Stream channel
      const realPartyId = dbRow.id;
      const realPublicSlug = dbRow.public_slug;

      const channel = client.channel("livestream", realPartyId, {
        name: title,
        partyId: realPartyId,
        trackUrl: trackUrl || null,
        created_by_id: userId,
      });

      await channel.create();

      await channel.addMembers([userId], {
        text: `${userName} started the party`,
        user_id: userId,
      });

      const token = client.createToken(userId);

      // Generate public share path using the slug
      const sharePath = `/live/${realPublicSlug}`;

      console.log('[stream-listening-party] Returning response:', {
        id: realPartyId,
        public_slug: realPublicSlug,
        sharePath,
        owner_user_id: dbRow.owner_user_id,
        host_user_id: dbRow.host_user_id
      });

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ok: true,
          appId: APP_ID,
          apiKey: API_KEY,
          partyId: realPartyId,   // ✅ Real UUID from database
          id: realPartyId,         // ✅ Also provide as 'id' for clarity
          public_slug: realPublicSlug,  // ✅ Public slug for sharing
          hostPath: `/studio/listening-parties/host/${realPartyId}`,  // ✅ Where host should go
          sharePath,               // ✅ /live/:slug for sharing with fans
          title,
          trackUrl: trackUrl || null,
          userId,
          userName,
          role: "host",
          token,
          is_public: dbRow.is_public,
          owner_user_id: dbRow.owner_user_id,
          host_user_id: dbRow.host_user_id,
        }),
      };
    }

    if (action === "join") {
      if (!partyId) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({
            error: "partyId is required to join a listening party.",
          }),
        };
      }

      const channel = client.channel("livestream", partyId);
      await channel.watch();

      await channel.addMembers([userId]);

      const state = await channel.query({});

      const token = client.createToken(userId);

      const titleFromChannel =
        (state.channel?.name as string | undefined) || "Listening Party";

      const trackFromChannel =
        (state.channel?.trackUrl as string | undefined) ||
        ((state.channel?.data as any)?.trackUrl as string | undefined) ||
        null;

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appId: APP_ID,
          apiKey: API_KEY,
          partyId,
          title: titleFromChannel,
          trackUrl: trackFromChannel,
          userId,
          userName,
          role: "listener",
          token,
        }),
      };
    }

    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Invalid action. Use 'create' or 'join'.",
      }),
    };
  } catch (err: any) {
    console.error("stream-listening-party error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error:
          err?.message ||
          "Unexpected error in stream-listening-party function.",
      }),
    };
  }
};

export { handler };
