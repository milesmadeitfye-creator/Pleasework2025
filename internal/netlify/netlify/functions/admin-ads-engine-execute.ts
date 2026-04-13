import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

/**
 * Ghoste Ads Engine — Pipeline Step Executor
 *
 * Executes individual pipeline steps by calling external APIs:
 *   1. copy    → finalizes Claude-generated ad copy (already done in chat, this step just marks complete)
 *   2. video   → calls OpenAI Sora API to generate UGC video
 *   3. composite → calls Remotion Cloud/Lambda to render final video with overlays
 *   4. publish → pushes to Meta Marketing API + Google Ads API
 *
 * Also handles polling for async steps (Sora video generation).
 *
 * POST body: { action: 'execute-step' | 'poll-step' | 'execute-all', jobId, step? }
 */

// ─── API CLIENTS ───────────────────────────────────────────────────────────

const OPENAI_API = 'https://api.openai.com/v1';
const META_GRAPH_API = 'https://graph.facebook.com/v21.0';
const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v18';

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface PipelineData {
  prompt?: string;
  parsed?: any;
  funnel_stage?: string;
  audience_segment?: string;
  ad_copies?: Array<{
    variant: string;
    primary_text: string;
    headline: string;
    description?: string;
    cta_button?: string;
    placement?: string;
  }>;
  sora_prompt?: string;
  sora_aspect_ratio?: string;
  sora_duration_seconds?: number;
  remotion_spec?: {
    resolution?: string;
    hook_text?: string;
    feature_callouts?: string[];
    cta_text?: string;
    cta_url?: string;
    brand_color?: string;
    end_card_text?: string;
  };
  meta_targeting?: {
    age_min?: number;
    age_max?: number;
    interests?: string[];
    excluded_interests?: string[];
    locations?: string[];
    placements?: string[];
    optimization_goal?: string;
  };
  // External IDs stored during async operations
  sora_task_id?: string;
  sora_video_url?: string;
  remotion_render_id?: string;
  remotion_output_url?: string;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  google_campaign_id?: string;
  google_adgroup_id?: string;
  google_ad_id?: string;
}

// ─── HANDLER ────────────────────────────────────────────────────────────────

