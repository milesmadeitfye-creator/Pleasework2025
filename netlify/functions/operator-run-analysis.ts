import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getOperatorContext } from '../../src/ai/operator/context';
import { analyzePerformance, proposeActions } from '../../src/ai/operator/brain';
import { _headers } from './_headers';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: _headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: _headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Get auth token
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: _headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: _headers,
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    // Check credits (operator_analysis_run)
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('credits_remaining, plan')
      .eq('user_id', user.id)
      .maybeSingle();

    const cost = 300;

    if (wallet && wallet.plan !== 'scale' && wallet.credits_remaining < cost) {
      return {
        statusCode: 402,
        headers: _headers,
        body: JSON.stringify({
          error: 'Insufficient credits',
          cost,
          remaining: wallet.credits_remaining,
        }),
      };
    }

    // Build context
    console.log('[OperatorAnalysis] Building context for user:', user.id);
    const context = await getOperatorContext(user.id);

    // Analyze performance
    console.log('[OperatorAnalysis] Analyzing performance...');
    const insights = analyzePerformance(context);

    // Propose actions
    console.log('[OperatorAnalysis] Proposing actions...');
    const proposedActions = proposeActions(insights, context);

    // Store proposed actions in database
    const actionsToInsert = proposedActions.map(action => ({
      user_id: user.id,
      status: 'proposed',
      category: action.category,
      title: action.title,
      reasoning: action.reasoning,
      payload: action.payload,
      safety_checks: action.safetyChecks,
    }));

    if (actionsToInsert.length > 0) {
      await supabase.from('ai_operator_actions').insert(actionsToInsert);
    }

    // Charge credits (skip for scale plan)
    if (wallet && wallet.plan !== 'scale') {
      await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_feature_key: 'operator_analysis_run',
        p_credits: cost,
        p_metadata: { insights_count: insights.length, actions_count: proposedActions.length },
      });
    }

    console.log('[OperatorAnalysis] Analysis complete:', {
      insights: insights.length,
      actions: proposedActions.length,
    });

    return {
      statusCode: 200,
      headers: _headers,
      body: JSON.stringify({
        success: true,
        insights,
        actions: proposedActions,
        context: {
          mode: context.operator.mode,
          enabled: context.operator.enabled,
        },
      }),
    };
  } catch (error: any) {
    console.error('[OperatorAnalysis] Error:', error);
    return {
      statusCode: 500,
      headers: _headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
