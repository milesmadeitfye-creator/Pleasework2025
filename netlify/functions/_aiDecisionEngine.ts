import { getSupabaseAdmin } from './_supabaseAdmin';

export type DecisionAction =
  | 'scale_up'
  | 'maintain'
  | 'rotate_creative'
  | 'tighten_audience'
  | 'pause'
  | 'test_variation';

export interface TeacherScore {
  score: number;
  grade: 'fail' | 'weak' | 'pass' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  created_at: string;
}

export interface CampaignContext {
  campaign_id: string;
  current_daily_budget: number;
  max_daily_budget: number;
  automation_mode: 'guided' | 'autonomous' | 'manual';
  days_running: number;
  total_spend: number;
}

export interface DecisionResult {
  action: DecisionAction;
  reason: string;
  score_used: number;
  confidence: string;
  recommended_budget?: number;
  guardrails: string[];
}

export function makeDecision(
  score: TeacherScore,
  context: CampaignContext
): DecisionResult {
  const guardrails: string[] = [];

  if (score.confidence === 'low') {
    guardrails.push('Low confidence - waiting for more data before major changes');
  }

  if (context.days_running < 3) {
    guardrails.push('Campaign too new - learning phase active');
  }

  if (score.score >= 80 && score.confidence !== 'low') {
    if (context.automation_mode === 'autonomous' && context.current_daily_budget < context.max_daily_budget) {
      const increaseFactor = score.confidence === 'high' ? 1.25 : 1.15;
      const recommended_budget = Math.min(
        context.current_daily_budget * increaseFactor,
        context.max_daily_budget
      );

      guardrails.push(`Budget increase capped at ${context.max_daily_budget}`);

      return {
        action: 'scale_up',
        reason: `Strong performance (score ${score.score}) with ${score.confidence} confidence. Increasing budget within caps.`,
        score_used: score.score,
        confidence: score.confidence,
        recommended_budget: Math.round(recommended_budget),
        guardrails,
      };
    } else {
      return {
        action: 'maintain',
        reason: `Strong performance (score ${score.score}), but automation not enabled or budget at cap.`,
        score_used: score.score,
        confidence: score.confidence,
        guardrails,
      };
    }
  }

  if (score.score >= 60 && score.score < 80) {
    return {
      action: 'test_variation',
      reason: `Pass grade (score ${score.score}). Performance acceptable. Consider testing creative variations.`,
      score_used: score.score,
      confidence: score.confidence,
      guardrails,
    };
  }

  if (score.score >= 40 && score.score < 60) {
    return {
      action: 'rotate_creative',
      reason: `Weak grade (score ${score.score}). Rotate creative or tighten audience targeting.`,
      score_used: score.score,
      confidence: score.confidence,
      guardrails,
    };
  }

  if (score.score < 40) {
    guardrails.push('Poor performance detected - immediate action recommended');

    return {
      action: 'pause',
      reason: `Fail grade (score ${score.score}). Performance below threshold. ${score.reasons.join('. ')}.`,
      score_used: score.score,
      confidence: score.confidence,
      guardrails,
    };
  }

  return {
    action: 'maintain',
    reason: 'No clear signal for action',
    score_used: score.score,
    confidence: score.confidence,
    guardrails,
  };
}

export async function logDecision(
  owner_user_id: string,
  entity_type: string,
  entity_id: string,
  decision: DecisionResult
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('ai_operator_actions')
    .insert([{
      user_id: owner_user_id,
      action_type: decision.action,
      entity_type,
      entity_id,
      reason: decision.reason,
      metadata: {
        score_used: decision.score_used,
        confidence: decision.confidence,
        recommended_budget: decision.recommended_budget,
        guardrails: decision.guardrails,
      },
      status: 'pending',
    }]);

  if (error) {
    console.error('[aiDecisionEngine] Failed to log decision:', error);
  }
}

export function getBadgeColor(grade: string): string {
  switch (grade) {
    case 'strong': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'pass': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'weak': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'fail': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export function getConfidenceIcon(confidence: string): string {
  switch (confidence) {
    case 'high': return '🎯';
    case 'medium': return '📊';
    case 'low': return '⚠️';
    default: return '📈';
  }
}

export function getActionIcon(action: DecisionAction): string {
  switch (action) {
    case 'scale_up': return '📈';
    case 'maintain': return '✅';
    case 'rotate_creative': return '🔄';
    case 'tighten_audience': return '🎯';
    case 'pause': return '⏸️';
    case 'test_variation': return '🧪';
    default: return '📊';
  }
}
