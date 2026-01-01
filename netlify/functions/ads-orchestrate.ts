import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { AdsOrchestrator, OrchestratorConfig } from './_adsOrchestrator';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
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
    // Get Supabase env vars
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Extract user JWT from Authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized - missing token' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user with Supabase
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized - invalid token' }),
      };
    }

    console.log(`[ads-orchestrate] Running orchestrator for user ${user.id}`);

    // Create orchestrator config
    const config: OrchestratorConfig = {
      userId: user.id,
      dryRun: false,
      supabaseUrl,
      supabaseKey: supabaseAnonKey,
    };

    // Run orchestrator
    const orchestrator = new AdsOrchestrator(config);
    const result = await orchestrator.run();

    // Update user settings with last run time
    await supabase
      .from('user_ads_modes')
      .update({ orchestrator_last_run: new Date().toISOString() })
      .eq('user_id', user.id);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: result.success,
        runId: result.runId,
        summary: {
          campaignsCreated: result.campaignsCreated,
          campaignsUpdated: result.campaignsUpdated,
          winnersPromoted: result.winnersPromoted,
          budgetsScaled: result.budgetsScaled,
          adsetsPaused: result.adsetsPaused,
          errors: result.errors,
        },
        actionsCount: result.actions.length,
      }),
    };
  } catch (err) {
    console.error('[ads-orchestrate] Error:', err);

    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
    };
  }
};
