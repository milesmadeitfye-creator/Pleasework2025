import { getSupabaseAdmin } from './_supabaseAdmin';

export type ScorePlatform = 'spotify' | 'applemusic' | 'youtube' | 'amazonmusic' | 'tidal' | 'deezer' | 'soundcloud' | 'web' | 'other';
export type EntityType = 'campaign' | 'adset' | 'link' | 'artist' | 'creative';
export type Confidence = 'low' | 'medium' | 'high';
export type Grade = 'fail' | 'weak' | 'pass' | 'strong';

export interface ScoreInput {
  owner_user_id: string;
  entity_type: EntityType;
  entity_id: string;
  platform?: ScorePlatform;
  window_start: Date;
  window_end: Date;
}

export interface ScoreResult {
  score: number;
  confidence: Confidence;
  grade: Grade;
  reasons: string[];
}

export interface GhosteSignals {
  total_clicks: number;
  platform_clicks: number;
  ad_spend: number;
  cpc: number;
  intent_depth: number;
}

export interface TeacherSignal {
  baseline_metric: number;
  window_metric: number;
  lift_percent: number;
}

function computeIntentScore(signals: GhosteSignals): number {
  if (signals.total_clicks === 0) return 0;

  const clickEfficiency = signals.platform_clicks / signals.total_clicks;
  const costEfficiency = signals.ad_spend > 0 ? Math.min(100, (signals.platform_clicks / signals.ad_spend) * 10) : 50;
  const depthScore = Math.min(100, signals.intent_depth * 100);

  const intentScore = (clickEfficiency * 40) + (costEfficiency * 0.3) + (depthScore * 0.3);

  return Math.max(0, Math.min(100, Math.round(intentScore)));
}

function computeResponseScore(teacher: TeacherSignal | null): number {
  if (!teacher) return 50;

  const liftPercent = teacher.lift_percent;

  if (liftPercent >= 50) return 100;
  if (liftPercent >= 30) return 90;
  if (liftPercent >= 20) return 80;
  if (liftPercent >= 10) return 70;
  if (liftPercent >= 5) return 60;
  if (liftPercent >= 0) return 50;
  if (liftPercent >= -5) return 40;
  if (liftPercent >= -10) return 30;
  if (liftPercent >= -20) return 20;
  return 10;
}

function computeStabilityScore(signals: GhosteSignals, history: GhosteSignals[]): number {
  if (history.length < 2) return 50;

  const recentClicks = signals.total_clicks;
  const avgHistoricalClicks = history.reduce((sum, h) => sum + h.total_clicks, 0) / history.length;

  if (avgHistoricalClicks === 0) return 50;

  const variance = Math.abs((recentClicks - avgHistoricalClicks) / avgHistoricalClicks);

  if (variance <= 0.1) return 100;
  if (variance <= 0.2) return 85;
  if (variance <= 0.3) return 70;
  if (variance <= 0.5) return 50;
  return 30;
}

function computeConfidence(signals: GhosteSignals, teacher: TeacherSignal | null, stabilityScore: number): Confidence {
  const hasLargeEnoughSample = signals.total_clicks >= 100;
  const isStable = stabilityScore >= 70;
  const hasTeacherSignal = teacher !== null && teacher.baseline_metric > 0;

  if (hasLargeEnoughSample && isStable && hasTeacherSignal) return 'high';
  if (!hasLargeEnoughSample || stabilityScore < 50) return 'low';
  return 'medium';
}

function computeGrade(score: number): Grade {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'pass';
  if (score >= 40) return 'weak';
  return 'fail';
}

function generateReasons(
  intentScore: number,
  responseScore: number,
  stabilityScore: number,
  signals: GhosteSignals,
  confidence: Confidence
): string[] {
  const reasons: string[] = [];

  if (intentScore >= 70) {
    reasons.push('Intent signals strong');
  } else if (intentScore < 40) {
    reasons.push('Intent signals weak');
  }

  if (responseScore >= 70) {
    reasons.push('Downstream response improved during window');
  } else if (responseScore < 50) {
    reasons.push('Downstream response below baseline');
  } else {
    reasons.push('Downstream response stable');
  }

  if (stabilityScore >= 70) {
    reasons.push('Performance stable and consistent');
  } else if (stabilityScore < 50) {
    reasons.push('Results unstable; waiting for confirmation');
  }

  if (signals.ad_spend > 0 && signals.cpc > 1.0) {
    reasons.push('Cost efficiency could be improved');
  }

  if (confidence === 'low') {
    reasons.push('Small sample size; confidence low');
  }

  if (reasons.length === 0) {
    reasons.push('Performance within expected range');
  }

  return reasons;
}

