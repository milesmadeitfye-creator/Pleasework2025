import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  const META_APP_ID =
    process.env.META_APP_ID ||
    process.env.VITE_META_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    process.env.VITE_FACEBOOK_APP_ID;

  const META_APP_SECRET =
    process.env.META_APP_SECRET ||
    process.env.VITE_META_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.VITE_FACEBOOK_APP_SECRET;

  const META_REDIRECT_URI =
    process.env.META_REDIRECT_URI ||
    process.env.VITE_META_REDIRECT_URI ||
    process.env.FACEBOOK_REDIRECT_URI ||
    process.env.VITE_FACEBOOK_REDIRECT_URI ||
    'https://ghoste.one/api/meta/callback';

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const META_SCOPES =
    process.env.META_OAUTH_SCOPES ||
    'ads_read,ads_management,business_management,pages_show_list,pages_read_engagement';

  const hasAppId = Boolean(META_APP_ID);
  const hasAppSecret = Boolean(META_APP_SECRET);
  const hasRedirectUri = Boolean(META_REDIRECT_URI);
  const hasSupabaseUrl = Boolean(SUPABASE_URL);
  const hasSupabaseKey = Boolean(SUPABASE_SERVICE_KEY);

  const metaReady = hasAppId && hasAppSecret && hasRedirectUri;
  const supabaseReady = hasSupabaseUrl && hasSupabaseKey;
  const fullyConfigured = metaReady && supabaseReady;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      configured: fullyConfigured,
      meta: {
        ready: metaReady,
        appId: hasAppId ? META_APP_ID?.substring(0, 8) + '...' : 'MISSING',
        appSecret: hasAppSecret ? '***SET***' : 'MISSING',
        redirectUri: hasRedirectUri ? META_REDIRECT_URI : 'MISSING',
        scopes: META_SCOPES,
      },
      supabase: {
        ready: supabaseReady,
        url: hasSupabaseUrl ? SUPABASE_URL?.substring(0, 30) + '...' : 'MISSING',
        serviceKey: hasSupabaseKey ? '***SET***' : 'MISSING',
      },
      instructions: fullyConfigured
        ? 'All configuration complete! You can now connect Meta.'
        : 'Configuration incomplete. See META_SETUP_GUIDE.md for setup instructions.',
    }),
  };
};
