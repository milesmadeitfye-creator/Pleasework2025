/**
 * Email Automation Toggle Endpoint
 *
 * Enable or disable email automation system.
 * Updates app_settings table with email_automation.enabled flag.
 *
 * Usage:
 * POST /.netlify/functions/email-automation-toggle
 * Body: { "enabled": true } or { "enabled": false }
 *
 * Returns: { "ok": true, "enabled": true/false }
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const handler: Handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    // Validate enabled parameter
    if (typeof body.enabled !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid field: enabled (must be boolean)' }),
      };
    }

    const enabled = body.enabled;

    // Initialize Supabase admin client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is not set');
    }

    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    });

    // Upsert setting
    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert(
        {
          key: 'email_automation',
          value: { enabled },
        },
        {
          onConflict: 'key',
        }
      );

    if (upsertError) {
      console.error('[EmailAutomationToggle] Error upserting setting:', upsertError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to update setting',
          details: upsertError.message,
        }),
      };
    }

    console.log('[EmailAutomationToggle] Email automation toggled:', { enabled });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        enabled,
        message: `Email automation ${enabled ? 'enabled' : 'disabled'} successfully`,
      }),
    };
  } catch (error: any) {
    console.error('[EmailAutomationToggle] Fatal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};

export { handler };
