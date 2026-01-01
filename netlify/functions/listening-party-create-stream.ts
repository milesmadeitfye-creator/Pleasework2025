import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { StreamClient } from "@stream-io/node-sdk";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STREAM_API_KEY = process.env.STREAM_API_KEY!;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET!;

/**
 * Create a Stream video room/call for a listening party
 *
 * This function:
 * 1. Creates a real Stream video call/room
 * 2. Updates listening_parties with stream_app_id and stream_url
 * 3. Sets is_live, status, live_started_at ONLY after successful creation
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Missing Authorization" }) };
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify auth
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userRes?.user) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Invalid auth" }) };
    }
    const user = userRes.user;

    const body = event.body ? JSON.parse(event.body) : {};
    const partyId = String(body.partyId || "").trim();
    const rawMicId = String(body.micDeviceId || "");
    const rawCamId = String(body.camDeviceId || "");
    const micEnabled = body.micEnabled === true;
    const cameraEnabled = body.cameraEnabled === true;
    const micDeviceId = rawMicId.trim();
    const camDeviceId = rawCamId.trim();
    const width = Math.max(240, parseInt(body.width) || 1280);
    const height = Math.max(240, parseInt(body.height) || 720);

    console.log('[listening-party-create-stream] Received request:', {
      partyId,
      rawMicId,
      rawCamId,
      micEnabled,
      cameraEnabled,
      normalizedMicId: micDeviceId,
      normalizedCamId: camDeviceId,
      hasMicId: !!micDeviceId,
      hasCamId: !!camDeviceId,
      width,
      height,
    });

    if (!partyId) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing partyId" }) };
    }

    // Validate microphone and camera
    if (!micEnabled) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Turn on your microphone to go live.",
          code: "MIC_DISABLED"
        })
      };
    }

    if (!cameraEnabled) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Turn on your camera to go live.",
          code: "CAMERA_DISABLED"
        })
      };
    }

    if (!micDeviceId || micDeviceId === 'default') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Please select a microphone from the dropdown.",
          code: "INVALID_MIC"
        })
      };
    }

    if (!camDeviceId || camDeviceId === 'default') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Please select a camera from the dropdown.",
          code: "INVALID_CAMERA"
        })
      };
    }

    console.log('[listening-party-create-stream] Validation passed, creating stream for party:', {
      partyId,
      micDeviceId,
      camDeviceId,
      micEnabled,
      cameraEnabled,
      width,
      height,
    });

    // Fetch party and verify ownership
    const { data: party, error: partyErr } = await supabaseAdmin
      .from("listening_parties")
      .select("*")
      .eq("id", partyId)
      .maybeSingle();

    if (partyErr || !party) {
      console.error('[listening-party-create-stream] Party not found:', partyErr);
      return { statusCode: 404, body: JSON.stringify({ ok: false, error: "Party not found" }) };
    }

    // Verify ownership
    const isOwner = party.owner_user_id === user.id;
    const isHost = party.host_user_id === user.id;
    const isLegacyUser = party.user_id === user.id;

    if (!isOwner && !isHost && !isLegacyUser) {
      console.error('[listening-party-create-stream] Authorization failed');
      return { statusCode: 403, body: JSON.stringify({ ok: false, error: "Not authorized" }) };
    }

    console.log('[listening-party-create-stream] Authorization passed, creating Stream video call...');

    // Create Stream video client (server-side SDK)
    const streamClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);

    // Create video call (call type: 'default', call ID: party ID)
    const callId = partyId;
    const callType = 'default';

    try {
      // Create or get call
      const call = streamClient.video.call(callType, callId);

      // Create the call on Stream's servers with proper settings_override
      await call.create({
        data: {
          created_by_id: user.id,
          settings_override: {
            audio: {
              mic_default_on: true,
              default_device: micDeviceId,
            },
            video: {
              camera_default_on: true,
              default_device: camDeviceId,
              target_resolution: {
                width: width,
                height: height,
              },
            },
          },
        },
      });

      console.log('[listening-party-create-stream] Stream call created successfully:', {
        callType,
        callId,
        micDeviceId,
        camDeviceId,
        resolution: `${width}x${height}`,
      });

      // Construct join URL for viewers
      const stream_app_id = callId;
      const stream_url = `${STREAM_API_KEY}/${callType}/${callId}`;

      console.log('[listening-party-create-stream] Updating database with stream info...');

      // Clean up any bad legacy data (Spotify URLs in stream_url)
      const updatePayload: any = {
        stream_app_id,
        stream_url,
        is_public: true,
        is_live: true,
        live_started_at: new Date().toISOString(),
        status: 'live',
      };

      console.log('[listening-party-create-stream] Update payload:', updatePayload);

      // Safety: Clear spotify_track_url from stream_url if it was wrongly stored there
      if (party.stream_url && party.stream_url.includes('spotify.com')) {
        console.log('[listening-party-create-stream] Warning: Clearing bad Spotify URL from stream_url');
      }

      // Update party with stream info
      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from('listening_parties')
        .update(updatePayload)
        .eq('id', partyId)
        .select('id, status, is_live, is_public, stream_app_id')
        .maybeSingle();

      if (updateError) {
        console.error('[listening-party-create-stream] Database update failed:', {
          error: updateError,
          message: updateError.message,
          code: updateError.code,
          details: updateError.details
        });
        throw new Error(`Failed to update party: ${updateError.message}`);
      }

      if (!updatedRow) {
        console.error('[listening-party-create-stream] Update succeeded but no row returned. This may indicate RLS blocking SELECT.');
        // Don't throw - the update likely succeeded, we just can't verify it
      } else {
        console.log('[listening-party-create-stream] Database updated successfully:', {
          id: updatedRow.id,
          status: updatedRow.status,
          is_live: updatedRow.is_live,
          is_public: updatedRow.is_public,
          stream_app_id: updatedRow.stream_app_id
        });
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          stream_app_id,
          stream_url,
          message: 'Stream created successfully',
        }),
      };
    } catch (streamErr: any) {
      console.error('[listening-party-create-stream] Stream call creation failed:', {
        error: streamErr,
        message: streamErr?.message,
        code: streamErr?.code,
        details: streamErr?.details
      });

      // Determine if this is a user error (400) or server error (500)
      const errorMessage = streamErr?.message || String(streamErr);
      const isUserError = errorMessage && (
        errorMessage.includes('device') ||
        errorMessage.includes('microphone') ||
        errorMessage.includes('camera') ||
        errorMessage.includes('permission') ||
        errorMessage.includes('resolution') ||
        errorMessage.includes('audio') ||
        errorMessage.includes('video')
      );

      // Provide better error messages based on common issues
      let userFriendlyError = 'Failed to create video stream. Please check your camera and microphone.';

      if (errorMessage.includes('audio') || errorMessage.includes('microphone') || errorMessage.includes('mic')) {
        userFriendlyError = 'Microphone setup failed. Please check your microphone is connected and browser permissions are granted.';
      } else if (errorMessage.includes('video') || errorMessage.includes('camera') || errorMessage.includes('cam')) {
        userFriendlyError = 'Camera setup failed. Please check your camera is connected and browser permissions are granted.';
      } else if (errorMessage.includes('resolution')) {
        userFriendlyError = 'Video resolution too low. Please try a different camera or adjust settings.';
      } else if (errorMessage.includes('permission')) {
        userFriendlyError = 'Browser permissions denied. Please allow camera and microphone access.';
      }

      return {
        statusCode: isUserError ? 400 : 500,
        body: JSON.stringify({
          ok: false,
          error: isUserError ? userFriendlyError : `Server error: ${errorMessage}`,
          code: streamErr?.code || 'STREAM_ERROR'
        }),
      };
    }
  } catch (e: any) {
    console.error('[listening-party-create-stream] Error:', e);

    // Return 400 for validation/user errors, 500 for server errors
    const isUserError = e?.message && (
      e.message.includes('Missing') ||
      e.message.includes('Invalid') ||
      e.message.includes('not found') ||
      e.message.includes('not authorized')
    );

    return {
      statusCode: isUserError ? 400 : 500,
      body: JSON.stringify({ ok: false, error: e?.message || "Server error" }),
    };
  }
};
