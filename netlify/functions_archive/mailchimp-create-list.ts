import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[mailchimp-create-list] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[mailchimp-create-list] Missing authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[mailchimp-create-list] Auth verification failed', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN' });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { name, from_name, from_email, company, address } = body;

    if (!name || !from_name || !from_email) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_FIELDS',
        message: 'name, from_name, and from_email are required',
      });
    }

    console.log('[mailchimp-create-list] User verified', {
      userId: user.id.substring(0, 8) + '...',
      listName: name,
    });

    // Load user's Mailchimp connection
    const { data: connections, error: connError } = await supabase
      .from('mailchimp_connections')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    if (connError) {
      console.error('[mailchimp-create-list] Database error', connError);
      return jsonResponse(500, { error: 'DATABASE_ERROR' });
    }

    if (!connections || connections.length === 0 || !connections[0].access_token) {
      return jsonResponse(400, {
        success: false,
        error: 'MAILCHIMP_NOT_CONNECTED',
        message: 'Please connect your Mailchimp account first',
      });
    }

    const connection = connections[0];
    const accessToken = connection.access_token;
    const serverPrefix =
      connection.server_prefix ||
      connection.data_center ||
      connection.dc ||
      'us13';

    // Prepare address - use provided or default
    const contactAddress = address || {
      address1: 'N/A',
      city: 'N/A',
      state: 'N/A',
      zip: '00000',
      country: 'US',
    };

    // Create list in Mailchimp
    const listsUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists`;

    console.log('[mailchimp-create-list] Creating list in Mailchimp', {
      url: listsUrl,
      name,
    });

    const createRes = await fetch(listsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name,
        contact: {
          company: company || 'Ghoste',
          ...contactAddress,
        },
        permission_reminder: 'You are receiving this email because you signed up via Ghoste.',
        campaign_defaults: {
          from_name,
          from_email,
          subject: '',
          language: 'en',
        },
        email_type_option: false,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      console.error('[mailchimp-create-list] Mailchimp API error', {
        status: createRes.status,
        error: errorData,
      });
      return jsonResponse(500, {
        success: false,
        error: 'MAILCHIMP_API_ERROR',
        message: errorData.title || errorData.message || 'Failed to create list in Mailchimp',
        details: errorData,
      });
    }

    const createdList: any = await createRes.json();

    console.log('[mailchimp-create-list] List created successfully', {
      listId: createdList.id,
    });

    // Upsert list into mailchimp_lists table
    const { error: upsertError } = await supabase
      .from('mailchimp_lists')
      .upsert(
        {
          user_id: user.id,
          list_id: createdList.id,
          name: createdList.name,
          from_name,
          from_email,
          stats: {
            member_count: 0,
            unsubscribe_count: 0,
            cleaned_count: 0,
          },
        },
        { onConflict: 'user_id,list_id' }
      );

    if (upsertError) {
      console.error('[mailchimp-create-list] Failed to upsert list', upsertError);
      return jsonResponse(500, {
        success: false,
        error: 'DATABASE_UPSERT_ERROR',
        message: 'Failed to save list to database',
      });
    }

    // Check if user has a default list set
    const { data: settings } = await supabase
      .from('user_mailchimp_settings')
      .select('default_list_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // If no default list, set this new list as default
    if (!settings || !settings.default_list_id) {
      await supabase.from('user_mailchimp_settings').upsert(
        {
          user_id: user.id,
          default_list_id: createdList.id,
          double_opt_in: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      console.log('[mailchimp-create-list] Set new list as default');
    }

    console.log('[mailchimp-create-list] List created and saved successfully');

    return jsonResponse(200, {
      success: true,
      list: {
        id: createdList.id,
        user_id: user.id,
        list_id: createdList.id,
        name: createdList.name,
        from_name,
        from_email,
      },
      is_default: !settings || !settings.default_list_id,
    });
  } catch (err: any) {
    console.error('[mailchimp-create-list] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    });
  }
};

export default handler;
