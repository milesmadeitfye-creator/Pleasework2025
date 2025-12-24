/**
 * Health Check Endpoint
 *
 * Returns basic health status and environment flags
 * (never returns actual secret values, only boolean flags)
 */

import type { Handler } from "@netlify/functions";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-cache",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const env = process.env;

    // Check which environment variables are set (boolean flags only)
    const envFlags = {
      SUPABASE_URL: !!env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
      MAILGUN_DOMAIN: !!env.MAILGUN_DOMAIN,
      MAILGUN_API_KEY: !!env.MAILGUN_API_KEY,
      MAILGUN_FROM: !!env.MAILGUN_FROM,
      META_APP_ID: !!env.META_APP_ID,
      META_APP_SECRET: !!env.META_APP_SECRET,
      OPENAI_API_KEY: !!env.OPENAI_API_KEY,
      STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY,
    };

    const response = {
      ok: true,
      service: "Ghoste Functions Healthcheck",
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      env: envFlags,
      netlifyContext: env.CONTEXT || "unknown",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: error.message || "Health check failed",
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
