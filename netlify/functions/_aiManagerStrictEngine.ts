import { getSupabaseAdmin } from './_supabaseAdmin';

export type AIManagerAction = 'spend_more' | 'spend_less' | 'make_more_creatives' | 'no_action';

export interface TeacherScore {
  score: number;
  grade: 'fail' | 'weak' | 'pass' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface StudentSignals {
  campaign_id: string;
  days_running: number;
  total_spend_cents: number;
  current_daily_budget_cents: number;
  max_daily_budget_cents: number;
  creatives_count: number;
  creative_fatigue_detected: boolean;
  last_creative_refresh_days?: number;
  meta_performance?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
  };
}

export interface AIDecision {
  action: AIManagerAction;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  requires_user_action: boolean;
  recommended_budget_cents?: number;
  creative_brief_needed?: boolean;
  urgency?: 'low' | 'normal' | 'high';
  safety_warnings: string[];
}

export interface DecisionContext {
  student_signals: StudentSignals;
  teacher_score: TeacherScore;
  killswitch_active: boolean;
  silence_mode_active: boolean;
  force_silence: boolean;
  last_message_hours_ago: number;
}

const CONFIDENCE_THRESHOLD = 'medium';
const MIN_SCORE_FOR_SPEND_MORE = 80;
const MIN_SCORE_NO_ACTION = 60;
const MAX_SCORE_ACTION_NEEDED = 39;
const MIN_CONFIDENCE_SCORE = 50;

export async function checkKillswitch(): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from('ai_manager_killswitch')
    .select('pause_all_ads, disable_ai_actions')
    .single();

  if (!data) return false;

  return data.pause_all_ads || data.disable_ai_actions;
}

export function decideAction(context: DecisionContext): AIDecision {
  const { student_signals, teacher_score, killswitch_active, silence_mode_active, last_message_hours_ago } = context;
  const safety_warnings: string[] = [];

  if (killswitch_active) {
    return {
      action: 'no_action',
      reason: 'Global killswitch is active. All AI actions disabled.',
      confidence: 'high',
      requires_user_action: false,
      safety_warnings: ['killswitch_active'],
    };
  }

  if (teacher_score.confidence === 'low') {
    safety_warnings.push('low_teacher_confidence');
    return {
      action: 'no_action',
      reason: 'Insufficient confidence in data. Maintaining current state.',
      confidence: 'low',
      requires_user_action: false,
      safety_warnings,
    };
  }

  if (teacher_score.score < MIN_CONFIDENCE_SCORE) {
    safety_warnings.push('score_below_threshold');
  }

  if (last_message_hours_ago < 24 && silence_mode_active) {
    return {
      action: 'no_action',
      reason: 'Silence mode: Already messaged user in last 24 hours.',
      confidence: 'high',
      requires_user_action: false,
      safety_warnings: ['silence_mode_enforced'],
    };
  }

  if (student_signals.creative_fatigue_detected || teacher_score.score <= MAX_SCORE_ACTION_NEEDED) {
    const urgency = teacher_score.score <= 25 ? 'high' : 'normal';

    return {
      action: 'make_more_creatives',
      reason: student_signals.creative_fatigue_detected
        ? 'Creative fatigue detected. Current content exhausted.'
        : `Performance score too low (${teacher_score.score}/100). Need fresh content.`,
      confidence: teacher_score.confidence,
      requires_user_action: true,
      creative_brief_needed: true,
      urgency,
      safety_warnings,
    };
  }

  if (teacher_score.score >= MIN_SCORE_FOR_SPEND_MORE && teacher_score.confidence === 'high') {
    const current = student_signals.current_daily_budget_cents;
    const max = student_signals.max_daily_budget_cents;

    if (current >= max) {
      return {
        action: 'no_action',
        reason: 'Already at max budget cap. Cannot scale further.',
        confidence: 'high',
        requires_user_action: false,
        safety_warnings: ['at_budget_cap'],
      };
    }

    const recommended = Math.min(Math.round(current * 1.25), max);

    return {
      action: 'spend_more',
      reason: `Strong performance (${teacher_score.score}/100). Opportunity to scale.`,
      confidence: teacher_score.confidence,
      requires_user_action: true,
      recommended_budget_cents: recommended,
      safety_warnings,
    };
  }

  if (teacher_score.score >= MIN_SCORE_NO_ACTION) {
    return {
      action: 'no_action',
      reason: `Performance acceptable (${teacher_score.score}/100). Maintaining current state.`,
      confidence: teacher_score.confidence,
      requires_user_action: false,
      safety_warnings,
    };
  }

  if (teacher_score.score >= 40 && teacher_score.score < MIN_SCORE_NO_ACTION) {
    return {
      action: 'no_action',
      reason: `Below target (${teacher_score.score}/100). Rotating creatives internally. Monitoring.`,
      confidence: teacher_score.confidence,
      requires_user_action: false,
      safety_warnings: ['below_target_monitoring'],
    };
  }

  return {
    action: 'no_action',
    reason: 'Insufficient data to make a confident decision.',
    confidence: 'low',
    requires_user_action: false,
    safety_warnings: ['insufficient_data'],
  };
}