export async function handler(event: HandlerEvent) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    let body: any = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_json' }); }

    const { action, jobId, step } = body;
    if (!jobId) return json(400, { error: 'missing_job_id' });

    const sb = getServiceClient();

    // Fetch job
    const { data: job, error: jobErr } = await sb
      .from('ads_engine_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobErr || !job) return json(404, { error: 'job_not_found' });

    const pipeline: PipelineData = job.pipeline || {};

    if (action === 'execute-step') {
      return executeStep(sb, auth.admin, job, pipeline, step || job.current_step);
    } else if (action === 'poll-step') {
      return pollStep(sb, job, pipeline, step || job.current_step);
    } else if (action === 'execute-all') {
      return executeAll(sb, auth.admin, job, pipeline);
    } else {
      return json(400, { error: 'unknown_action', valid: ['execute-step', 'poll-step', 'execute-all'] });
    }
  } catch (err) {
    console.error('[ads-engine-execute] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

// ─── EXECUTE ALL (auto-advance through pipeline) ────────────────────────────

async function executeAll(sb: any, admin: any, job: any, pipeline: PipelineData) {
  const steps = ['copy', 'video', 'composite', 'publish'];
  const startIdx = steps.indexOf(job.current_step);
  const results: any[] = [];

  let currentJob = job;
  let currentPipeline = { ...pipeline };

  for (let i = startIdx; i < steps.length; i++) {
    const step = steps[i];
    const result = await executeStepInternal(sb, admin, currentJob, currentPipeline, step);
    results.push({ step, ...result });

    if (result.status === 'failed') {
      return json(200, {
        ok: false,
        stopped_at: step,
        results,
        error: result.error,
      });
    }

    if (result.status === 'processing') {
      // Async step — can't continue immediately
      return json(200, {
        ok: true,
        status: 'processing',
        current_step: step,
        message: `Step "${step}" is processing asynchronously. Poll for completion.`,
        results,
      });
    }

    // Refresh job data for next step
    const { data: refreshed } = await sb
      .from('ads_engine_jobs')
      .select('*')
      .eq('id', job.id)
      .single();
    if (refreshed) {
      currentJob = refreshed;
      currentPipeline = refreshed.pipeline || currentPipeline;
    }
  }

  return json(200, { ok: true, status: 'completed', results });
}

// ─── EXECUTE SINGLE STEP ────────────────────────────────────────────────────

async function executeStep(sb: any, admin: any, job: any, pipeline: PipelineData, step: string) {
  const result = await executeStepInternal(sb, admin, job, pipeline, step);
  return json(200, { ok: result.status !== 'failed', step, ...result });
}

async function executeStepInternal(
  sb: any, admin: any, job: any, pipeline: PipelineData, step: string
): Promise<{ status: string; output?: any; error?: string }> {
  const startTime = Date.now();

  // Mark step as running
  await sb.from('ads_engine_step_logs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('job_id', job.id)
    .eq('step', step);

  await sb.from('ads_engine_jobs')
    .update({ current_step: step, status: 'running' })
    .eq('id', job.id);

  try {
    let result: { status: string; output?: any; error?: string };

    switch (step) {
      case 'copy':
        result = await executeCopyStep(sb, job, pipeline);
        break;
      case 'video':
        result = await executeVideoStep(sb, job, pipeline);
        break;
      case 'composite':
        result = await executeCompositeStep(sb, job, pipeline);
        break;
      case 'publish':
        result = await executePublishStep(sb, job, pipeline);
        break;
      default:
        result = { status: 'failed', error: `Unknown step: ${step}` };
    }

    const duration = Date.now() - startTime;

    if (result.status === 'completed') {
      // Mark step completed
      await sb.from('ads_engine_step_logs')
        .update({
          status: 'completed',
          output: result.output || {},
          duration_ms: duration,
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('step', step);

      // Advance to next step
      const stepOrder = ['copy', 'video', 'composite', 'publish'];
      const nextIdx = stepOrder.indexOf(step) + 1;
      if (nextIdx < stepOrder.length) {
        await sb.from('ads_engine_jobs')
          .update({ current_step: stepOrder[nextIdx] })
          .eq('id', job.id);
        await sb.from('ads_engine_step_logs')
          .update({ status: 'running' })
          .eq('job_id', job.id)
          .eq('step', stepOrder[nextIdx]);
      } else {
        // Pipeline complete
        await sb.from('ads_engine_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', job.id);
      }

      await logAdminAction(admin, {
        action: 'ads_engine_step_completed',
        payload: { job_id: job.id, step, duration_ms: duration },
      }).catch(() => {});
    } else if (result.status === 'processing') {
      // Async step — update with external ID
      await sb.from('ads_engine_step_logs')
        .update({ status: 'processing', output: result.output || {} })
        .eq('job_id', job.id)
        .eq('step', step);
    } else if (result.status === 'failed') {
      await sb.from('ads_engine_step_logs')
        .update({
          status: 'failed',
          error: result.error,
          duration_ms: duration,
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('step', step);
      await sb.from('ads_engine_jobs')
        .update({ status: 'failed', error_log: result.error })
        .eq('id', job.id);
    }

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const errorMsg = err?.message || 'Unknown execution error';
    await sb.from('ads_engine_step_logs')
      .update({ status: 'failed', error: errorMsg, duration_ms: duration })
      .eq('job_id', job.id)
      .eq('step', step);
    await sb.from('ads_engine_jobs')
      .update({ status: 'failed', error_log: errorMsg })
      .eq('id', job.id);
    return { status: 'failed', error: errorMsg };
  }
}

// ─── STEP 1: COPY ──────────────────────────────────────────────────────────
// Copy is already generated by Claude in admin-ads-engine-chat.ts
// This step just finalizes and validates the copy variants

async function executeCopyStep(
  sb: any, job: any, pipeline: PipelineData
): Promise<{ status: string; output?: any; error?: string }> {
  const copies = pipeline.ad_copies || job.copy_variants || [];

  if (copies.length === 0) {
    return { status: 'failed', error: 'No ad copy variants found. Re-run the chat prompt.' };
  }

  // Validate each copy variant
  const validated = copies.map((c: any, i: number) => ({
    variant: c.variant || String.fromCharCode(65 + i),
    primary_text: (c.primary_text || '').slice(0, 125),
    headline: (c.headline || '').slice(0, 40),
    description: c.description || '',
    cta_button: c.cta_button || 'Learn More',
    placement: c.placement || 'feed',
    valid: !!(c.primary_text && c.headline),
  }));

  // Store finalized copy on job
  await sb.from('ads_engine_jobs')
    .update({
      copy_text: validated[0]?.primary_text || job.copy_text,
      copy_variants: validated,
      pipeline: { ...pipeline, ad_copies: validated, copy_finalized: true },
    })
    .eq('id', job.id);

  return {
    status: 'completed',
    output: {
      copy_text: validated[0]?.primary_text,
      variants_count: validated.length,
      variants: validated,
    },
  };
}

// ─── STEP 2: VIDEO (Sora 2 Pro via OpenAI API) ─────────────────────────────

async function executeVideoStep(
  sb: any, job: any, pipeline: PipelineData
): Promise<{ status: string; output?: any; error?: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return { status: 'failed', error: 'OPENAI_API_KEY not configured. Add it to Netlify env vars.' };
  }

  const soraPrompt = pipeline.sora_prompt || job.sora_prompt;
  if (!soraPrompt) {
    return { status: 'failed', error: 'No Sora prompt found. Re-run the chat prompt.' };
  }

  const aspectRatio = pipeline.sora_aspect_ratio || '9:16';
  const duration = pipeline.sora_duration_seconds || 10;

  try {
    // Call OpenAI's video generation API (Sora)
    // POST /v1/videos/generations
    const response = await fetch(`${OPENAI_API}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'sora',
        prompt: soraPrompt,
        size: aspectRatio === '9:16' ? '1080x1920' : '1080x1080',
        duration: duration,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[ads-engine-execute] Sora API error:', response.status, errBody);

      // If 202, it's async — store the task ID
      if (response.status === 202) {
        const asyncData = JSON.parse(errBody);
        const taskId = asyncData.id || asyncData.task_id;

        await sb.from('ads_engine_jobs')
          .update({
            pipeline: { ...pipeline, sora_task_id: taskId },
          })
          .eq('id', job.id);

        return {
          status: 'processing',
          output: { sora_task_id: taskId, message: 'Video generation started. Polling for completion.' },
        };
      }

      return { status: 'failed', error: `Sora API error (${response.status}): ${errBody.slice(0, 200)}` };
    }

    const data = await response.json();

    // Sora returns the video directly or with a task ID
    // Handle both sync and async responses
    if (data.id && !data.data?.[0]?.url) {
      // Async response — store task ID for polling
      await sb.from('ads_engine_jobs')
        .update({
          pipeline: { ...pipeline, sora_task_id: data.id },
        })
        .eq('id', job.id);

      return {
        status: 'processing',
        output: { sora_task_id: data.id, message: 'Video generation in progress...' },
      };
    }

    // Sync response — video URL available
    const videoUrl = data.data?.[0]?.url || data.url || data.output?.url;

    if (!videoUrl) {
      return { status: 'failed', error: 'Sora returned no video URL.' };
    }

    // Store video URL on job
    await sb.from('ads_engine_jobs')
      .update({
        sora_video_url: videoUrl,
        sora_prompt: soraPrompt,
        pipeline: { ...pipeline, sora_video_url: videoUrl },
      })
      .eq('id', job.id);

    return {
      status: 'completed',
      output: { sora_video_url: videoUrl, sora_prompt: soraPrompt },
    };
  } catch (err: any) {
    return { status: 'failed', error: `Sora API call failed: ${err.message}` };
  }
}

// ─── STEP 3: COMPOSITE (Remotion Cloud Render) ─────────────────────────────

async function executeCompositeStep(
  sb: any, job: any, pipeline: PipelineData
): Promise<{ status: string; output?: any; error?: string }> {
  const remotionSiteUrl = process.env.REMOTION_SERVE_URL;
  const remotionToken = process.env.REMOTION_API_TOKEN;
  const videoUrl = pipeline.sora_video_url || job.sora_video_url;

  if (!videoUrl) {
    return { status: 'failed', error: 'No source video URL. Video step must complete first.' };
  }

  const spec = pipeline.remotion_spec || {};
  const copies = pipeline.ad_copies || job.copy_variants || [];

  // Build Remotion input props
  const inputProps = {
    videoUrl,
    resolution: spec.resolution || '1080x1920',
    hookText: spec.hook_text || copies[0]?.primary_text || '',
    featureCallouts: spec.feature_callouts || [],
    ctaText: spec.cta_text || 'Start Free Today',
    ctaUrl: spec.cta_url || 'https://ghoste.one',
    brandColor: spec.brand_color || '#1a6cff',
    endCardText: spec.end_card_text || 'ghoste.one — Your music, operated.',
    logoUrl: 'https://ghoste.one/ghoste-logo.png',
    adCopies: copies,
    artistName: job.artist_name,
    songTitle: job.song_title,
  };

  // If Remotion Cloud is configured, use their render API
  if (remotionToken) {
    try {
      const response = await fetch('https://api.remotion.dev/v1/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${remotionToken}`,
        },
        body: JSON.stringify({
          serveUrl: remotionSiteUrl || 'https://ghoste-remotion.netlify.app',
          composition: 'GhosteAdComposite',
          inputProps,
          codec: 'h264',
          imageFormat: 'jpeg',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();

        if (response.status === 202) {
          const asyncData = JSON.parse(errText);
          const renderId = asyncData.renderId || asyncData.id;

          await sb.from('ads_engine_jobs')
            .update({ pipeline: { ...pipeline, remotion_render_id: renderId } })
            .eq('id', job.id);

          return {
            status: 'processing',
            output: { remotion_render_id: renderId, message: 'Remotion rendering in progress...' },
          };
        }

        return { status: 'failed', error: `Remotion API error (${response.status}): ${errText.slice(0, 200)}` };
      }

      const data = await response.json();
      const renderId = data.renderId || data.id;

      if (data.outputUrl || data.url) {
        // Sync render complete
        const outputUrl = data.outputUrl || data.url;
        await sb.from('ads_engine_jobs')
          .update({
            remotion_output_url: outputUrl,
            pipeline: { ...pipeline, remotion_output_url: outputUrl },
          })
          .eq('id', job.id);

        return { status: 'completed', output: { remotion_output_url: outputUrl } };
      }

      // Async render
      await sb.from('ads_engine_jobs')
        .update({ pipeline: { ...pipeline, remotion_render_id: renderId } })
        .eq('id', job.id);

      return {
        status: 'processing',
        output: { remotion_render_id: renderId, message: 'Remotion rendering started.' },
      };
    } catch (err: any) {
      return { status: 'failed', error: `Remotion API call failed: ${err.message}` };
    }
  }

  // If Remotion Lambda is configured (AWS)
  const lambdaFn = process.env.REMOTION_LAMBDA_FUNCTION;
  if (lambdaFn) {
    try {
      // Invoke via Remotion Lambda's HTTP trigger (if set up via API Gateway)
      const lambdaUrl = process.env.REMOTION_LAMBDA_URL;
      if (!lambdaUrl) {
        return { status: 'failed', error: 'REMOTION_LAMBDA_URL not configured.' };
      }

      const response = await fetch(lambdaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          serveUrl: remotionSiteUrl,
          composition: 'GhosteAdComposite',
          inputProps,
          codec: 'h264',
        }),
      });

      const data = await response.json();

      if (data.renderId) {
        await sb.from('ads_engine_jobs')
          .update({ pipeline: { ...pipeline, remotion_render_id: data.renderId } })
          .eq('id', job.id);

        return {
          status: 'processing',
          output: { remotion_render_id: data.renderId, message: 'Lambda render started.' },
        };
      }

      return { status: 'failed', error: 'Lambda returned no render ID.' };
    } catch (err: any) {
      return { status: 'failed', error: `Lambda invocation failed: ${err.message}` };
    }
  }

  // Fallback: No Remotion configured — store the composition spec for manual rendering
  // In production you'd have a Remotion deploy. For now, store the spec.
  const compositeSpec = {
    status: 'spec_ready',
    inputProps,
    renderCommand: `npx remotion render GhosteAdComposite --props='${JSON.stringify(inputProps)}' out/ad-${job.id.slice(0, 8)}.mp4`,
    message: 'Remotion not configured. Composition spec saved — render manually or add REMOTION_API_TOKEN.',
  };

  // Store as "completed" with the spec so the pipeline can continue to publish
  const specUrl = `spec://remotion/${job.id}`;
  await sb.from('ads_engine_jobs')
    .update({
      remotion_output_url: specUrl,
      pipeline: { ...pipeline, remotion_output_url: specUrl, remotion_spec_data: compositeSpec },
    })
    .eq('id', job.id);

  return {
    status: 'completed',
    output: compositeSpec,
  };
}

// ─── STEP 4: PUBLISH (Meta Marketing API + Google Ads) ──────────────────────

async function executePublishStep(
  sb: any, job: any, pipeline: PipelineData
): Promise<{ status: string; output?: any; error?: string }> {
  const results: any = { meta: null, google: null };
  let anySuccess = false;

  // ── META MARKETING API ──────────────────────────────────────────────────
  const metaToken = process.env.META_ACCESS_TOKEN;
  const metaAdAccountId = process.env.META_AD_ACCOUNT_ID;
  const metaPageId = process.env.META_PAGE_ID;

  if (metaToken && metaAdAccountId) {
    try {
      results.meta = await publishToMeta(
        sb, job, pipeline, metaToken, metaAdAccountId, metaPageId || ''
      );
      if (results.meta.campaign_id) anySuccess = true;
    } catch (err: any) {
      results.meta = { error: err.message };
    }
  } else {
    results.meta = { skipped: true, reason: 'META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not configured.' };
  }

  // ── GOOGLE ADS API ──────────────────────────────────────────────────────
  const googleDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const googleCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const googleRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (googleDevToken && googleCustomerId && googleRefreshToken) {
    try {
      results.google = await publishToGoogle(
        sb, job, pipeline,
        googleDevToken, googleCustomerId,
        googleRefreshToken, googleClientId || '', googleClientSecret || ''
      );
      if (results.google.campaign_id) anySuccess = true;
    } catch (err: any) {
      results.google = { error: err.message };
    }
  } else {
    results.google = { skipped: true, reason: 'Google Ads API keys not configured.' };
  }

  if (!anySuccess && !results.meta?.skipped && !results.google?.skipped) {
    return { status: 'failed', error: 'Both Meta and Google publish failed.', output: results };
  }

  // Store IDs
  const jobUpdate: any = {
    pipeline: {
      ...pipeline,
      meta_campaign_id: results.meta?.campaign_id,
      meta_adset_id: results.meta?.adset_id,
      meta_ad_id: results.meta?.ad_id,
      google_campaign_id: results.google?.campaign_id,
      google_adgroup_id: results.google?.adgroup_id,
      google_ad_id: results.google?.ad_id,
      publish_results: results,
    },
  };
  if (results.meta?.campaign_id) jobUpdate.meta_campaign_id = results.meta.campaign_id;

  await sb.from('ads_engine_jobs').update(jobUpdate).eq('id', job.id);

  return { status: 'completed', output: results };
}

// ─── META MARKETING API IMPLEMENTATION ──────────────────────────────────────

async function publishToMeta(
  sb: any, job: any, pipeline: PipelineData,
  token: string, adAccountId: string, pageId: string
) {
  const targeting = pipeline.meta_targeting || {};
  const copies = pipeline.ad_copies || job.copy_variants || [];
  const videoUrl = pipeline.remotion_output_url || job.remotion_output_url || pipeline.sora_video_url || job.sora_video_url;
  const budgetCents = job.budget_cents || 1000; // default $10/day

  // 1. Create Campaign
  const campaignRes = await metaApiCall(`${META_GRAPH_API}/act_${adAccountId}/campaigns`, token, {
    name: `Ghoste — ${job.artist_name} — ${job.song_title}`,
    objective: mapMetaObjective(targeting.optimization_goal),
    status: 'PAUSED', // Create paused, user activates manually
    special_ad_categories: '[]',
  });

  if (!campaignRes.id) {
    throw new Error(`Campaign creation failed: ${JSON.stringify(campaignRes)}`);
  }

  const campaignId = campaignRes.id;

  // 2. Create Ad Set
  const adSetPayload: any = {
    name: `${job.artist_name} — ${pipeline.funnel_stage || 'full_funnel'} — ${pipeline.audience_segment || 'broad'}`,
    campaign_id: campaignId,
    daily_budget: Math.max(budgetCents, 500), // min $5/day in cents
    billing_event: 'IMPRESSIONS',
    optimization_goal: targeting.optimization_goal || 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    status: 'PAUSED',
    targeting: JSON.stringify({
      age_min: targeting.age_min || 18,
      age_max: targeting.age_max || 45,
      geo_locations: {
        countries: targeting.locations || ['US'],
      },
      flexible_spec: targeting.interests?.length ? [{
        interests: targeting.interests.map(i => ({ name: i })),
      }] : undefined,
      publisher_platforms: mapMetaPlacements(targeting.placements),
    }),
  };

  const adSetRes = await metaApiCall(`${META_GRAPH_API}/act_${adAccountId}/adsets`, token, adSetPayload);
  if (!adSetRes.id) {
    throw new Error(`Ad Set creation failed: ${JSON.stringify(adSetRes)}`);
  }
  const adSetId = adSetRes.id;

  // 3. Upload video creative (if we have a real video URL)
  let videoId: string | null = null;
  if (videoUrl && !videoUrl.startsWith('spec://')) {
    try {
      const videoUpload = await metaApiCall(`${META_GRAPH_API}/act_${adAccountId}/advideos`, token, {
        file_url: videoUrl,
        title: `${job.artist_name} — ${job.song_title} Ad`,
      });
      videoId = videoUpload.id || null;
    } catch (err) {
      console.error('[publish-meta] Video upload failed, continuing with image fallback:', err);
    }
  }

  // 4. Create Ad Creative
  const primaryCopy = copies[0] || {};
  const creativePayload: any = {
    name: `${job.artist_name} creative`,
    object_story_spec: JSON.stringify({
      page_id: pageId || adAccountId,
      ...(videoId ? {
        video_data: {
          video_id: videoId,
          message: primaryCopy.primary_text || `Check out ${job.artist_name}`,
          title: primaryCopy.headline || job.song_title,
          call_to_action: {
            type: mapMetaCTA(primaryCopy.cta_button),
            value: { link: pipeline.remotion_spec?.cta_url || 'https://ghoste.one' },
          },
        },
      } : {
        link_data: {
          message: primaryCopy.primary_text || `Check out ${job.artist_name}`,
          name: primaryCopy.headline || job.song_title,
          link: pipeline.remotion_spec?.cta_url || 'https://ghoste.one',
          call_to_action: {
            type: mapMetaCTA(primaryCopy.cta_button),
          },
        },
      }),
    }),
  };

  const creativeRes = await metaApiCall(`${META_GRAPH_API}/act_${adAccountId}/adcreatives`, token, creativePayload);
  const creativeId = creativeRes.id;

  // 5. Create Ad
  const adRes = await metaApiCall(`${META_GRAPH_API}/act_${adAccountId}/ads`, token, {
    name: `${job.artist_name} — ${primaryCopy.variant || 'A'}`,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'PAUSED',
  });

  return {
    campaign_id: campaignId,
    adset_id: adSetId,
    creative_id: creativeId,
    ad_id: adRes.id,
    video_id: videoId,
    status: 'PAUSED',
    message: 'Campaign created and paused on Meta. Activate from Meta Ads Manager when ready.',
    meta_url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`,
  };
}

async function metaApiCall(url: string, token: string, params: any) {
  const formData = new URLSearchParams();
  formData.append('access_token', token);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta API: ${data.error.message} (code: ${data.error.code})`);
  }
  return data;
}

function mapMetaObjective(goal?: string): string {
  const map: Record<string, string> = {
    CONVERSIONS: 'OUTCOME_SALES',
    REACH: 'OUTCOME_AWARENESS',
    LINK_CLICKS: 'OUTCOME_TRAFFIC',
    ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
    VIDEO_VIEWS: 'OUTCOME_AWARENESS',
  };
  return map[goal || ''] || 'OUTCOME_TRAFFIC';
}

function mapMetaCTA(cta?: string): string {
  const map: Record<string, string> = {
    'Sign Up': 'SIGN_UP',
    'Learn More': 'LEARN_MORE',
    'Get Started': 'GET_OFFER',
    'Try Free': 'SIGN_UP',
    'Download': 'DOWNLOAD',
    'Listen Now': 'LISTEN_NOW',
  };
  return map[cta || ''] || 'LEARN_MORE';
}

function mapMetaPlacements(placements?: string[]): string[] {
  if (!placements?.length) return ['facebook', 'instagram'];
  const mapped = new Set<string>();
  for (const p of placements) {
    if (p.includes('facebook')) mapped.add('facebook');
    if (p.includes('instagram')) mapped.add('instagram');
    if (p.includes('audience')) mapped.add('audience_network');
  }
  return [...mapped];
}

// ─── GOOGLE ADS API IMPLEMENTATION ──────────────────────────────────────────

async function publishToGoogle(
  sb: any, job: any, pipeline: PipelineData,
  devToken: string, customerId: string,
  refreshToken: string, clientId: string, clientSecret: string
) {
  // 1. Get access token from refresh token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google OAuth failed: ${JSON.stringify(tokenData)}`);
  }

  const accessToken = tokenData.access_token;
  const formattedCustomerId = customerId.replace(/-/g, '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': devToken,
  };

  // If using a manager account
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId.replace(/-/g, '');
  }

  const baseUrl = `${GOOGLE_ADS_API}/customers/${formattedCustomerId}`;
  const targeting = pipeline.meta_targeting || {}; // reuse targeting data

  // 2. Create Campaign
  const campaignBudgetRes = await googleApiCall(`${baseUrl}/campaignBudgets:mutate`, headers, {
    operations: [{
      create: {
        name: `Ghoste ${job.artist_name} Budget ${Date.now()}`,
        amountMicros: String((job.budget_cents || 1000) * 10000), // cents → micros
        deliveryMethod: 'STANDARD',
      },
    }],
  });

  const budgetResourceName = campaignBudgetRes.results?.[0]?.resourceName;
  if (!budgetResourceName) {
    throw new Error('Failed to create Google Ads budget');
  }

  const campaignRes = await googleApiCall(`${baseUrl}/campaigns:mutate`, headers, {
    operations: [{
      create: {
        name: `Ghoste — ${job.artist_name} — ${job.song_title}`,
        advertisingChannelType: 'VIDEO',
        status: 'PAUSED',
        campaignBudget: budgetResourceName,
        biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
      },
    }],
  });

  const campaignResourceName = campaignRes.results?.[0]?.resourceName;
  if (!campaignResourceName) {
    throw new Error('Failed to create Google Ads campaign');
  }

  const campaignId = campaignResourceName.split('/').pop();

  // 3. Create Ad Group
  const adGroupRes = await googleApiCall(`${baseUrl}/adGroups:mutate`, headers, {
    operations: [{
      create: {
        name: `${job.artist_name} — ${pipeline.funnel_stage || 'full_funnel'}`,
        campaign: campaignResourceName,
        type: 'VIDEO_TRUE_VIEW_IN_STREAM',
        status: 'ENABLED',
        cpcBidMicros: '500000', // $0.50
      },
    }],
  });

  const adGroupResourceName = adGroupRes.results?.[0]?.resourceName;
  const adGroupId = adGroupResourceName?.split('/').pop();

  // 4. Create YouTube video ad (if we have a video URL)
  const copies = pipeline.ad_copies || job.copy_variants || [];
  const primaryCopy = copies[0] || {};

  // For Google Video ads, we'd need the video uploaded to YouTube
  // For now, create a responsive display ad with the copy
  const adRes = await googleApiCall(`${baseUrl}/adGroupAds:mutate`, headers, {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        status: 'PAUSED',
        ad: {
          responsiveDisplayAd: {
            headlines: copies.slice(0, 3).map((c: any) => ({
              text: (c.headline || job.song_title).slice(0, 30),
            })),
            descriptions: copies.slice(0, 3).map((c: any) => ({
              text: (c.primary_text || '').slice(0, 90),
            })),
            longHeadline: { text: `${job.artist_name} — ${job.song_title}`.slice(0, 90) },
            businessName: 'Ghoste',
            callToActionText: primaryCopy.cta_button || 'Learn More',
          },
          finalUrls: [pipeline.remotion_spec?.cta_url || 'https://ghoste.one'],
        },
      },
    }],
  });

  const adId = adRes.results?.[0]?.resourceName?.split('/').pop();

  // 5. Add targeting criteria (age, interests)
  if (targeting.age_min || targeting.age_max) {
    await googleApiCall(`${baseUrl}/adGroupCriteria:mutate`, headers, {
      operations: [{
        create: {
          adGroup: adGroupResourceName,
          ageRange: {
            type: mapGoogleAgeRange(targeting.age_min, targeting.age_max),
          },
        },
      }],
    }).catch(() => {}); // best effort
  }

  return {
    campaign_id: campaignId,
    campaign_resource: campaignResourceName,
    adgroup_id: adGroupId,
    ad_id: adId,
    status: 'PAUSED',
    message: 'Campaign created and paused on Google Ads. Activate from Google Ads Manager.',
    google_url: `https://ads.google.com/aw/campaigns?campaignId=${campaignId}`,
  };
}

