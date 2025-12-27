// SERVER-SAFE: This file is bundled by Netlify Functions - uses process.env, no @ alias
import { supabaseServer } from '../../lib/supabase.server';
import type { OperatorContext } from './context';
import type { ProposedAction } from './brain';

export interface ExecutionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export class ExecutionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ExecutionError';
  }
}

function validateSafetyChecks(action: ProposedAction, context: OperatorContext): void {
  // Never execute if mode is suggest_only
  if (context.operator.mode === 'suggest_only') {
    throw new ExecutionError('MODE_SUGGEST_ONLY', 'Autopilot is in suggest-only mode. Cannot execute actions.');
  }

  // Auto-safe mode restrictions
  if (context.operator.mode === 'auto_safe') {
    const allowedCategories = ['budget', 'pause', 'duplicate'];
    if (!allowedCategories.includes(action.category)) {
      throw new ExecutionError(
        'UNSAFE_CATEGORY',
        `Category "${action.category}" not allowed in auto_safe mode. Only ${allowedCategories.join(', ')} are permitted.`
      );
    }

    if (action.safetyChecks.riskLevel === 'high') {
      throw new ExecutionError('HIGH_RISK', 'High-risk actions are not allowed in auto_safe mode.');
    }
  }

  // Enforce budget cap
  if (!action.safetyChecks.withinBudgetCap) {
    throw new ExecutionError('BUDGET_CAP_EXCEEDED', 'Action would exceed daily spend cap.');
  }

  // Enforce max budget change percentage
  if (!action.safetyChecks.withinChangePct) {
    throw new ExecutionError(
      'CHANGE_PCT_EXCEEDED',
      `Action would exceed max budget change of ${context.operator.maxBudgetChangePct}%.`
    );
  }

  // Enforce minimum impressions
  if (!action.safetyChecks.meetsMinImpressions) {
    throw new ExecutionError(
      'INSUFFICIENT_DATA',
      `Campaign needs at least ${context.operator.minImpressionsForKill} impressions before this action.`
    );
  }

  // Enforce cooldown
  if (!action.safetyChecks.outsideCooldown) {
    throw new ExecutionError(
      'COOLDOWN_ACTIVE',
      `Must wait ${context.operator.cooldownHours} hours between similar actions.`
    );
  }
}

export async function executeAction(
  action: ProposedAction,
  context: OperatorContext,
  actionId: string
): Promise<ExecutionResult> {
  try {
    // Validate all safety checks
    validateSafetyChecks(action, context);

    let result: ExecutionResult;

    // Execute based on category
    switch (action.category) {
      case 'budget':
        result = await executeBudgetChange(action, context);
        break;

      case 'pause':
        result = await executePause(action, context);
        break;

      case 'duplicate':
        result = await executeDuplicate(action, context);
        break;

      case 'creative':
        result = await executeCreativeRefresh(action, context);
        break;

      case 'tracking':
        result = await executeTrackingFix(action, context);
        break;

      case 'campaign':
        result = await executeCampaignCreation(action, context);
        break;

      case 'audience':
        result = await executeAudienceChange(action, context);
        break;

      default:
        throw new ExecutionError('UNKNOWN_CATEGORY', `Unknown action category: ${action.category}`);
    }

    // Update action record
    await supabaseServer
      .from('ai_operator_actions')
      .update({
        status: 'executed',
        result: result.data || { message: result.message },
        executed_at: new Date().toISOString(),
      })
      .eq('id', actionId);

    return result;
  } catch (error: any) {
    console.error('[Executor] Action execution failed:', error);

    // Update action record with error
    await supabaseServer
      .from('ai_operator_actions')
      .update({
        status: 'failed',
        error: error.message || String(error),
      })
      .eq('id', actionId);

    return {
      success: false,
      message: 'Execution failed',
      error: error.message || String(error),
    };
  }
}

async function executeBudgetChange(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  const { campaignId, newBudget, currentBudget } = action.payload;

  if (!campaignId || !newBudget) {
    throw new ExecutionError('INVALID_PAYLOAD', 'Missing campaignId or newBudget');
  }

  // Call Meta API via existing function
  const response = await fetch('/.netlify/functions/meta-manage-campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabaseServer.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({
      action: 'update_budget',
      campaign_id: campaignId,
      daily_budget_cents: newBudget,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ExecutionError('META_API_ERROR', `Failed to update budget: ${error}`);
  }

  const data = await response.json();

  return {
    success: true,
    message: `Budget updated from $${(currentBudget / 100).toFixed(2)} to $${(newBudget / 100).toFixed(2)}`,
    data,
  };
}

async function executePause(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  const { campaignId } = action.payload;

  if (!campaignId) {
    throw new ExecutionError('INVALID_PAYLOAD', 'Missing campaignId');
  }

  // Call Meta API to pause campaign
  const response = await fetch('/.netlify/functions/meta-manage-campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabaseServer.auth.getSession()).data.session?.access_token}`,
    },
    body: JSON.stringify({
      action: 'pause',
      campaign_id: campaignId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new ExecutionError('META_API_ERROR', `Failed to pause campaign: ${error}`);
  }

  const data = await response.json();

  return {
    success: true,
    message: `Campaign paused successfully`,
    data,
  };
}

async function executeDuplicate(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  // Duplication is a medium-risk action that requires manual approval in auto_safe mode
  if (context.operator.mode === 'auto_safe') {
    throw new ExecutionError('REQUIRES_APPROVAL', 'Duplication requires manual approval in auto_safe mode.');
  }

  return {
    success: false,
    message: 'Duplication not yet implemented - requires manual approval',
  };
}

async function executeCreativeRefresh(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  // Creative refresh is suggestion-only (generates ideas, doesn't auto-deploy)
  return {
    success: true,
    message: 'Creative refresh suggestions generated. Review and deploy manually.',
    data: {
      suggestion: 'Generate new ad angles and test alternative hooks',
    },
  };
}

async function executeTrackingFix(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  // Tracking diagnostics - provides checklist, doesn't auto-fix
  return {
    success: true,
    message: 'Tracking diagnostic complete. Review setup steps.',
    data: {
      checks: action.payload.checks || [],
      nextSteps: [
        'Verify Meta Pixel is installed on smart link pages',
        'Check CAPI token is valid and events are firing',
        'Confirm conversion events are properly configured',
      ],
    },
  };
}

async function executeCampaignCreation(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  // Campaign creation requires manual approval (suggest-only)
  return {
    success: true,
    message: 'Campaign brief generated. Review and create manually.',
    data: {
      brief: action.payload,
    },
  };
}

async function executeAudienceChange(action: ProposedAction, context: OperatorContext): Promise<ExecutionResult> {
  // Audience changes require manual approval
  return {
    success: true,
    message: 'Audience optimization suggested. Review and apply manually.',
    data: {
      suggestion: action.payload,
    },
  };
}

export async function canAutoExecute(action: ProposedAction, context: OperatorContext): boolean {
  if (!context.operator.enabled) return false;
  if (context.operator.mode === 'suggest_only') return false;

  try {
    validateSafetyChecks(action, context);
    return true;
  } catch {
    return false;
  }
}
