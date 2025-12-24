// src/lib/metaConfig.ts

// Frontend env values (can still override, but we provide a hard default).
const appId = import.meta.env.VITE_META_APP_ID;
const envRedirect = import.meta.env.VITE_META_REDIRECT_URI;

// Hard default redirect that we want everywhere.
const CANONICAL_REDIRECT =
  "https://ghoste.one/.netlify/functions/meta-auth-callback";

const redirectUri = envRedirect || CANONICAL_REDIRECT;

const scopes =
  import.meta.env.VITE_META_SCOPES ||
  "public_profile,email,ads_read,ads_management,business_management,pages_show_list";

const graphVersion =
  import.meta.env.VITE_META_GRAPH_API_VERSION || "v21.0";

if (!appId) {
  console.warn(
    "[Meta] VITE_META_APP_ID is missing. Facebook login will not work until it is set."
  );
}

console.log("[Meta] Frontend Meta config:", {
  appId,
  redirectUri,
  scopes,
  graphVersion,
});

export const metaPublicConfig = {
  appId,
  redirectUri,
  scopes,
  graphVersion,
};

export function buildMetaLoginUrl(state?: string) {
  if (!appId || !redirectUri) return "";

  const base = `https://www.facebook.com/${graphVersion}/dialog/oauth`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
  });

  if (state) {
    params.set("state", state);
  }

  return `${base}?${params.toString()}`;
}
