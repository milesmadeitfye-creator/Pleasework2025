import type { Handler } from "@netlify/functions";

const json = (status: number, body: any) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: json(204, {}).headers,
      body: ""
    };
  }

  try {
    // Optional: parse body but do not fail if invalid
    let payload: any = {};
    try {
      payload = event.body ? JSON.parse(event.body) : {};
    } catch {}

    // Lightweight post-auth tasks can go here
    // MUST NOT throw or block login
    // Currently: no-op, just acknowledge receipt

    return json(200, { ok: true });
  } catch (e: any) {
    // NEVER fail client auth because of post-auth
    return json(200, { ok: true, note: "post-auth swallowed error" });
  }
};
