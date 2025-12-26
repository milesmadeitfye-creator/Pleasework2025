import { getSupabaseAdmin } from './_supabaseAdmin';

export type ManagerAction = 'spend_more' | 'spend_less' | 'make_more_creatives' | 'none';

export interface TeacherScore {
  score: number;
  grade: 'fail' | 'weak' | 'pass' | 'strong';
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  created_at: string;
}

export interface DecisionContext {
  campaign_id: string;
  current_daily_budget: number;
  max_daily_budget: number;
  manager_mode_enabled: boolean;
  days_running: number;
  total_spend: number;
  creatives_count: number;
  last_creative_refresh_days?: number;
}

export interface ManagerDecision {
  action: ManagerAction;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  requires_approval: boolean;
  recommended_budget?: number;
  creative_brief_needed?: boolean;
  urgency?: 'low' | 'normal' | 'high';
}

export function decideManagerAction(
  score: TeacherScore,
  context: DecisionContext
): ManagerDecision {
  if (!context.manager_mode_enabled) {
    return {
      action: 'none',
      reason: 'Manager mode disabled',
      confidence: 'high',
      requires_approval: false,
    };
  }

  const { score: scoreValue, grade, confidence } = score;

  if (scoreValue >= 80 && confidence !== 'low') {
    const newBudget = Math.min(
      context.current_daily_budget * 1.25,
      context.max_daily_budget
    );

    if (newBudget <= context.current_daily_budget) {
      return {
        action: 'none',
        reason: 'Already at max budget cap. Performance is strong but cannot scale further.',
        confidence: 'high',
        requires_approval: false,
      };
    }

    return {
      action: 'spend_more',
      reason: `Strong performance (score ${scoreValue}) with high confidence. This is working better. Recommending +25% budget increase.`,
      confidence,
      requires_approval: true,
      recommended_budget: newBudget,
    };
  }

  if (scoreValue >= 60 && scoreValue < 80) {
    return {
      action: 'none',
      reason: `Good performance (score ${scoreValue}). Maintaining current spend. Will monitor for scale opportunities.`,
      confidence,
      requires_approval: false,
    };
  }

  if (scoreValue >= 40 && scoreValue < 60) {
    const creativesStale = context.last_creative_refresh_days && context.last_creative_refresh_days > 7;

    if (creativesStale || context.creatives_count < 2) {
      return {
        action: 'make_more_creatives',
        reason: `Performance below target (score ${scoreValue}). Creative ${creativesStale ? 'fatigue detected' : 'variety needed'}. Need 2-3 fresh videos.`,
        confidence,
        requires_approval: false,
        creative_brief_needed: true,
        urgency: 'normal',
      };
    }

    return {
      action: 'spend_less',
      reason: `Weak performance (score ${scoreValue}). Recommend reducing budget 20-30% while optimizing.`,
      confidence,
      requires_approval: true,
      recommended_budget: context.current_daily_budget * 0.75,
    };
  }

  if (scoreValue < 40) {
    return {
      action: 'make_more_creatives',
      reason: `Poor performance detected (score ${scoreValue}). These videos aren't landing. Pausing ads to protect budget. Need new content ASAP.`,
      confidence: 'high',
      requires_approval: false,
      creative_brief_needed: true,
      urgency: 'high',
    };
  }

  return {
    action: 'none',
    reason: 'Insufficient data to make a recommendation',
    confidence: 'low',
    requires_approval: false,
  };
}

export function generateNotificationMessage(
  decision: ManagerDecision,
  campaignName: string,
  artistName?: string
): string {
  const greeting = artistName ? `Hey ${artistName}` : 'Hey';

  switch (decision.action) {
    case 'spend_more':
      return `${greeting}, your ${campaignName} campaign is working better than expected. Want me to push it a little more? (Reply YES to increase budget by 25%)`;

    case 'spend_less':
      return `${greeting}, your ${campaignName} campaign isn't performing as well as we'd like. Should I dial back the spend while we optimize? (Reply YES to reduce budget by 25%)`;

    case 'make_more_creatives':
      if (decision.urgency === 'high') {
        return `${greeting}, the videos for ${campaignName} aren't landing. I paused the ads to protect your budget. Can you send me 2-3 new clips? I'll give you some inspo.`;
      } else {
        return `${greeting}, ${campaignName} could use some fresh content. Got 2-3 new videos you could shoot? I'll send you a quick brief.`;
      }

    default:
      return `${greeting}, everything's running smooth with ${campaignName}. I'll let you know if anything changes.`;
  }
}

export async function requestApproval(
  user_id: string,
  campaign_id: string,
  decision: ManagerDecision,
  notificationMethod: 'sms' | 'email' | 'both',
  notificationContact: { phone?: string; email?: string }
): Promise<string | null> {
  if (!decision.requires_approval) {
    return null;
  }

  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('campaign_name')
    .eq('id', campaign_id)
    .single();

  const message = generateNotificationMessage(
    decision,
    campaign?.campaign_name || 'Your'
  );

  const { data: approval, error } = await supabase
    .from('ai_manager_approvals')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      action_requested: decision.action,
      action_context: {
        recommended_budget: decision.recommended_budget,
        confidence: decision.confidence,
        reason: decision.reason,
      },
      notification_method: notificationMethod,
      notification_body: message,
      response: 'pending',
    }])
    .select()
    .single();

  if (error) {
    console.error('[requestApproval] Error:', error);
    return null;
  }

  await supabase
    .from('ai_manager_notifications')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      approval_id: approval.id,
      notification_type: 'approval_request',
      notification_method: notificationMethod,
      recipient_phone: notificationContact.phone || null,
      recipient_email: notificationContact.email || null,
      body: message,
      tone: 'casual',
      expects_reply: true,
    }]);

  console.log('[requestApproval] ✅ Approval requested:', approval.id);

  return approval.id;
}