async function googleApiCall(url: string, headers: Record<string, string>, body: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Google Ads API: ${data.error.message} (status: ${data.error.status})`);
  }
  return data;
}

function mapGoogleAgeRange(min?: number, max?: number): string {
  // Google Ads uses predefined age ranges
  if (!min || min <= 24) return 'AGE_RANGE_18_24';
  if (min <= 34) return 'AGE_RANGE_25_34';
  if (min <= 44) return 'AGE_RANGE_35_44';
  if (min <= 54) return 'AGE_RANGE_45_54';
  return 'AGE_RANGE_55_64';
}

// ─── POLL STEP (check async operations) ─────────────────────────────────────

async function pollStep(sb: any, job: any, pipeline: PipelineData, step: string) {
  if (step === 'video' && pipeline.sora_task_id) {
    return pollSoraVideo(sb, job, pipeline);
  }
  if (step === 'composite' && pipeline.remotion_render_id) {
    return pollRemotionRender(sb, job, pipeline);
  }
  return json(200, { status: 'no_async_task', step });
}

async function pollSoraVideo(sb: any, job: any, pipeline: PipelineData) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return json(200, { status: 'error', error: 'No OPENAI_API_KEY' });

  try {
    const res = await fetch(`${OPENAI_API}/videos/generations/${pipeline.sora_task_id}`, {
      headers: { 'Authorization': `Bearer ${openaiKey}` },
    });
    const data = await res.json();

    if (data.status === 'completed' || data.data?.[0]?.url) {
      const videoUrl = data.data?.[0]?.url || data.output?.url || data.url;

      await sb.from('ads_engine_jobs')
        .update({
          sora_video_url: videoUrl,
          pipeline: { ...pipeline, sora_video_url: videoUrl },
        })
        .eq('id', job.id);

      // Mark step completed
      await sb.from('ads_engine_step_logs')
        .update({
          status: 'completed',
          output: { sora_video_url: videoUrl },
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('step', 'video');

      // Start next step
      await sb.from('ads_engine_jobs')
        .update({ current_step: 'composite' })
        .eq('id', job.id);
      await sb.from('ads_engine_step_logs')
        .update({ status: 'running' })
        .eq('job_id', job.id)
        .eq('step', 'composite');

      return json(200, { status: 'completed', sora_video_url: videoUrl });
    }

    if (data.status === 'failed') {
      await sb.from('ads_engine_step_logs')
        .update({ status: 'failed', error: data.error || 'Sora generation failed' })
        .eq('job_id', job.id)
        .eq('step', 'video');

      return json(200, { status: 'failed', error: data.error });
    }

    // Still processing
    return json(200, {
      status: 'processing',
      progress: data.progress || null,
      message: 'Sora is still generating the video...',
    });
  } catch (err: any) {
    return json(200, { status: 'error', error: err.message });
  }
}

async function pollRemotionRender(sb: any, job: any, pipeline: PipelineData) {
  const remotionToken = process.env.REMOTION_API_TOKEN;
  if (!remotionToken) return json(200, { status: 'error', error: 'No REMOTION_API_TOKEN' });

  try {
    const res = await fetch(`https://api.remotion.dev/v1/render/${pipeline.remotion_render_id}`, {
      headers: { 'Authorization': `Bearer ${remotionToken}` },
    });
    const data = await res.json();

    if (data.status === 'done' || data.outputUrl) {
      const outputUrl = data.outputUrl || data.url;

      await sb.from('ads_engine_jobs')
        .update({
          remotion_output_url: outputUrl,
          pipeline: { ...pipeline, remotion_output_url: outputUrl },
        })
        .eq('id', job.id);

      await sb.from('ads_engine_step_logs')
        .update({
          status: 'completed',
          output: { remotion_output_url: outputUrl },
          completed_at: new Date().toISOString(),
        })
        .eq('job_id', job.id)
        .eq('step', 'composite');

      // Start publish
      await sb.from('ads_engine_jobs')
        .update({ current_step: 'publish' })
        .eq('id', job.id);
      await sb.from('ads_engine_step_logs')
        .update({ status: 'running' })
        .eq('job_id', job.id)
        .eq('step', 'publish');

      return json(200, { status: 'completed', remotion_output_url: outputUrl });
    }

    if (data.status === 'failed') {
      await sb.from('ads_engine_step_logs')
        .update({ status: 'failed', error: data.error || 'Render failed' })
        .eq('job_id', job.id)
        .eq('step', 'composite');

      return json(200, { status: 'failed', error: data.error });
    }

    return json(200, {
      status: 'processing',
      progress: data.progress || data.percent || null,
      message: 'Remotion is rendering...',
    });
  } catch (err: any) {
    return json(200, { status: 'error', error: err.message });
  }
}
