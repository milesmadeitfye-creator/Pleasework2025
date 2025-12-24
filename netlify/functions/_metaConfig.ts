// Meta OAuth configuration for Netlify Functions
// Ghoste Media API Ad Config - App ID: 1378729573873020
// Reads from server-side environment variables

// Conversions API credentials - now read from environment
const META_PIXEL_ID = process.env.META_PIXEL_ID || "852830327354589";
const META_CONVERSIONS_TOKEN = process.env.META_CONVERSIONS_TOKEN || "";

if (!META_CONVERSIONS_TOKEN) {
  console.warn("[_metaConfig] META_CONVERSIONS_TOKEN not set - Conversions API will not work");
}

export function getMetaConfig() {
  const META_APP_ID = process.env.META_APP_ID!;
  const META_APP_SECRET = process.env.META_APP_SECRET!;
  const META_REDIRECT_URI = process.env.META_REDIRECT_URI!;
  const META_API_VERSION = process.env.META_GRAPH_API_VERSION || "v24.0";

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!META_APP_ID || !META_APP_SECRET) {
    console.error("[_metaConfig] Missing Meta OAuth credentials", {
      hasId: !!META_APP_ID,
      hasSecret: !!META_APP_SECRET,
      redirectUri: META_REDIRECT_URI
    });
    throw new Error("META_CONFIG_MISSING");
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[_metaConfig] Missing Supabase credentials", {
      hasUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY
    });
    throw new Error("SUPABASE_CONFIG_MISSING");
  }

  console.log("[_metaConfig] ✅ Meta SDK connected and ready for API testing", {
    appId: META_APP_ID,
    apiVersion: META_API_VERSION,
    supabaseUrl: SUPABASE_URL,
    redirectUri: META_REDIRECT_URI,
    hasAppSecret: !!META_APP_SECRET,
    scopes: "ads_read, ads_management, business_management, pages_show_list, public_profile"
  });

  return {
    META_APP_ID,
    META_APP_SECRET,
    META_REDIRECT_URI,
    META_API_VERSION,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    // Conversions API credentials (single source of truth)
    META_PIXEL_ID,
    META_CONVERSIONS_TOKEN
  };
}

export function encodeState(data: any): string {
  const json = JSON.stringify(data || {});
  return Buffer.from(json)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeState(str: string): any {
  if (!str) return null;
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (str.length % 4)) % 4);
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}
