import { useCallback, useEffect, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronUp,
  Bot,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Rocket,
  Eye,
  Globe,
  RotateCcw,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  pipeline: Record<string, any> | null;
  copy_text: string | null;
  copy_variants: any[] | null;
  sora_video_url: string | null;
  sora_prompt: string | null;
  remotion_output_url: string | null;
  meta_campaign_id: string | null;
  platform: string;
  budget_cents: number | null;
  target_audience: string | null;
  created_at: string;
  updated_at: string;
  steps: StepLog[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  jobId?: string;
  timestamp: Date;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PIPELINE_STEPS = ['copy', 'video', 'composite', 'publish'];

const STEP_LABELS: Record<string, { label: string; icon: any; desc: string }> = {
  copy: { label: 'Ad Copy', icon: Type, desc: 'Claude generates ad copy variants' },
  video: { label: 'Sora Video', icon: Video, desc: 'Sora 2 Pro generates UGC video' },
  composite: { label: 'Remotion', icon: Film, desc: 'Remotion composites final ad' },
  publish: { label: 'Publish', icon: Globe, desc: 'Push to Meta + Google Ads' },
};

const SUGGESTIONS = [
  'Launch an awareness campaign targeting young hip hop artists, $500 budget',
  'Run a conversion campaign for serious independents, $300, full funnel',
  'Create a retargeting campaign for trial users, $200 budget, IG reels + stories',
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdsEnginePage() {
  const [jobs, setJobs] = useState<AdsEngineJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [executingJobId, setExecutingJobId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "What campaign are we running? Give me the audience, funnel stage, and budget — I'll generate copy, create Sora video prompts, build Remotion compositions, and push to Meta + Google Ads.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Poll for async step completion
  useEffect(() => {
    const hasProcessing = (jobs ?? []).some(j =>
      j.status === 'running' && j.steps?.some(s => s.status === 'processing')
    );
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        const processingJob = (jobs ?? []).find(j =>
          j.status === 'running' && j.steps?.some(s => s.status === 'processing')
        );
        if (processingJob) {
          pollAsyncStep(processingJob.id, processingJob.current_step);
        }
      }, 5000);
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [jobs]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const res = await api<{ jobs: AdsEngineJob[] }>('/.netlify/functions/admin-ads-engine');
      setJobs(res?.jobs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api<{
        ok: boolean;
        type: string;
        message: string;
        job?: { id: string; artist_name: string; song_title: string; status: string };
        ad_copies?: any[];
        sora_prompt?: string;
        remotion_spec?: any;
        meta_targeting?: any;
        auto_started?: boolean;
      }>('/.netlify/functions/admin-ads-engine-chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: text, autoStart: true }),
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res?.message || 'Campaign created.',
        jobId: res?.job?.id,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Refresh jobs list
      await loadJobs();

      // Auto-execute pipeline if job was created and auto-started
      if (res?.job?.id && res?.auto_started) {
        executeFullPipeline(res.job.id);
      }
    } catch (err) {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const executeFullPipeline = async (jobId: string) => {
    setExecutingJobId(jobId);
    try {
      await api('/.netlify/functions/admin-ads-engine-execute', {
        method: 'POST',
        body: JSON.stringify({ action: 'execute-all', jobId }),
      });
      await loadJobs();
    } catch (err) {
      console.error('Pipeline execution error:', err);
    } finally {
      setExecutingJobId(null);
      await loadJobs();
    }
  };

  const executeStep = async (jobId: string, step: string) => {
    setExecutingJobId(jobId);
    try {
      await api('/.netlify/functions/admin-ads-engine-execute', {
        method: 'POST',
        body: JSON.stringify({ action: 'execute-step', jobId, step }),
      });
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Step execution failed.');
    } finally {
      setExecutingJobId(null);
    }
  };

  const pollAsyncStep = async (jobId: string, step: string) => {
    try {
      const res = await api<{ status: string }>('/.netlify/functions/admin-ads-engine-execute', {
        method: 'POST',
        body: JSON.stringify({ action: 'poll-step', jobId, step }),
      });
      if (res?.status === 'completed') {
        await loadJobs();
        // Continue execution
        const job = (jobs ?? []).find(j => j.id === jobId);
        if (job) {
          const nextIdx = PIPELINE_STEPS.indexOf(step) + 1;
          if (nextIdx < PIPELINE_STEPS.length) {
            executeStep(jobId, PIPELINE_STEPS[nextIdx]);
          }
        }
      }
    } catch (err) {
      console.error('Poll error:', err);
    }
  };

  const retryStep = async (jobId: string, step: string) => {
    try {
      await api('/.netlify/functions/admin-ads-engine', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry-step', jobId, step }),
      });
      await loadJobs();
      // Re-execute the step
      executeStep(jobId, step);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
    }
  };

  const stats = {
    total: jobs?.length ?? 0,
    running: (jobs ?? []).filter(j => j.status === 'running').length,
    completed: (jobs ?? []).filter(j => j.status === 'completed').length,
    failed: (jobs ?? []).filter(j => j.status === 'failed').length,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-brand-600" />
            Ghoste AI Ads Engine
          </h1>
          <p className="text-xs text-fg-mute mt-1">
            Claude x Sora 2 Pro x Remotion x Meta + Google Ads — full pipeline, one prompt.
          </p>
        </div>
        <button
          onClick={loadJobs}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-ink-1 text-xs text-fg-soft hover:bg-ink-2 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">dismiss</button>
        </div>
      )}

      {/* Claude Chat Interface */}
      <section className="rounded-lg border border-line bg-ink-1 shadow-card overflow-hidden">
        <div className="border-b border-line px-4 py-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium">Ads Engine AI</span>
          <span className="text-[10px] text-fg-mute ml-1">Powered by Claude</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
            <span className="text-[10px] text-fg-mute">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="h-72 overflow-y-auto px-4 py-4 space-y-4 bg-ink-0/50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-2 border border-line text-fg'
              }`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3 w-3 text-brand-500" />
                    <span className="text-[10px] font-medium text-brand-500">Ghoste AI</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.jobId && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setExpandedJobId(msg.jobId!)}
                      className="text-xs text-brand-500 hover:text-brand-400 underline flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" /> View pipeline
                    </button>
                    {executingJobId === msg.jobId ? (
                      <span className="text-xs text-fg-mute flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Executing...
                      </span>
                    ) : (
                      <button
                        onClick={() => executeFullPipeline(msg.jobId!)}
                        className="text-xs text-ok hover:text-ok/80 underline flex items-center gap-1"
                      >
                        <Rocket className="h-3 w-3" /> Run full pipeline
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-ink-2 border border-line rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                <span className="text-sm text-fg-mute">Building your campaign...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="px-4 py-2 border-t border-line/50 bg-ink-0/30 flex gap-2 overflow-x-auto">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="flex-shrink-0 text-[11px] text-fg-mute hover:text-fg bg-ink-2 hover:bg-ink-3 border border-line/50 rounded-full px-3 py-1.5 transition-colors"
              >
                {s.length > 65 ? s.slice(0, 62) + '...' : s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-line px-4 py-3 flex gap-3 items-center bg-ink-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder='e.g. "Launch awareness campaign for young artists, $500, IG reels"'
            className="flex-1 bg-ink-2 border border-line rounded-lg px-4 py-2.5 text-sm text-fg placeholder:text-fg-mute outline-none focus:border-brand-600 transition-colors"
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Campaigns" value={stats.total} icon={Zap} />
        <StatCard label="Running" value={stats.running} icon={Loader2} color="text-brand-600" />
        <StatCard label="Published" value={stats.completed} icon={CheckCircle2} color="text-ok" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} color="text-err" />
      </section>

      {/* Jobs List */}
      {loading ? (
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading pipeline jobs...
        </div>
      ) : (
        <section className="space-y-4">
          {(jobs ?? []).length === 0 ? (
            <div className="rounded-lg border border-line bg-ink-1 p-8 text-center">
              <Zap className="h-8 w-8 text-fg-mute mx-auto mb-2 opacity-50" />
              <p className="text-sm text-fg-mute">No campaigns yet. Type above to create one.</p>
            </div>
          ) : (
            (jobs ?? []).map(job => (
              <JobCard
                key={job.id}
                job={job}
                expanded={expandedJobId === job.id}
                executing={executingJobId === job.id}
                onToggleExpand={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                onExecuteAll={() => executeFullPipeline(job.id)}
                onExecuteStep={(step) => executeStep(job.id, step)}
                onRetryStep={(step) => retryStep(job.id, step)}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color = 'text-fg-mute' }: { label: string; value: number; icon: any; color?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 p-4 shadow-card">
      <div className="flex items-center gap-2 text-[11px] mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="uppercase tracking-wider text-fg-mute">{label}</span>
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-fg">{(value ?? 0).toLocaleString()}</p>
    </div>
  );
}

// ─── Job Card ───────────────────────────────────────────────────────────────

function JobCard({ job, expanded, executing, onToggleExpand, onExecuteAll, onExecuteStep, onRetryStep }: {
  job: AdsEngineJob;
  expanded: boolean;
  executing: boolean;
  onToggleExpand: () => void;
  onExecuteAll: () => void;
  onExecuteStep: (step: string) => void;
  onRetryStep: (step: string) => void;
}) {
  const pipeline = job.pipeline || {};
  const statusColor =
    job.status === 'completed' ? 'bg-ok/10 border-ok/30 text-ok'
    : job.status === 'failed' ? 'bg-err/10 border-err/30 text-err'
    : job.status === 'running' ? 'bg-brand-600/10 border-brand-600/30 text-brand-600'
    : 'bg-fg-mute/10 border-fg-mute/30 text-fg-mute';

  const funnelStage = pipeline.funnel_stage || 'full_funnel';
  const audience = pipeline.audience_segment || 'broad';

  return (
    <div className="rounded-lg border border-line bg-ink-1 p-5 shadow-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-fg truncate">{job.artist_name} — {job.song_title}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-fg-mute">{new Date(job.created_at).toLocaleDateString()}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-2 border border-line/50 text-fg-mute capitalize">{funnelStage.replace('_', ' ')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-2 border border-line/50 text-fg-mute capitalize">{audience.replace('_', ' ')}</span>
            {job.budget_cents ? (
              <span className="text-[10px] text-fg-mute">${(job.budget_cents / 100).toFixed(0)}/day</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusColor}`}>
            {job.status}
          </span>
          <button onClick={onToggleExpand} className="text-fg-mute hover:text-fg transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Pipeline Visualizer */}
      <PipelineVisualizer job={job} />

      {/* Action Buttons */}
      <div className="flex gap-2 mt-4">
        {(job.status === 'draft' || job.status === 'running') && (
          <button
            onClick={onExecuteAll}
            disabled={executing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {executing ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing...</>
            ) : (
              <><Rocket className="h-3.5 w-3.5" /> Run Full Pipeline</>
            )}
          </button>
        )}
        {job.status === 'failed' && (
          <button
            onClick={() => onRetryStep(job.current_step)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-err/10 border border-err/30 text-err text-xs font-medium hover:bg-err/20"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retry Failed Step
          </button>
        )}

        {/* Publish Links */}
        {pipeline.meta_campaign_id && (
          <a
            href={`https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${pipeline.meta_campaign_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] text-xs font-medium hover:bg-[#1877F2]/20"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Meta Ads Manager
          </a>
        )}
        {pipeline.google_campaign_id && (
          <a
            href={`https://ads.google.com/aw/campaigns?campaignId=${pipeline.google_campaign_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4285F4]/10 border border-[#4285F4]/30 text-[#4285F4] text-xs font-medium hover:bg-[#4285F4]/20"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Google Ads
          </a>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-5 pt-5 border-t border-line space-y-4">
          {/* Ad Copy Variants */}
          {(job.copy_variants || pipeline.ad_copies)?.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2 flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5" /> Ad Copy Variants
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {(job.copy_variants || pipeline.ad_copies || []).map((copy: any, i: number) => (
                  <div key={i} className="bg-ink-2 p-3 rounded-lg border border-line/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-brand-600">Variant {copy.variant || String.fromCharCode(65 + i)}</span>
                      <span className="text-[10px] text-fg-mute capitalize">{copy.placement || 'feed'}</span>
                    </div>
                    <p className="text-xs text-fg font-medium mb-1">{copy.headline}</p>
                    <p className="text-[11px] text-fg-soft leading-relaxed">{copy.primary_text}</p>
                    {copy.cta_button && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded bg-brand-600/10 text-brand-600 text-[10px] font-medium">
                        {copy.cta_button}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sora Video */}
          {(job.sora_video_url || pipeline.sora_prompt) && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2 flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" /> Sora 2 Pro Video
              </h4>
              <div className="bg-ink-2 p-3 rounded-lg border border-line/50">
                {job.sora_video_url && !job.sora_video_url.startsWith('spec://') ? (
                  <div className="space-y-2">
                    <video
                      src={job.sora_video_url}
                      controls
                      className="w-full max-w-md rounded-lg"
                      poster=""
                    />
                    <a
                      href={job.sora_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Open video
                    </a>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] text-fg-mute mb-1">Sora Prompt:</p>
                    <p className="text-[11px] text-fg-soft leading-relaxed italic">
                      {pipeline.sora_prompt || job.sora_prompt}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-fg-mute">
                        {pipeline.sora_aspect_ratio || '9:16'} · {pipeline.sora_duration_seconds || 15}s
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remotion Composite */}
          {(job.remotion_output_url || pipeline.remotion_spec) && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2 flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5" /> Remotion Composite
              </h4>
              <div className="bg-ink-2 p-3 rounded-lg border border-line/50">
                {job.remotion_output_url && !job.remotion_output_url.startsWith('spec://') ? (
                  <div className="space-y-2">
                    <video
                      src={job.remotion_output_url}
                      controls
                      className="w-full max-w-md rounded-lg"
                    />
                    <a
                      href={job.remotion_output_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-500 hover:text-brand-400 flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Open composite
                    </a>
                  </div>
                ) : pipeline.remotion_spec ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-fg-mute">Resolution:</span>
                      <span className="text-[11px] text-fg font-mono">{pipeline.remotion_spec.resolution}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-fg-mute">Hook:</span>
                      <span className="text-[11px] text-fg font-medium">"{pipeline.remotion_spec.hook_text}"</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-fg-mute">Features:</span>
                      <span className="text-[11px] text-fg-soft">
                        {(pipeline.remotion_spec.feature_callouts || []).join(' → ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-fg-mute">CTA:</span>
                      <span className="text-[11px] text-fg font-medium">"{pipeline.remotion_spec.cta_text}"</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-fg-mute">Brand:</span>
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-line/50"
                        style={{ backgroundColor: pipeline.remotion_spec.brand_color || '#1a6cff' }}
                      />
                      <span className="text-[11px] text-fg-soft font-mono">{pipeline.remotion_spec.brand_color}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Meta Targeting */}
          {pipeline.meta_targeting && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Meta Targeting
              </h4>
              <div className="bg-ink-2 p-3 rounded-lg border border-line/50 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-fg-mute">Age:</span>
                  <span className="text-[11px] text-fg">{pipeline.meta_targeting.age_min}-{pipeline.meta_targeting.age_max}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-fg-mute">Locations:</span>
                  <span className="text-[11px] text-fg">{(pipeline.meta_targeting.locations || []).join(', ')}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(pipeline.meta_targeting.interests || []).map((interest: string, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-3 border border-line/50 text-fg-soft">
                      {interest}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(pipeline.meta_targeting.placements || []).map((p: string, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-600/10 border border-brand-600/20 text-brand-600">
                      {p.replace('_', ' ')}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-fg-mute">Optimization:</span>
                  <span className="text-[11px] text-fg font-medium">{pipeline.meta_targeting.optimization_goal}</span>
                </div>
              </div>
            </div>
          )}

          {/* Publish Results */}
          {pipeline.publish_results && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2 flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" /> Publish Results
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Meta Results */}
                <div className="bg-ink-2 p-3 rounded-lg border border-line/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-[#1877F2]">Meta (FB + IG)</span>
                    {pipeline.publish_results.meta?.campaign_id ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                    ) : pipeline.publish_results.meta?.skipped ? (
                      <Clock className="h-3.5 w-3.5 text-fg-mute" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-err" />
                    )}
                  </div>
                  {pipeline.publish_results.meta?.campaign_id ? (
                    <div className="space-y-1 text-[10px]">
                      <p className="text-fg-soft">Campaign: <span className="font-mono text-fg">{pipeline.publish_results.meta.campaign_id}</span></p>
                      <p className="text-fg-soft">Ad Set: <span className="font-mono text-fg">{pipeline.publish_results.meta.adset_id}</span></p>
                      <p className="text-fg-soft">Ad: <span className="font-mono text-fg">{pipeline.publish_results.meta.ad_id}</span></p>
                      <p className="text-warn font-medium mt-1">Status: PAUSED — activate in Ads Manager</p>
                    </div>
                  ) : pipeline.publish_results.meta?.skipped ? (
                    <p className="text-[10px] text-fg-mute">{pipeline.publish_results.meta.reason}</p>
                  ) : (
                    <p className="text-[10px] text-err">{pipeline.publish_results.meta?.error || 'Failed'}</p>
                  )}
                </div>

                {/* Google Results */}
                <div className="bg-ink-2 p-3 rounded-lg border border-line/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-[#4285F4]">Google Ads</span>
                    {pipeline.publish_results.google?.campaign_id ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                    ) : pipeline.publish_results.google?.skipped ? (
                      <Clock className="h-3.5 w-3.5 text-fg-mute" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-err" />
                    )}
                  </div>
                  {pipeline.publish_results.google?.campaign_id ? (
                    <div className="space-y-1 text-[10px]">
                      <p className="text-fg-soft">Campaign: <span className="font-mono text-fg">{pipeline.publish_results.google.campaign_id}</span></p>
                      <p className="text-fg-soft">Ad Group: <span className="font-mono text-fg">{pipeline.publish_results.google.adgroup_id}</span></p>
                      <p className="text-fg-soft">Ad: <span className="font-mono text-fg">{pipeline.publish_results.google.ad_id}</span></p>
                      <p className="text-warn font-medium mt-1">Status: PAUSED — activate in Google Ads</p>
                    </div>
                  ) : pipeline.publish_results.google?.skipped ? (
                    <p className="text-[10px] text-fg-mute">{pipeline.publish_results.google.reason}</p>
                  ) : (
                    <p className="text-[10px] text-err">{pipeline.publish_results.google?.error || 'Failed'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step Logs */}
          {(job.steps ?? []).length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-fg-mute uppercase mb-2">Step Logs</h4>
              <div className="space-y-1.5">
                {(job.steps ?? []).map((step, i) => {
                  const sc = step.status === 'completed' ? 'text-ok'
                    : step.status === 'failed' ? 'text-err'
                    : step.status === 'running' || step.status === 'processing' ? 'text-brand-600'
                    : 'text-fg-mute';
                  return (
                    <div key={i} className="bg-ink-2 p-2.5 rounded border border-line/50 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-fg capitalize">{step.step}</span>
                        <span className={`font-medium ${sc}`}>
                          {step.status === 'processing' ? 'processing...' : step.status}
                        </span>
                        {step.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin text-brand-600" />}
                      </div>
                      <div className="flex items-center gap-2">
                        {step.duration_ms != null && (
                          <span className="text-fg-mute">{(step.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                        {step.error && (
                          <span className="text-err truncate max-w-[200px]">{step.error}</span>
                        )}
                        {step.status === 'failed' && (
                          <button
                            onClick={() => onRetryStep(step.step)}
                            className="text-brand-500 hover:text-brand-400 flex items-center gap-0.5"
                          >
                            <RotateCcw className="h-3 w-3" /> retry
                          </button>
                        )}
                        {(step.status === 'pending' || step.status === 'running') && job.current_step === step.step && (
                          <button
                            onClick={() => onExecuteStep(step.step)}
                            className="text-brand-500 hover:text-brand-400 flex items-center gap-0.5"
                          >
                            <Play className="h-3 w-3" /> execute
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Visualizer ────────────────────────────────────────────────────

function PipelineVisualizer({ job }: { job: AdsEngineJob }) {
  return (
    <div className="flex items-center py-3">
      {PIPELINE_STEPS.map((stepName, idx) => {
        const step = (job.steps ?? []).find(s => s.step === stepName);
        const cfg = STEP_LABELS[stepName];
        const Icon = cfg.icon;

        let stepStatus = 'pending';
        let ring = 'border-line';
        let bg = 'bg-ink-2';

        if (step) {
          stepStatus = step.status;
          if (step.status === 'completed') { ring = 'border-ok'; bg = 'bg-ok/10'; }
          else if (step.status === 'running' || step.status === 'processing') { ring = 'border-brand-600'; bg = 'bg-brand-600/10'; }
          else if (step.status === 'failed') { ring = 'border-err'; bg = 'bg-err/10'; }
        }

        return (
          <div key={stepName} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full border-2 ${ring} ${bg} flex items-center justify-center relative`}>
                {stepStatus === 'completed' ? <CheckCircle2 className="h-5 w-5 text-ok" />
                  : stepStatus === 'running' || stepStatus === 'processing' ? (
                    <>
                      <Icon className="h-5 w-5 text-brand-600 animate-pulse" />
                      {stepStatus === 'processing' && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-brand-600 border-2 border-ink-1 animate-ping" />
                      )}
                    </>
                  )
                  : stepStatus === 'failed' ? <XCircle className="h-5 w-5 text-err" />
                  : <Icon className="h-5 w-5 text-fg-mute opacity-40" />}
              </div>
              <span className="text-[10px] text-fg-soft mt-1.5 font-medium">{cfg.label}</span>
              <span className="text-[8px] text-fg-mute">{cfg.desc}</span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full transition-colors ${
                step?.status === 'completed' ? 'bg-ok/50' : 'bg-line'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
