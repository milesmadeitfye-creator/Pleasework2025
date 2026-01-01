import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { AdsOrchestrator, OrchestratorConfig } from './_adsOrchestrator';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Use service role client to query all eligible users
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[ads-orchestrate-cron] Finding eligible users...');

    // Find eligible users (those with active goals and connected Meta)
    const { data: eligibleUsers, error: usersError } = await supabaseAdmin
      .rpc('get_orchestrator_eligible_users');

    if (usersError) {
      // If RPC doesn't exist, fallback to manual query
      console.warn('[ads-orchestrate-cron] RPC not found, using fallback query');

      const { data: users, error: fallbackError } = await supabaseAdmin
        .from('user_ads_modes')
        .select('user_id, auto_scale_winners, auto_pause_losers')
        .eq('auth_connected', true)
        .eq('assets_configured', true)
        .not('goal_settings', 'is', null);

      if (fallbackError) throw fallbackError;

      // Process each user
      const results = [];
      for (const userSettings of users || []) {
        try {
          const config: OrchestratorConfig = {
            userId: userSettings.user_id,
            dryRun: false,
            supabaseUrl,
            supabaseKey: supabaseServiceKey,
          };

          const orchestrator = new AdsOrchestrator(config);
          const result = await orchestrator.run();

          results.push({
            userId: userSettings.user_id,
            success: result.success,
            summary: {
              campaignsCreated: result.campaignsCreated,
              winnersPromoted: result.winnersPromoted,
              errors: result.errors.length,
            },
          });

          // Update last run time
          await supabaseAdmin
            .from('user_ads_modes')
            .update({ orchestrator_last_run: new Date().toISOString() })
            .eq('user_id', userSettings.user_id);

          console.log(`[ads-orchestrate-cron] Completed for user ${userSettings.user_id}`);
        } catch (err) {
          console.error(`[ads-orchestrate-cron] Error for user ${userSettings.user_id}:`, err);
          results.push({
            userId: userSettings.user_id,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: true,
          usersProcessed: results.length,
          results,
        }),
      };
    }

    // Process users returned by RPC
    const results = [];
    for (const userRow of eligibleUsers || []) {
      try {
        const config: OrchestratorConfig = {
          userId: userRow.user_id,
          dryRun: false,
          supabaseUrl,
          supabaseKey: supabaseServiceKey,
        };

        const orchestrator = new AdsOrchestrator(config);
        const result = await orchestrator.run();

        results.push({
          userId: userRow.user_id,
          success: result.success,
          summary: {
            campaignsCreated: result.campaignsCreated,
            winnersPromoted: result.winnersPromoted,
            errors: result.errors.length,
          },
        });

        // Update last run time
        await supabaseAdmin
          .from('user_ads_modes')
          .update({ orchestrator_last_run: new Date().toISOString() })
          .eq('user_id', userRow.user_id);

        console.log(`[ads-orchestrate-cron] Completed for user ${userRow.user_id}`);
      } catch (err) {
        console.error(`[ads-orchestrate-cron] Error for user ${userRow.user_id}:`, err);
        results.push({
          userId: userRow.user_id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        usersProcessed: results.length,
        results,
      }),
    };
  } catch (err) {
    console.error('[ads-orchestrate-cron] Error:', err);

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