export async function logDecision(
  user_id: string,
  campaign_id: string,
  context: DecisionContext,
  decision: AIDecision
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('ai_manager_decisions')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      evaluation_timestamp: new Date().toISOString(),
      student_signals: context.student_signals,
      teacher_score: context.teacher_score.score,
      teacher_grade: context.teacher_score.grade,
      teacher_confidence: context.teacher_score.confidence,
      teacher_reasons: context.teacher_score.reasons,
      action_decided: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
      killswitch_active: context.killswitch_active,
      silence_mode_active: context.silence_mode_active,
    }])
    .select()
    .single();

  if (error) {
    console.error('[logDecision] Error:', error);
    throw error;
  }

  console.log('[logDecision] ✅ Logged:', data.id, decision.action);

  return data.id;
}

export async function validateBudgetSafety(
  campaign_id: string,
  old_budget_cents: number,
  new_budget_cents: number
): Promise<{ safe: boolean; warnings: string[] }> {
  const warnings: string[] = [];

  if (new_budget_cents > old_budget_cents) {
    warnings.push('INCREASE_REQUIRES_APPROVAL');
  }

  const increase_pct = ((new_budget_cents - old_budget_cents) / old_budget_cents) * 100;

  if (increase_pct > 30) {
    warnings.push('INCREASE_EXCEEDS_30_PERCENT');
    return { safe: false, warnings };
  }

  if (new_budget_cents < 500) {
    warnings.push('BUDGET_BELOW_MINIMUM');
  }

  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('max_daily_budget_cents')
    .eq('id', campaign_id)
    .single();

  if (campaign && new_budget_cents > campaign.max_daily_budget_cents) {
    warnings.push('EXCEEDS_MAX_DAILY_BUDGET');
    return { safe: false, warnings };
  }

  return { safe: warnings.length === 0 || warnings[0] === 'INCREASE_REQUIRES_APPROVAL', warnings };
}

export async function logBudgetChange(
  user_id: string,
  campaign_id: string,
  action: AIManagerAction,
  old_budget_cents: number,
  new_budget_cents: number,
  approval_id: string | null,
  authorized_by: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const change_pct = ((new_budget_cents - old_budget_cents) / old_budget_cents) * 100;

  const safety = await validateBudgetSafety(campaign_id, old_budget_cents, new_budget_cents);

  await supabase
    .from('ai_budget_changes')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      action,
      old_budget_cents,
      new_budget_cents,
      change_pct,
      approval_id,
      authorized_by,
      safety_checks_passed: safety.safe,
      safety_warnings: safety.warnings,
    }]);

  console.log('[logBudgetChange] ✅ Logged:', campaign_id, `${old_budget_cents} → ${new_budget_cents}`);
}
