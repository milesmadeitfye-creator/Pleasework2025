/**
 * Stream Chat Token Generator
 * Generates user tokens for Stream Chat client-side connection
 *
 * CRITICAL: This endpoint MUST be called from the browser before connecting to Stream Chat
 * Browser must NEVER use STREAM_API_SECRET directly
 */

import type { Handler } from "@netlify/functions";
import { StreamChat } from "stream-chat";
import { supabase } from "./_sb";

const API_KEY = process.env.STREAM_API_KEY;
const API_SECRET = process.env.STREAM_API_SECRET;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Verify Stream credentials are configured
    if (!API_KEY || !API_SECRET) {
      console.error("[stream-chat-token] Missing STREAM_API_KEY or STREAM_API_SECRET");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Stream Chat is not configured. Contact support.",
          debug: {
            hasApiKey: !!API_KEY,
            hasApiSecret: !!API_SECRET,
          },
        }),
      };
    }

    // Get user from Supabase auth
    const authHeader = event.headers.authorization || event.headers.Authorization;

    let user: any = null;
    let userId: string;
    let userName: string;
    let userImage: string | undefined;

    // Try to authenticate user
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { data, error } = await supabase.auth.getUser(token);

      if (!error && data.user) {
        user = data.user;
        userId = user.id;

        // Try to get user profile for name/image
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("artist_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        userName = profile?.artist_name || user.email?.split("@")[0] || "User";
        userImage = profile?.avatar_url;
      }
    }

    // If no authenticated user, allow as guest (for public listening parties)
    if (!user) {
      // For guests, generate a random user ID
      const guestId = `guest-${Math.random().toString(36).slice(2, 10)}`;
      userId = guestId;
      userName = "Guest";

      console.log("[stream-chat-token] Guest connection:", { userId });
    } else {
      console.log("[stream-chat-token] Authenticated user:", { userId, userName });
    }

    // Generate Stream Chat token
    const serverClient = StreamChat.getInstance(API_KEY, API_SECRET);
    const token = serverClient.createToken(userId);

    console.log("[stream-chat-token] Token generated successfully:", {
      userId,
      userName,
      tokenLength: token.length,
      hasApiKey: true,
    });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: API_KEY,
        userId,
        userName,
        userImage,
        token,
        isGuest: !user,
      }),
    };
  } catch (err: any) {
    console.error("[stream-chat-token] Error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Failed to generate Stream Chat token",
        message: err?.message || "Unknown error",
      }),
    };
  }
};
