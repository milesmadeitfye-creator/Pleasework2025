import type { Handler } from "@netlify/functions";
import { StreamClient } from "@stream-io/node-sdk";

const API_KEY = process.env.STREAM_API_KEY;
const API_SECRET = process.env.STREAM_API_SECRET;

type RequestBody = {
  partyId: string;
  userId: string;
  userName: string;
  role: "host" | "listener";
};

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
    if (!API_KEY || !API_SECRET) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error:
            "Stream video credentials are not configured. Set STREAM_API_KEY and STREAM_API_SECRET.",
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
    const { partyId, userId, userName } = body;

    if (!partyId || !userId || !userName) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
          error: "partyId, userId, and userName are required.",
        }),
      };
    }

    const serverClient = new StreamClient(API_KEY, API_SECRET);

    const call = serverClient.video.call("default", partyId);

    await call.getOrCreate({
      data: {
        created_by_id: userId,
        custom: {
          title: `Listening party – ${partyId}`,
        },
      },
    });

    const token = serverClient.createToken(userId);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: API_KEY,
        callId: partyId,
        token,
      }),
    };
  } catch (err: any) {
    console.error("stream-video-call error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error:
          err?.message ||
          "Unexpected error in stream-video-call function.",
      }),
    };
  }
};

export { handler };
