/**
 * ACRCloud Metadata Links
 * File: netlify/functions/acrcloud-metadata-links.ts
 *
 * Server-only function to fetch track metadata from ACRCloud
 * Uses OAuth token from Supabase app_secrets table
 */
import type { Handler } from "@netlify/functions";
import { requireSecret } from "./_shared/secrets";

const BASE_URL = "https://us-api-v2.acrcloud.com";

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Fetch token from Supabase secrets (cached for 5 minutes)
    let token: string;
    try {
      token = await requireSecret("ACRCLOUD_OAUTH_TOKEN");
    } catch (err: any) {
      console.error("[ACRCloud] Failed to load token:", err.message);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "ACRCloud configuration error" }),
      };
    }

    const q = event.queryStringParameters || {};
    const params = new URLSearchParams();

    // Use ONE identifier (priority): isrc > acrid > source_url > query
    if (q.isrc) {
      params.set("isrc", q.isrc);
    } else if (q.acrid) {
      params.set("acrid", q.acrid);
    } else if (q.source_url) {
      params.set("source_url", q.source_url);
    } else if (q.query) {
      params.set("query", q.query);
    } else {
      return {
        statusCode: 400,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          error: "Provide at least one of: isrc, acrid, source_url, or query",
        }),
      };
    }

    // ✅ ACR LIMIT: Max 5 platforms per request
    // Priority order: Spotify, Apple Music, YouTube, Amazon Music, Tidal
    params.set("platforms", q.platforms || "spotify,applemusic,youtube,amazonmusic,tidal");

    // Optional composition data
    if (q.include_composition === "true") {
      params.set("include_composition", "true");
    }

    const url = `${BASE_URL}/api/external-metadata/tracks?${params.toString()}`;

    console.log("[ACRCloud] Fetching metadata:", { url: url.split("?")[0], params: params.toString() });

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("[ACRCloud] API error:", resp.status, data);
    }

    return {
      statusCode: resp.status,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify(data),
    };
  } catch (e: any) {
    console.error("[ACRCloud] Function error:", e);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "ACRCloud metadata fetch failed",
        message: e?.message || "Unknown error",
      }),
    };
  }
};
