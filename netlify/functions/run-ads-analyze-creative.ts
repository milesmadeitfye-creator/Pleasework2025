import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { analyzeCreative, generateCaptions } from "./_aiCreativeAnalyzer";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  const authHeader = event.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "unauthorized" }),
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { creative_id } = body;

    if (!creative_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_creative_id" }),
      };
    }

    const { data: creative, error: creativeError } = await supabase
      .from('ad_creatives')
      .select('*')
      .eq('id', creative_id)
      .eq('owner_user_id', user.id)
      .single();

    if (creativeError || !creative) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: "creative_not_found" }),
      };
    }

    if (creative.creative_type !== 'video') {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "only_videos_supported" }),
      };
    }

    console.log('[run-ads-analyze-creative] Analyzing:', creative_id);

    const analysis = await analyzeCreative(
      creative.public_url,
      creative.duration_seconds || 30,
      creative.caption || undefined
    );

    await supabase
      .from('ad_creatives')
      .update({
        hook_strength: analysis.hook_strength,
        hook_style: analysis.hook_style,
        energy_level: analysis.energy_level,
        platform_fit: analysis.platform_fit,
        pacing_score: analysis.pacing_score,
        visual_quality: analysis.visual_quality,
        analyzed_at: new Date().toISOString(),
        analysis_complete: true,
      })
      .eq('id', creative_id);

    await supabase
      .from('ai_creative_analysis')
      .insert([{
        creative_id,
        hook_timestamp_seconds: analysis.hook_timestamp_seconds,
        hook_description: analysis.hook_description,
        hook_effectiveness_reasons: analysis.hook_effectiveness_reasons,
        pacing_description: analysis.pacing_description,
        scene_changes: analysis.scene_changes,
        visual_flow_score: analysis.visual_flow_score,
        suggested_captions: analysis.suggested_captions,
        platform_scores: analysis.platform_scores,
        best_platforms: analysis.best_platforms,
        optimization_suggestions: analysis.optimization_suggestions,
      }]);

    console.log('[run-ads-analyze-creative] ✅ Analysis complete:', {
      hook_strength: analysis.hook_strength,
      best_platforms: analysis.best_platforms,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        analysis: {
          hook_strength: analysis.hook_strength,
          hook_style: analysis.hook_style,
          energy_level: analysis.energy_level,
          platform_fit: analysis.platform_fit,
          pacing_score: analysis.pacing_score,
          visual_quality: analysis.visual_quality,
          suggested_captions: analysis.suggested_captions,
          best_platforms: analysis.best_platforms,
          optimization_suggestions: analysis.optimization_suggestions,
        },
      }),
    };
  } catch (e: any) {
    console.error("[run-ads-analyze-creative] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "analysis_error" }),
    };
  }
};
