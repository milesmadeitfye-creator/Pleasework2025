// Meta/Facebook OAuth Configuration
// Ghoste Media API Ad Config - App ID: 1378729573873020
// Frontend reads from VITE_ prefixed env vars

export const FACEBOOK_APP_ID = import.meta.env.VITE_META_APP_ID || '1378729573873020';
export const FACEBOOK_REDIRECT_URI = import.meta.env.VITE_META_REDIRECT_URI || 'https://ghoste.one/.netlify/functions/meta-auth-callback';
export const META_API_VERSION = import.meta.env.VITE_META_API_VERSION || 'v20.0';
export const META_SCOPES = import.meta.env.VITE_META_SCOPES || 'public_profile,email,business_management,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,instagram_basic,instagram_content_publish,instagram_manage_insights,ads_read,ads_management,read_insights';

export const isMetaEnabled = !!FACEBOOK_APP_ID;

if (!FACEBOOK_APP_ID) {
  console.warn('[meta-config] Facebook App ID not configured; Meta connect is disabled.');
} else {
  console.log('[meta-config] ✅ Meta SDK configured');
  console.log('[meta-config]    App ID: ' + FACEBOOK_APP_ID);
  console.log('[meta-config]    Redirect URI: ' + FACEBOOK_REDIRECT_URI);
  console.log('[meta-config]    API Version: ' + META_API_VERSION);
  console.log('[meta-config]    Scopes: ' + META_SCOPES);
}
