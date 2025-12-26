import { getSupabaseAdmin } from './_supabaseAdmin';

export interface CreativeFatigueSignal {
  creative_id: string;
  fatigue_score: number;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
  should_pause: boolean;
}

export async function detectCreativeFatigue(
  campaign_id: string,
  creative_ids: string[]
): Promise<CreativeFatigueSignal[]> {
  const supabase = getSupabaseAdmin();

  const signals: CreativeFatigueSignal[] = [];

  for (const creative_id of creative_ids) {
    const { data: creative } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('id', creative_id)
      .single();

    if (!creative) continue;

    const reasons: string[] = [];
    let fatigueScore = 0;

    if (creative.total_impressions > 50000) {
      fatigueScore += 30;
      reasons.push('High impression count (50k+)');
    }

    if (creative.last_used_at) {
      const daysSinceUsed = Math.floor(
        (Date.now() - new Date(creative.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUsed > 14) {
        fatigueScore += 20;
        reasons.push('Used continuously for 14+ days');
      }
    }

    if (creative.performance_trend === 'declining') {
      fatigueScore += 40;
      reasons.push('Performance trend declining');
    }

    if (creative.hook_strength && creative.hook_strength < 50) {
      fatigueScore += 10;
      reasons.push('Weak hook strength');
    }

    const confidence: 'low' | 'medium' | 'high' =
      reasons.length >= 3 ? 'high' : reasons.length >= 2 ? 'medium' : 'low';

    signals.push({
      creative_id,
      fatigue_score: Math.min(fatigueScore, 100),
      reasons,
      confidence,
      should_pause: fatigueScore >= 70,
    });
  }

  return signals;
}

export async function logCreativeFatigue(
  user_id: string,
  campaign_id: string,
  signal: CreativeFatigueSignal,
  campaignPaused: boolean
): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from('creative_fatigue_log')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      creative_id: signal.creative_id,
      fatigue_score: signal.fatigue_score,
      detection_reason: signal.reasons.join('; '),
      confidence: signal.confidence,
      action_taken: campaignPaused ? 'campaign_paused' : 'creative_rotated',
      campaign_paused: campaignPaused,
    }]);

  if (signal.should_pause) {
    await supabase
      .from('ad_creatives')
      .update({ fatigue_score: signal.fatigue_score })
      .eq('id', signal.creative_id);
  }

  console.log('[logCreativeFatigue] ✅ Logged:', signal.creative_id, signal.fatigue_score);
}

export async function checkCampaignForFatigue(
  campaign_id: string
): Promise<{ needsCreatives: boolean; urgency: 'low' | 'normal' | 'high'; reasons: string[] }> {
  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('*, ad_creatives(*)')
    .eq('id', campaign_id)
    .single();

  if (!campaign) {
    return { needsCreatives: false, urgency: 'low', reasons: [] };
  }

  const creativeIds = campaign.config?.creative_ids || [];

  if (creativeIds.length === 0) {
    return {
      needsCreatives: true,
      urgency: 'high',
      reasons: ['No creatives attached to campaign'],
    };
  }

  const signals = await detectCreativeFatigue(campaign_id, creativeIds);
  const highFatigueCount = signals.filter(s => s.fatigue_score >= 70).length;
  const avgFatigue = signals.reduce((sum, s) => sum + s.fatigue_score, 0) / signals.length;

  if (highFatigueCount >= creativeIds.length * 0.5) {
    return {
      needsCreatives: true,
      urgency: 'high',
      reasons: ['50%+ of creatives showing fatigue', `Average fatigue: ${avgFatigue.toFixed(0)}/100`],
    };
  }

  if (avgFatigue >= 50) {
    return {
      needsCreatives: true,
      urgency: 'normal',
      reasons: [`Average creative fatigue at ${avgFatigue.toFixed(0)}/100`],
    };
  }

  return { needsCreatives: false, urgency: 'low', reasons: [] };
}
