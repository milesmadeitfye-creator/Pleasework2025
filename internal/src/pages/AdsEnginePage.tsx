import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Zap,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Video,
  Type,
  Film,
  Send,
  Plus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

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

const PIPELINE_STEPS = ['copy', 'video', 'composite', 'publish'];
const STEP_LABELS: Record<string, { label: string; icon: any }> = {
  copy: { label: 'Copy', icon: Type },
  video: { label: 'Video', icon: Video },
  composite: { label: 'Composite', icon: Film },
  publish: { label: 'Publish', icon: Send },
};

export default function AdsEnginePage() {
  const [jobs, setJobs] = useState<AdsEngineJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    artist_name: '',
    song_title: '',
    song_url: '',
    cover_art_url: '',
    target_audience: '',
    budget_dollars: '',
  });

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await api<ListResponse>('/.netlify/functions/admin-ads-engine');
      setJobs(res.jobs ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load ads engine jobs.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.artist_name || !formData.song_title) {
      setError('Artist name and song title are required.');
      return;
    }

    try {
      setSubmitting(true);
      const budget_cents = formData.budget_dollars
        ? Math.round(parseFloat(formData.budget_dollars) * 100)
        : 0;

      await api('/.netlify/functions/admin-ads-engine', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create-job',
          artist_name: formData.artist_name,
          song_title: formData.song_title,
          song_url: formData.song_url || undefined,
          cover_art_url: formData.cover_art_url || undefined,
          target_audience: formData.target_audience || undefined,
          budget_cents: budget_cents || undefined,
        }),
      });

      setFormData({
        artist_name: '',
        song_title: '',
        song_url: '',
        cover_art_url: '',
        target_audience: '',
        budget_dollars: '',
      });
      setShowCreateModal(false);
      await loadJobs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create job.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartPipeline = async (jobId: string) => {
    try {
      await api('/.netlify/functions/admin-ads-engine', {
        method: 'POST',
        body: JSON.stringify({
          action: 'start-pipeline',
          jobId,
        }),
      });
      await loadJobs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to start pipeline.'
      );
    }
  };

  const handleAdvanceStep = async (jobId: string) => {
    try {
      const job = jobs?.find(j => j.id === jobId);
      if (!job) return;

      await api('/.netlify/functions/admin-ads-engine', {
        method: 'POST',
        body: JSON.stringify({
          action: 'advance-step',
          jobId,
          step: job.current_step,
          output: {
            copy_text: job.current_step === 'copy' ? `Sample ad copy for ${job.artist_name} - ${job.song_title}` : undefined,
            sora_video_url: job.current_step === 'video' ? 'https://example.com/video.mp4' : undefined,
            sora_prompt: job.current_step === 'video' ? `Create a music video for ${job.song_title}` : undefined,
            remotion_output_url: job.current_step === 'composite' ? 'https://example.com/composite.mp4' : undefined,
            meta_campaign_id: job.current_step === 'publish' ? `campaign_${jobId.slice(0, 8)}` : undefined,
          },
        }),
      });
      await loadJobs();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to advance step.'
      );
    }
  };

  const stats = {
    total: jobs?.length ?? 0,
    running: (jobs ?? []).filter(j => j.status === 'running').length,
    completed: (jobs ?? []).filter(j => j.status === 'completed').length,
    failed: (jobs ?? []).filter(j => j.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ads engine...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-brand-600" />
            Ads Engine Pipeline
          </h1>
          <p className="text-xs text-fg-mute mt-1">
            Input (song/artist) → Claude writes ad copy → Sora 2 Pro generates video → Remotion composites → publish to Meta (FB + IG)
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Stats */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={stats.total} icon={Zap} />
        <StatCard label="Running" value={stats.running} icon={Loader2} color="text-brand-600" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-ok" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} color="text-err" />
      </section>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ink-0 rounded-xl border border-line p-6 shadow-xl max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">New Ad Campaign</h2>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Artist Name *
                </label>
                <input
                  type="text"
                  value={formData.artist_name}
                  onChange={e =>
                    setFormData({ ...formData, artist_name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="e.g. The Weeknd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Song Title *
                </label>
                <input
                  type="text"
                  value={formData.song_title}
                  onChange={e =>
                    setFormData({ ...formData, song_title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="e.g. Blinding Lights"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Song URL
                </label>
                <input
                  type="url"
                  value={formData.song_url}
                  onChange={e =>
                    setFormData({ ...formData, song_url: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Cover Art URL
                </label>
                <input
                  type="url"
                  value={formData.cover_art_url}
                  onChange={e =>
                    setFormData({ ...formData, cover_art_url: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={formData.target_audience}
                  onChange={e =>
                    setFormData({ ...formData, target_audience: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="e.g. 18-35 hip hop fans in US"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-fg mb-1">
                  Budget (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.budget_dollars}
                  onChange={e =>
                    setFormData({ ...formData, budget_dollars: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-line bg-ink-1 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                  placeholder="e.g. 500.00"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-3 py-2 rounded-lg border border-line text-fg text-sm font-medium hover:bg-ink-1 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Jobs List */}
      <section className="space-y-4">
        {jobs && jobs.length === 0 ? (
          <div className="rounded-lg border border-line bg-ink-1 p-8 text-center">
            <Zap className="h-8 w-8 text-fg-mute mx-auto mb-2 opacity-50" />
            <p className="text-sm text-fg-mute">No campaigns yet. Create one to get started!</p>
          </div>
        ) : (
          (jobs ?? []).map(job => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedJobId === job.id}
              onToggleExpand={() =>
                setExpandedJobId(expandedJobId === job.id ? null : job.id)
              }
              onStartPipeline={() => handleStartPipeline(job.id)}
              onAdvanceStep={() => handleAdvanceStep(job.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-fg-mute',
}: {
  label: string;
  value: number;
  icon: any;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
      <div className="flex items-center gap-2 text-[11px] mb-2">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="uppercase tracking-wider text-fg-mute">{label}</span>
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
        {(value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}

function JobCard({
  job,
  expanded,
  onToggleExpand,
  onStartPipeline,
  onAdvanceStep,
}: {
  job: AdsEngineJob;
  expanded: boolean;
  onToggleExpand: () => void;
  onStartPipeline: () => void;
  onAdvanceStep: () => void;
}) {
  const statusColor =
    job.status === 'completed'
      ? 'bg-ok/10 border-ok/30 text-ok'
      : job.status === 'failed'
        ? 'bg-err/10 border-err/30 text-err'
        : job.status === 'running'
          ? 'bg-brand-600/10 border-brand-600/30 text-brand-600'
          : 'bg-fg-mute/10 border-fg-mute/30 text-fg-mute';

  return (
    <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-fg truncate">
            {job.artist_name} — {job.song_title}
          </h3>
          <p className="text-xs text-fg-mute mt-0.5">
            Created {new Date(job.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
          </span>
          <button
            onClick={onToggleExpand}
            className="text-fg-mute hover:text-fg transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <PipelineVisualizer job={job} />

      {/* Action Buttons */}
      <div className="flex gap-3 mt-6">
        {job.status === 'draft' && (
          <button
            onClick={onStartPipeline}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            Start Pipeline
          </button>
        )}
        {job.status === 'running' && (
          <button
            onClick={onAdvanceStep}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            Advance Step
          </button>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-6 pt-6 border-t border-line space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {job.copy_text && (
              <div>
                <h4 className="text-xs font-semibold text-fg-mute uppercase mb-2">
                  Ad Copy
                </h4>
                <p className="text-sm text-fg-soft bg-ink-2 p-3 rounded border border-line/50 max-h-24 overflow-y-auto">
                  {job.copy_text}
                </p>
              </div>
            )}
            {job.sora_video_url && (
              <div>
                <h4 className="text-xs font-semibold text-fg-mute uppercase mb-2">
                  Video URL
                </h4>
                <a
                  href={job.sora_video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:text-brand-700 break-all"
                >
                  {job.sora_video_url}
                </a>
              </div>
            )}
            {job.remotion_output_url && (
              <div>
                <h4 className="text-xs font-semibold text-fg-mute uppercase mb-2">
                  Composite URL
                </h4>
                <a
                  href={job.remotion_output_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:text-brand-700 break-all"
                >
                  {job.remotion_output_url}
                </a>
              </div>
            )}
            {job.meta_campaign_id && (
              <div>
                <h4 className="text-xs font-semibold text-fg-mute uppercase mb-2">
                  Campaign ID
                </h4>
                <p className="text-xs font-mono text-fg-soft bg-ink-2 p-2 rounded border border-line/50">
                  {job.meta_campaign_id}
                </p>
              </div>
            )}
          </div>

          {/* Step Logs */}
          {(job.steps ?? []).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-fg-mute uppercase mb-3">
                Step Details
              </h4>
              <div className="space-y-2">
                {(job.steps ?? []).map((step, idx) => (
                  <StepLogRow key={idx} step={step} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineVisualizer({ job }: { job: AdsEngineJob }) {
  return (
    <div className="flex items-center justify-between py-4 px-2">
      {PIPELINE_STEPS.map((stepName, idx) => {
        const step = (job.steps ?? []).find(s => s.step === stepName);
        const stepConfig = STEP_LABELS[stepName];
        const Icon = stepConfig.icon;

        let stepStatus = 'pending';
        let borderColor = 'border-line';
        let bgColor = 'bg-ink-2';

        if (step) {
          stepStatus = step.status;
          if (step.status === 'completed') {
            borderColor = 'border-ok';
            bgColor = 'bg-ok/10';
          } else if (step.status === 'running') {
            borderColor = 'border-brand-600';
            bgColor = 'bg-brand-600/10';
          } else if (step.status === 'failed') {
            borderColor = 'border-err';
            bgColor = 'bg-err/10';
          }
        }

        return (
          <div key={stepName} className="flex items-center flex-1">
            <div className="relative">
              <div
                className={`h-12 w-12 rounded-full border-2 ${borderColor} ${bgColor} flex items-center justify-center flex-shrink-0`}
              >
                {stepStatus === 'completed' ? (
                  <CheckCircle2 className="h-6 w-6 text-ok" />
                ) : stepStatus === 'running' ? (
                  <Icon className="h-6 w-6 text-brand-600 animate-pulse" />
                ) : stepStatus === 'failed' ? (
                  <XCircle className="h-6 w-6 text-err" />
                ) : (
                  <Icon className="h-6 w-6 text-fg-mute opacity-50" />
                )}
              </div>
              <div className="text-center mt-2">
                <p className="text-xs font-medium text-fg">{stepConfig.label}</p>
                <p className="text-[10px] text-fg-mute mt-0.5">
                  {stepStatus.charAt(0).toUpperCase() + stepStatus.slice(1)}
                </p>
              </div>
            </div>

            {idx < PIPELINE_STEPS.length - 1 && (
              <div className="flex-1 h-1 mx-2 bg-line rounded-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepLogRow({ step }: { step: StepLog }) {
  const statusColor =
    step.status === 'completed'
      ? 'text-ok'
      : step.status === 'failed'
        ? 'text-err'
        : step.status === 'running'
          ? 'text-brand-600'
          : 'text-fg-mute';

  return (
    <div className="bg-ink-2 p-3 rounded border border-line/50 flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg capitalize">{step.step}</span>
          <span className={`text-xs font-medium ${statusColor}`}>
            {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
          </span>
        </div>
        {step.error && (
          <p className="text-xs text-err mt-1">Error: {step.error}</p>
        )}
      </div>
      {step.duration_ms !== null && (
        <span className="text-xs text-fg-mute whitespace-nowrap flex-shrink-0">
          {(step.duration_ms / 1000).toFixed(2)}s
        </span>
      )}
    </div>
  );
}
