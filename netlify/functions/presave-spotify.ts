import type { Handler } from "@netlify/functions";

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "https://ghoste.one/api/presave/spotify/callback";

export const handler: Handler = async (event) => {
  try {
    if (!SPOTIFY_CLIENT_ID) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Spotify integration not configured",
          message: "Please configure SPOTIFY_CLIENT_ID"
        })
      };
    }

    const linkId = event.queryStringParameters?.linkId;
    if (!linkId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "linkId required" })
      };
    }

    const state = Buffer.from(JSON.stringify({ linkId })).toString('base64url');

    const scopes = 'user-library-modify user-follow-modify';
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;

    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
        "Cache-Control": "no-store"
      },
      body: ""
    };

  } catch (err: any) {
    console.error('[presave-spotify] Error:', err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
