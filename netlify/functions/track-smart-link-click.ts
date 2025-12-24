import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = JSON.parse(event.body || '{}');
    const { link_id, platform } = body;

    console.log('[track-smart-link-click] Request received', {
      link_id,
      platform
    });

    if (!link_id || !platform) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing link_id or platform' }),
      };
    }

    const { data: link, error: fetchError } = await supabase
      .from('smart_links')
      .select('total_clicks')
      .eq('id', link_id)
      .maybeSingle();

    if (fetchError || !link) {
      console.error('[track-smart-link-click] Link not found:', fetchError);
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Link not found' }),
      };
    }

    const { error: updateError } = await supabase
      .from('smart_links')
      .update({
        total_clicks: (link.total_clicks || 0) + 1
      })
      .eq('id', link_id);

    if (updateError) {
      console.error('[track-smart-link-click] Update error:', updateError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to update click count' }),
      };
    }

    console.log('[track-smart-link-click] Click tracked successfully', {
      link_id,
      platform,
      new_count: (link.total_clicks || 0) + 1
    });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (error: any) {
    console.error('[track-smart-link-click] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
