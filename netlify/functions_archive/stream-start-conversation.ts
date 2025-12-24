import type { Handler } from "@netlify/functions";
import { StreamChat } from "stream-chat";

const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;

const allowedOrigins = [
  "https://ghoste.one",
  "http://localhost:5173",
];

function getOrigin(originHeader?: string) {
  if (!originHeader) return "";
  return allowedOrigins.includes(originHeader) ? originHeader : "";
}

if (!STREAM_API_KEY || !STREAM_API_SECRET) {
  console.warn("STREAM_API_KEY or STREAM_API_SECRET missing.");
}

const serverClient =
  STREAM_API_KEY && STREAM_API_SECRET
    ? StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET)
    : null;

type RequestBody = {
  hostUserId: string;
  otherUserId: string;
};

const handler: Handler = async (event) => {
  const origin = getOrigin(event.headers.origin);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": origin || "https://ghoste.one",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!serverClient) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({
        error: "Stream server client is not configured.",
      }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({ error: "Empty request body." }),
      };
    }

    const { hostUserId, otherUserId }: RequestBody = JSON.parse(event.body);

    if (!hostUserId || !otherUserId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
        body: JSON.stringify({
          error: "hostUserId and otherUserId are required.",
        }),
      };
    }

    const members = [hostUserId, otherUserId].sort();
    const channelId = `dm_${members.join("__")}`;

    const channel = serverClient.channel("messaging", channelId, {
      created_by_id: hostUserId,
      members,
    });

    await channel.create();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": origin || "https://ghoste.one",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channelId,
        type: "messaging",
      }),
    };
  } catch (err: any) {
    console.error("stream-start-conversation error:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": origin || "https://ghoste.one" },
      body: JSON.stringify({
        error:
          err?.message ||
          "Failed to start conversation. Check server logs.",
      }),
    };
  }
};

export { handler };
