import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getOperatorContext } from '../../src/ai/operator/context';
import { executeAction } from '../../src/ai/operator/executor';
import type { ProposedAction } from '../../src/ai/operator/brain';
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

    const { actionId } = JSON.parse(event.body || '{}');

    if (!actionId) {
      return {
        statusCode: 400,
        headers: _headers,
        body: JSON.stringify({ error: 'Missing actionId' }),
      };
    }

    // Get action from database
    const { data: actionRecord, error: actionError } = await supabase
      .from('ai_operator_actions')
      .select('*')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (actionError || !actionRecord) {
      return {
        statusCode: 404,
        headers: _headers,
        body: JSON.stringify({ error: 'Action not found' }),
      };
    }

    if (actionRecord.status !== 'proposed' && actionRecord.status !== 'approved') {
      return {
        statusCode: 400,
        headers: _headers,
        body: JSON.stringify({ error: 'Action already executed or rejected' }),
      };
    }

    // Check credits
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('credits_remaining, plan')
      .eq('user_id', user.id)
      .maybeSingle();

    const cost = 200;

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
    const context = await getOperatorContext(user.id);

    // Reconstruct proposed action
    const proposedAction: ProposedAction = {
      category: actionRecord.category as any,
      title: actionRecord.title,
      reasoning: actionRecord.reasoning,
      payload: actionRecord.payload,
      safetyChecks: actionRecord.safety_checks,
      priority: 50,
    };

    // Execute action
    console.log('[OperatorExecute] Executing action:', actionId);
    const result = await executeAction(proposedAction, context, actionId);

    // Charge credits (skip for scale plan)
    if (result.success && wallet && wallet.plan !== 'scale') {
      await supabase.rpc('spend_credits', {
        p_user_id: user.id,
        p_feature_key: 'operator_execute_action',
        p_credits: cost,
        p_metadata: { action_id: actionId, category: actionRecord.category },
      });
    }

    return {
      statusCode: 200,
      headers: _headers,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[OperatorExecute] Error:', error);
    return {
      statusCode: 500,
      headers: _headers,
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
