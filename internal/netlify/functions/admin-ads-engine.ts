import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

interface StepLog {
  step: string;
  status: string;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface AdsEngineJob {
  id: string;
  artist_name: string;
  song_title: string;
  status: string;
  current_step: string;
  pipeline: Record<string, unknown> | null;
  copy_text: string | null;
  sora_video_url: string | null;
  remotion_output_url: string | null;
  meta_campaign_id: string | null;
  platform: string;
  created_at: string;
  updated_at: string;
  steps: StepLog[];
}

interface ListResponse {
  jobs: AdsEngineJob[];
}

interface JobResponse {
  ok: boolean;
  job?: AdsEngineJob;
  error?: string;
}

/**
 * GET: List all pipeline jobs with their step logs
 * POST: Manage jobs (create, start, advance, fail, retry)
 */
export async function handler(event: HandlerEvent) {
  try {
    const auth = await requireAdmin(event);
    if (!auth.ok) {
      const failure = auth as any;
      return json(failure.status, { error: failure.error });
    }

    const sb = getServiceClient();
    const method = event.httpMethod?.toUpperCase() || 'GET';

    if (method === 'GET') {
      return handleGet(sb);
    } else if (method === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      return handlePost(sb, auth.admin, body);
    } else {
      return json(405, { error: 'method_not_allowed' });
    }
  } catch (err) {
    console.error('[admin-ads-engine] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handleGet(sb: any) {
  try {
    const { data: jobs, error: jobsErr } = await sb
      .from('ads_engine_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (jobsErr) {
      console.error('[admin-ads-engine] jobs query failed', jobsErr);
      return json(500, { error: 'query_failed' });
    }

    const jobsWithSteps: AdsEngineJob[] = [];

    for (const job of jobs || []) {
      const { data: steps, error: stepsErr } = await sb
        .from('ads_engine_step_logs')
        .select('step, status, duration_ms, error, created_at')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true });

      if (stepsErr) {
        console.error(`[admin-ads-engine] steps query failed for job ${job.id}`, stepsErr);
      }

      jobsWithSteps.push({
        id: job.id,
        artist_name: job.artist_name,
        song_title: job.song_title,
        status: job.status,
        current_step: job.current_step,
        pipeline: job.pipeline,
        copy_text: job.copy_text,
        sora_video_url: job.sora_video_url,
        remotion_output_url: job.remotion_output_url,
        meta_campaign_id: job.meta_campaign_id,
        platform: job.platform,
        created_at: job.created_at,
        updated_at: job.updated_at,
        steps: (steps || []).map((s: any) => ({
          step: s.step,
          status: s.status,
          duration_ms: s.duration_ms,
          error: s.error,
          created_at: s.created_at,
        })),
      });
    }

    return json(200, { jobs: jobsWithSteps } as ListResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleGet error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handlePost(sb: any, admin: any, body: any) {
  const action = body.action;

  if (action === 'create-job') {
    return handleCreateJob(sb, admin, body);
  } else if (action === 'start-pipeline') {
    return handleStartPipeline(sb, admin, body);
  } else if (action === 'advance-step') {
    return handleAdvanceStep(sb, admin, body);
  } else if (action === 'fail-step') {
    return handleFailStep(sb, admin, body);
  } else if (action === 'retry-step') {
    return handleRetryStep(sb, admin, body);
  } else {
    return json(400, { error: 'unknown_action' });
  }
}

async function handleCreateJob(sb: any, admin: any, body: any): Promise<any> {
  const { artist_name, song_title, song_url, cover_art_url, target_audience, budget_cents } = body;

  if (!artist_name || !song_title) {
    return json(400, { error: 'missing_required_fields' });
  }

  try {
    const { data: job, error: insertErr } = await sb
      .from('ads_engine_jobs')
      .insert({
        created_by: admin.userId,
        artist_name,
        song_title,
        song_url: song_url || null,
        cover_art_url: cover_art_url || null,
        target_audience: target_audience || null,
        budget_cents: budget_cents || 0,
        status: 'draft',
        current_step: 'copy',
        platform: 'meta',
        pipeline: {},
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[admin-ads-engine] insert failed', insertErr);
      return json(500, { error: 'insert_failed' });
    }

    await logAdminAction(admin, {
      action: 'ads_engine_job_created',
      payload: {
        job_id: job.id,
        artist_name,
        song_title,
      },
    });

    const jobWithSteps = await buildJobWithSteps(sb, job);
    return json(201, { ok: true, job: jobWithSteps } as JobResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleCreateJob error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handleStartPipeline(sb: any, admin: any, body: any): Promise<any> {
  const { jobId } = body;

  if (!jobId) {
    return json(400, { error: 'missing_job_id' });
  }

  try {
    // Update job status
    const { data: job, error: updateErr } = await sb
      .from('ads_engine_jobs')
      .update({
        status: 'running',
        current_step: 'copy',
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[admin-ads-engine] update job failed', updateErr);
      return json(500, { error: 'update_failed' });
    }

    // Create step log entries for all 4 steps
    const steps = ['copy', 'video', 'composite', 'publish'];
    for (const step of steps) {
      const { error: stepErr } = await sb.from('ads_engine_step_logs').insert({
        job_id: jobId,
        step,
        status: step === 'copy' ? 'running' : 'pending',
        input: {},
        output: {},
      });

      if (stepErr) {
        console.error(`[admin-ads-engine] failed to create step log for ${step}`, stepErr);
      }
    }

    await logAdminAction(admin, {
      action: 'ads_engine_pipeline_started',
      payload: { job_id: jobId },
    });

    const jobWithSteps = await buildJobWithSteps(sb, job);
    return json(200, { ok: true, job: jobWithSteps } as JobResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleStartPipeline error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handleAdvanceStep(sb: any, admin: any, body: any): Promise<any> {
  const { jobId, step, output } = body;

  if (!jobId || !step) {
    return json(400, { error: 'missing_job_id_or_step' });
  }

  try {
    // Mark current step as completed
    const { error: completeErr } = await sb
      .from('ads_engine_step_logs')
      .update({
        status: 'completed',
        output: output || {},
        completed_at: new Date().toISOString(),
      })
      .eq('job_id', jobId)
      .eq('step', step);

    if (completeErr) {
      console.error('[admin-ads-engine] failed to mark step completed', completeErr);
      return json(500, { error: 'step_update_failed' });
    }

    // Determine next step
    const stepOrder = ['copy', 'video', 'composite', 'publish'];
    const currentIndex = stepOrder.indexOf(step);
    const nextStep = currentIndex < stepOrder.length - 1 ? stepOrder[currentIndex + 1] : null;

    // Build update object for job
    const jobUpdate: any = {};

    if (step === 'copy' && output?.copy_text) {
      jobUpdate.copy_text = output.copy_text;
    }
    if (step === 'video' && output?.sora_video_url) {
      jobUpdate.sora_video_url = output.sora_video_url;
      jobUpdate.sora_prompt = output.sora_prompt || null;
    }
    if (step === 'composite' && output?.remotion_output_url) {
      jobUpdate.remotion_output_url = output.remotion_output_url;
    }
    if (step === 'publish' && output?.meta_campaign_id) {
      jobUpdate.meta_campaign_id = output.meta_campaign_id;
      jobUpdate.meta_adset_id = output.meta_adset_id || null;
      jobUpdate.meta_ad_id = output.meta_ad_id || null;
      jobUpdate.status = 'completed';
      jobUpdate.completed_at = new Date().toISOString();
    } else if (nextStep) {
      jobUpdate.current_step = nextStep;
    }

    // Mark next step as running if it exists
    if (nextStep) {
      await sb
        .from('ads_engine_step_logs')
        .update({ status: 'running' })
        .eq('job_id', jobId)
        .eq('step', nextStep);
    }

    // Update job
    const { data: job, error: jobErr } = await sb
      .from('ads_engine_jobs')
      .update(jobUpdate)
      .eq('id', jobId)
      .select('*')
      .single();

    if (jobErr) {
      console.error('[admin-ads-engine] failed to update job', jobErr);
      return json(500, { error: 'job_update_failed' });
    }

    await logAdminAction(admin, {
      action: 'ads_engine_step_advanced',
      payload: { job_id: jobId, step, next_step: nextStep },
    });

    const jobWithSteps = await buildJobWithSteps(sb, job);
    return json(200, { ok: true, job: jobWithSteps } as JobResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleAdvanceStep error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handleFailStep(sb: any, admin: any, body: any): Promise<any> {
  const { jobId, step, error: errorMsg } = body;

  if (!jobId || !step || !errorMsg) {
    return json(400, { error: 'missing_required_fields' });
  }

  try {
    // Mark step as failed
    const { error: stepErr } = await sb
      .from('ads_engine_step_logs')
      .update({
        status: 'failed',
        error: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq('job_id', jobId)
      .eq('step', step);

    if (stepErr) {
      console.error('[admin-ads-engine] failed to mark step failed', stepErr);
      return json(500, { error: 'step_update_failed' });
    }

    // Update job status
    const { error: jobErr } = await sb
      .from('ads_engine_jobs')
      .update({
        status: 'failed',
        error_log: errorMsg,
      })
      .eq('id', jobId);

    if (jobErr) {
      console.error('[admin-ads-engine] failed to update job', jobErr);
      return json(500, { error: 'job_update_failed' });
    }

    await logAdminAction(admin, {
      action: 'ads_engine_step_failed',
      payload: { job_id: jobId, step, error: errorMsg },
    });

    return json(200, { ok: true } as JobResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleFailStep error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function handleRetryStep(sb: any, admin: any, body: any): Promise<any> {
  const { jobId, step } = body;

  if (!jobId || !step) {
    return json(400, { error: 'missing_job_id_or_step' });
  }

  try {
    // Reset step to running
    const { error: stepErr } = await sb
      .from('ads_engine_step_logs')
      .update({
        status: 'running',
        error: null,
        completed_at: null,
      })
      .eq('job_id', jobId)
      .eq('step', step);

    if (stepErr) {
      console.error('[admin-ads-engine] failed to reset step', stepErr);
      return json(500, { error: 'step_update_failed' });
    }

    // Update job status back to running
    const { data: job, error: jobErr } = await sb
      .from('ads_engine_jobs')
      .update({
        status: 'running',
        current_step: step,
      })
      .eq('id', jobId)
      .select('*')
      .single();

    if (jobErr) {
      console.error('[admin-ads-engine] failed to update job', jobErr);
      return json(500, { error: 'job_update_failed' });
    }

    await logAdminAction(admin, {
      action: 'ads_engine_step_retried',
      payload: { job_id: jobId, step },
    });

    const jobWithSteps = await buildJobWithSteps(sb, job);
    return json(200, { ok: true, job: jobWithSteps } as JobResponse);
  } catch (err) {
    console.error('[admin-ads-engine] handleRetryStep error', err);
    return json(500, { error: 'internal_server_error' });
  }
}

async function buildJobWithSteps(sb: any, job: any): Promise<AdsEngineJob> {
  const { data: steps, error: stepsErr } = await sb
    .from('ads_engine_step_logs')
    .select('step, status, duration_ms, error, created_at')
    .eq('job_id', job.id)
    .order('created_at', { ascending: true });

  if (stepsErr) {
    console.error(`[admin-ads-engine] steps query failed for job ${job.id}`, stepsErr);
  }

  return {
    id: job.id,
    artist_name: job.artist_name,
    song_title: job.song_title,
    status: job.status,
    current_step: job.current_step,
    pipeline: job.pipeline,
    copy_text: job.copy_text,
    sora_video_url: job.sora_video_url,
    remotion_output_url: job.remotion_output_url,
    meta_campaign_id: job.meta_campaign_id,
    platform: job.platform,
    created_at: job.created_at,
    updated_at: job.updated_at,
    steps: (steps || []).map((s: any) => ({
      step: s.step,
      status: s.status,
      duration_ms: s.duration_ms,
      error: s.error,
      created_at: s.created_at,
    })),
  };
}
