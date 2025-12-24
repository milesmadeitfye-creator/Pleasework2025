import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const deploy_id = "healthz-rebuild-2025-12-13-001";
  const now = new Date().toISOString();

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
    body: JSON.stringify({
      ok: true,
      deploy_id,
      timestamp: now,
      query_t: event.queryStringParameters?.t ?? null,
      headers: {
        host: event.headers.host,
        "user-agent": event.headers["user-agent"],
        "x-nf-request-id": event.headers["x-nf-request-id"] ?? null,
      },
    }),
  };
};
