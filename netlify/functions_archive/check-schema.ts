import type { Handler } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: columns, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'user_profiles')
      .eq('table_schema', 'public');

    if (error) {
      console.error('[check-schema] Error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error.message,
          details: 'Failed to query information_schema',
        }),
      };
    }

    const hasMetaPixelId = columns?.some(col => col.column_name === 'meta_pixel_id');
    const hasTikTokPixelId = columns?.some(col => col.column_name === 'tiktok_pixel_id');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table: 'user_profiles',
        columns: columns || [],
        hasMetaPixelId,
        hasTikTokPixelId,
        columnCount: columns?.length || 0,
      }),
    };
  } catch (error: any) {
    console.error('[check-schema] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
