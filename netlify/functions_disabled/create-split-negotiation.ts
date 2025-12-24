import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[create-split-negotiation] Handler invoked', {
    method: event.httpMethod
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[create-split-negotiation] Auth error:', authError);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { projectName } = body;

    if (!projectName || !projectName.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Project name is required',
          details: 'projectName field must be provided and not empty'
        }),
      };
    }

    const insertPayload = {
      user_id: user.id,
      project_name: projectName.trim(),
      project_title: projectName.trim(),
      status: 'draft',
    };

    console.log('[create-split-negotiation] Creating negotiation:', insertPayload);

    const { data, error } = await supabase
      .from('split_negotiations')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[create-split-negotiation] Database error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: error.message || 'Failed to create negotiation',
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        }),
      };
    }

    console.log('[create-split-negotiation] Success:', data);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ negotiation: data }),
    };
  } catch (err: any) {
    console.error('[create-split-negotiation] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: err.message || 'Internal server error',
        message: 'Internal server error',
        details: err.message,
        stack: err.stack,
      }),
    };
  }
};
