import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[split-negotiations] Handler invoked', {
    method: event.httpMethod,
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[split-negotiations] Auth error:', authError);
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not authenticated' }),
      };
    }

    const userId = user.id;

    // GET: List all negotiations for this user
    if (event.httpMethod === 'GET') {
      console.log('[split-negotiations] Fetching negotiations for user:', userId);

      const { data, error } = await supabase
        .from('split_negotiations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[split-negotiations] Error fetching negotiations:', error);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Failed to load split negotiations',
            message: error.message,
          }),
        };
      }

      console.log('[split-negotiations] Found negotiations:', data?.length || 0);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negotiations: data || [] }),
      };
    }

    // POST: Create a new negotiation
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { projectName, project_name } = body;

      const projectTitle = projectName || project_name;

      if (!projectTitle || !projectTitle.trim()) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Project name is required',
            message: 'projectName field must be provided and not empty',
          }),
        };
      }

      const insertPayload = {
        user_id: userId,
        project_name: projectTitle.trim(),
        project_title: projectTitle.trim(),
        status: 'draft',
      };

      console.log('[split-negotiations] Creating negotiation:', insertPayload);

      const { data, error } = await supabase
        .from('split_negotiations')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[split-negotiations] Database error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: error.message || 'Failed to create negotiation',
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          }),
        };
      }

      console.log('[split-negotiations] Success:', data);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negotiation: data }),
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err: any) {
    console.error('[split-negotiations] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err.message || 'Internal server error',
        message: 'Unexpected server error',
        details: err.message,
      }),
    };
  }
};
