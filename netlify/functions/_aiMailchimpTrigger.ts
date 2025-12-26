import { getSupabaseAdmin } from './_supabaseAdmin';

type AutomationType = 'approval_request' | 'creative_request' | 'pause_notice';
type DeliveryMethod = 'sms' | 'email';

export interface MailchimpAutomationTrigger {
  user_id: string;
  campaign_id: string;
  approval_id?: string;
  automation_type: AutomationType;
  trigger_reason: string;
  recipient_email?: string;
  recipient_phone?: string;
  delivery_method: DeliveryMethod;
  subject?: string;
  body: string;
}

export async function triggerMailchimpAutomation(trigger: MailchimpAutomationTrigger): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('last_ai_message_at, ai_message_count_24h, force_silence_mode')
    .eq('id', trigger.campaign_id)
    .single();

  if (campaign?.force_silence_mode) {
    const hoursSinceLastMessage = campaign.last_ai_message_at
      ? (Date.now() - new Date(campaign.last_ai_message_at).getTime()) / (1000 * 60 * 60)
      : 999;

    if (hoursSinceLastMessage < 24) {
      console.log('[triggerMailchimpAutomation] ⏭️ Skipped (silence mode enforced):', trigger.campaign_id);
      return 'skipped_silence_mode';
    }
  }

  const { data: automation, error } = await supabase
    .from('ai_mailchimp_automations')
    .insert([{
      owner_user_id: trigger.user_id,
      campaign_id: trigger.campaign_id,
      approval_id: trigger.approval_id || null,
      automation_type: trigger.automation_type,
      trigger_reason: trigger.trigger_reason,
      recipient_email: trigger.recipient_email || null,
      recipient_phone: trigger.recipient_phone || null,
      delivery_method: trigger.delivery_method,
      subject: trigger.subject || null,
      body: trigger.body,
    }])
    .select()
    .single();

  if (error) {
    console.error('[triggerMailchimpAutomation] Error:', error);
    throw error;
  }

  await supabase
    .from('ghoste_campaigns')
    .update({
      last_ai_message_at: new Date().toISOString(),
      ai_message_count_24h: (campaign?.ai_message_count_24h || 0) + 1,
    })
    .eq('id', trigger.campaign_id);

  console.log('[triggerMailchimpAutomation] ✅ Triggered:', automation.id, trigger.automation_type);

  return automation.id;
}

export function generateApprovalMessage(
  action: 'spend_more' | 'spend_less',
  campaign_name: string,
  recommended_budget_dollars: number,
  approval_link: string,
  decline_link: string
): string {
  if (action === 'spend_more') {
    return `This is working better than expected.

Your ${campaign_name} campaign is performing well. Want me to push it a little more?

New daily budget: $${recommended_budget_dollars}

[Approve](${approval_link})  |  [No Thanks](${decline_link})`;
  } else {
    return `Not performing as expected.

Your ${campaign_name} campaign isn't hitting targets. Should I dial back the spend while we optimize?

New daily budget: $${recommended_budget_dollars}

[Approve](${approval_link})  |  [No Thanks](${decline_link})`;
  }
}

export function generateCreativeRequestMessage(
  campaign_name: string,
  urgency: 'high' | 'normal',
  upload_link: string
): string {
  if (urgency === 'high') {
    return `These videos aren't landing.

I paused ads for ${campaign_name} so you don't waste money.

Send 2-3 new clips when you're ready.

[Upload Videos](${upload_link})`;
  } else {
    return `Fresh content needed.

${campaign_name} could use some new videos.

Got 2-3 clips you could shoot?

[Upload Videos](${upload_link})`;
  }
}

export function generatePauseNotice(
  campaign_name: string,
  reason: string
): string {
  return `Ads paused.

I paused ${campaign_name} to protect your budget.

Reason: ${reason}

Check your dashboard for details.`;
}

export async function checkSilenceMode(campaign_id: string): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('last_ai_message_at, force_silence_mode')
    .eq('id', campaign_id)
    .single();

  if (!campaign?.force_silence_mode) {
    return { allowed: true };
  }

  const hoursSinceLastMessage = campaign.last_ai_message_at
    ? (Date.now() - new Date(campaign.last_ai_message_at).getTime()) / (1000 * 60 * 60)
    : 999;

  if (hoursSinceLastMessage < 24) {
    return {
      allowed: false,
      reason: `Already messaged ${hoursSinceLastMessage.toFixed(1)} hours ago. Enforcing 24h silence.`,
    };
  }

  return { allowed: true };
}
