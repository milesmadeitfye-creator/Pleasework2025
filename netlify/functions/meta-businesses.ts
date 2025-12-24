import { Handler, HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    // 1. Authenticate user
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'not_authenticated' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[meta-businesses] User lookup failed:', userError);
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'not_authenticated' }),
      };
    }

    console.log('[meta-businesses] Fetching businesses for user:', user.id);

    // 2. Check if user has Meta connection
    const { data: metaConn, error: metaConnError } = await supabase
      .from('meta_credentials')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (metaConnError || !metaConn?.access_token) {
      console.error('[meta-businesses] No Meta connection found');
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'NOT_CONNECTED' }),
      };
    }

    // 3. First try to get businesses from database
    const { data: dbBusinesses, error: dbError } = await supabase
      .from('meta_businesses')
      .select('business_id, name')
      .eq('user_id', user.id);

    if (!dbError && dbBusinesses && dbBusinesses.length > 0) {
      console.log('[meta-businesses] Found', dbBusinesses.length, 'businesses in database');
      const businesses = dbBusinesses.map(b => ({ id: b.business_id, name: b.name }));
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ businesses }),
      };
    }

    // 4. If not in database, fetch from Meta Graph API
    console.log('[meta-businesses] Fetching from Meta Graph API...');
    const accessToken = metaConn.access_token;

    try {
      // Use v20.0 with fields and limit for better reliability
      const graphUrl = `https://graph.facebook.com/v20.0/me/businesses?fields=id,name&limit=200`;

      const graphRes = await fetch(graphUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const graphData = await graphRes.json();

      // Log status and response preview (safe - no token)
      console.log('[meta-businesses] Meta API status:', graphRes.status);
      const responsePreview = JSON.stringify(graphData).substring(0, 500);
      console.log('[meta-businesses] Meta API response preview:', responsePreview);

      // Handle permission denied or error cases gracefully
      if (graphData.error) {
        const errorCode = graphData.error.code;
        const errorMessage = graphData.error.message || 'Unknown error';

        console.log('[meta-businesses] Meta API error:', errorCode, errorMessage);

        // OAuth error 190: Token invalid/expired - NEEDS_RECONNECT
        if (errorCode === 190 || errorMessage.includes('Error validating access token') || errorMessage.includes('session has been invalidated')) {
          console.log('[meta-businesses] OAuth token invalid (code 190), clearing token and requiring reconnect');

          // Clear the invalid token from database
          await supabase
            .from('meta_credentials')
            .update({ access_token: null, token_expires_at: null })
            .eq('user_id', user.id);

          return {
            statusCode: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'NEEDS_RECONNECT',
              message: 'Meta session invalidated. Please reconnect your Meta account.',
              details: errorMessage,
            }),
          };
        }

        // Common error codes for missing permissions or no businesses:
        // 200: Permissions error
        // 10: Permission denied
        // 803: Some permissions missing
        // For these cases, return empty array with reason instead of 500
        if (errorCode === 200 || errorCode === 10 || errorCode === 803 || errorMessage.includes('permission')) {
          console.log('[meta-businesses] Permission denied or no access, returning empty');
          return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              success: true,
              businesses: [],
              reason: 'permission_denied',
              message: 'No Business Manager access or permission not granted'
            }),
          };
        }

        // For other errors, still return 200 with empty array to not block wizard
        console.log('[meta-businesses] Other Meta error, returning empty to not block wizard');
        return {
          statusCode: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            businesses: [],
            reason: 'meta_api_error',
            message: errorMessage
          }),
        };
      }

      const businesses = (graphData.data || []).map((b: any) => ({ id: b.id, name: b.name }));

      // 5. Store in database for future requests
      if (businesses.length > 0) {
        for (const business of businesses) {
          await supabase.from('meta_businesses').upsert({
            user_id: user.id,
            business_id: business.id,
            name: business.name,
          }, { onConflict: 'user_id,business_id' });
        }
        console.log('[meta-businesses] Stored', businesses.length, 'businesses in database');
      } else {
        console.log('[meta-businesses] No businesses found (empty response)');
      }

      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          businesses,
          reason: businesses.length === 0 ? 'none' : undefined
        }),
      };
    } catch (fetchError: any) {
      console.error('[meta-businesses] Network/fetch error:', fetchError.message);

      // Network errors should also return 200 with empty array to not block wizard
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          businesses: [],
          reason: 'network_error',
          message: 'Failed to fetch businesses from Meta'
        }),
      };
    }
  } catch (error) {
    console.error('[meta-businesses] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal_server_error' }),
    };
  }
};