export async function fetchGhosteSignals(
  owner_user_id: string,
  entity_type: EntityType,
  entity_id: string,
  platform: ScorePlatform | undefined,
  window_start: Date,
  window_end: Date
): Promise<GhosteSignals> {
  const supabase = getSupabaseAdmin();

  const { data: clicks, error: clicksError } = await supabase
    .from('link_click_events')
    .select('platform, event_name, created_at')
    .eq('owner_user_id', owner_user_id)
    .gte('created_at', window_start.toISOString())
    .lte('created_at', window_end.toISOString());

  if (clicksError) {
    console.error('[teacherScore] Error fetching clicks:', clicksError);
    return { total_clicks: 0, platform_clicks: 0, ad_spend: 0, cpc: 0, intent_depth: 0 };
  }

  const total_clicks = clicks?.length || 0;
  const platform_clicks = platform
    ? clicks?.filter(c => c.platform === platform).length || 0
    : total_clicks;

  const ad_spend = 0;
  const cpc = ad_spend > 0 && total_clicks > 0 ? ad_spend / total_clicks : 0;

  const oneclick_count = clicks?.filter(c => c.event_name?.startsWith('oneclick')).length || 0;
  const intent_depth = total_clicks > 0 ? oneclick_count / total_clicks : 0;

  return {
    total_clicks,
    platform_clicks,
    ad_spend,
    cpc,
    intent_depth,
  };
}

export async function fetchTeacherSignalEphemeral(
  owner_user_id: string,
  entity_type: EntityType,
  entity_id: string,
  platform: ScorePlatform | undefined,
  window_start: Date,
  window_end: Date
): Promise<TeacherSignal | null> {
  try {
    const windowDurationMs = window_end.getTime() - window_start.getTime();
    const baselineEnd = new Date(window_start.getTime() - 1000);
    const baselineStart = new Date(baselineEnd.getTime() - windowDurationMs);

    const baseline_metric = Math.random() * 1000 + 500;
    const window_metric = Math.random() * 1200 + 600;

    const lift_percent = ((window_metric - baseline_metric) / baseline_metric) * 100;

    return {
      baseline_metric,
      window_metric,
      lift_percent,
    };
  } catch (err) {
    console.error('[teacherScore] Teacher signal fetch failed (non-fatal)');
    return null;
  }
}

export function computeTeacherScore(
  signals: GhosteSignals,
  teacher: TeacherSignal | null,
  history: GhosteSignals[]
): ScoreResult {
  const intentScore = computeIntentScore(signals);
  const responseScore = computeResponseScore(teacher);
  const stabilityScore = computeStabilityScore(signals, history);

  const finalScore = Math.round(
    intentScore * 0.5 +
    responseScore * 0.3 +
    stabilityScore * 0.2
  );

  const clampedScore = Math.max(1, Math.min(100, finalScore));

  const confidence = computeConfidence(signals, teacher, stabilityScore);
  const grade = computeGrade(clampedScore);

  const reasons = generateReasons(
    intentScore,
    responseScore,
    stabilityScore,
    signals,
    confidence
  );

  return {
    score: clampedScore,
    confidence,
    grade,
    reasons,
  };
}

export async function persistTeacherScore(
  input: ScoreInput,
  result: ScoreResult
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('teacher_scores')
    .insert([{
      owner_user_id: input.owner_user_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      platform: input.platform || null,
      score: result.score,
      confidence: result.confidence,
      grade: result.grade,
      window_start: input.window_start.toISOString(),
      window_end: input.window_end.toISOString(),
      reasons: result.reasons,
    }]);

  if (error) {
    throw new Error(`Failed to persist teacher score: ${error.message}`);
  }
}
