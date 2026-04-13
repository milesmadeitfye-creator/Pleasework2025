import { useEffect, useRef, useState } from 'react';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  jobId?: string;
  timestamp: Date;
}

const PIPELINE_STEPS = ['copy', 'video', 'composite', 'publish'];
const STEP_LABELS: Record<string, { label: string; icon: any; desc: string }> = {
  copy: { label: 'Copy', icon: Type, desc: 'Claude writes ad copy' },
  video: { label: 'Video', icon: Video, desc: 'Sora 2 Pro generates video' },
  composite: { label: 'Composite', icon: Film, desc: 'Remotion composites final' },
  publish: { label: 'Publish', icon: Send, desc: 'Push to Meta (FB + IG)' },
};

const SUGGESTIONS = [
  'Run an ad for Drake - God\'s Plan targeting 18-30 hip hop fans, $500 budget',
  'Create a campaign for SZA - Kill Bill, $200, targeting R&B listeners 21-35',
  'Launch ads for Travis Scott - FE!N, $1000 budget, 18-25 rap fans in US',
];

export default function AdsEnginePage() {
  const [jobs, setJobs] = useState<AdsEngineJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'What are we running today? Give me the artist, song, audience, and budget — I\'ll handle the rest.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

  const handleStartPipeline = async (jobId: string) => {
    try {
      await api('/.netlify/functions/admin-ads-engine', {
        method: 'POST',
        body: JSON.stringify({ action: 'start-pipeline', jobId }),
      });
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start.');
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
            copy_text: job.current_step === 'copy' ? `🔥 New heat from ${job.artist_name}. Stream "${job.song_title}" now. Link in bio.` : undefined,
            sora_video_url: job.current_step === 'video' ? 'https://sora.ghoste.one/output/generated.mp4' : undefined,
            remotion_output_url: job.current_step === 'composite' ? 'https://cdn.ghoste.one/ads/final-composite.mp4' : undefined,
            meta_campaign_id: job.current_step === 'publish' ? `meta_${jobId.slice(0, 8)}` : undefined,
          },
        }),
      });
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance.');
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
      <header>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Zap className="h-6 w-6 text-brand-600" />
          Ghoste AI Ads Engine
        </h1>
        <p className="text-xs text-fg-mute mt-1">
          Claude × Sora 2 Pro × Remotion × Meta — just tell me what to run.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Claude Chat Interface */}
      <section className="rounded-lg border border-line bg-ink-1 shadow-card overflow-hidden">
        <div className="border-b border-line px-4 py-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-medium">Ads Engine AI</span>
          <span className="text-[10px] text-fg-mute ml-1">Powered by Claude</span>
        </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto px-4 py-4 space-y-4 bg-ink-0/50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
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
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.jobId && (
                  <button
                    onClick={() => setExpandedJobId(msg.jobId!)}
                    className="mt-2 text-xs text-brand-500 hover:text-brand-400 underline"
                  >
                    View pipeline →
                  </button>
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
                {s.length > 60 ? s.slice(0, 57) + '...' : s}
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
            placeholder='e.g. "Run an ad for Lil Uzi - XO Tour Llif3, $300 budget, 18-25 hip hop fans"'
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
        <StatCard label="Total Jobs" value={stats.total} icon={Zap} />
        <StatCard label="Running" value={stats.running} icon={Loader2} color="text-brand-600" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-ok" />
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
                onToggleExpand={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                onStartPipeline={() => handleStartPipeline(job.id)}
                onAdvanceStep={() => handleAdvanceStep(job.id)}
              />
            ))
          )}
        </section>
      )}
    </div>
  );
}

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

function JobCard({ job, expanded, onToggleExpand, onStartPipeline, onAdvanceStep }: {
  job: AdsEngineJob; expanded: boolean; onToggleExpand: () => void; onStartPipeline: () => void; onAdvanceStep: () => void;
}) {
  const statusColor =
    job.status === 'completed' ? 'bg-ok/10 border-ok/30 text-ok'
    : job.status === 'failed' ? 'bg-err/10 border-err/30 text-err'
    : job.status === 'running' ? 'bg-brand-600/10 border-brand-600/30 text-brand-600'
    : 'bg-fg-mute/10 border-fg-mute/30 text-fg-mute';

  return (
    <div className="rounded-lg border border-line bg-ink-1 p-5 shadow-card">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-fg truncate">{job.artist_name} — {job.song_title}</h3>
          <p className="text-xs text-fg-mute mt-0.5">Created {new Date(job.created_at).toLocaleDateString()}</p>
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

      <PipelineVisualizer job={job} />

      <div className="flex gap-2 mt-4">
        {job.status === 'draft' && (
          <button onClick={onStartPipeline} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
            <Play className="h-3.5 w-3.5" /> Start Pipeline
          </button>
        )}
        {job.status === 'running' && (
          <button onClick={onAdvanceStep} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
            <Play className="h-3.5 w-3.5" /> Advance Step
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-5 pt-5 border-t border-line space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {job.copy_text && (
              <div>
                <h4 className="text-[10px] font-semibold text-fg-mute uppercase mb-1">Ad Copy</h4>
                <p className="text-xs text-fg-soft bg-ink-2 p-2.5 rounded border border-line/50">{job.copy_text}</p>
              </div>
            )}
            {job.sora_video_url && (
              <div>
                <h4 className="text-[10px] font-semibold text-fg-mute uppercase mb-1">Video</h4>
                <p className="text-xs text-brand-500 bg-ink-2 p-2.5 rounded border border-line/50 break-all">{job.sora_video_url}</p>
              </div>
            )}
            {job.remotion_output_url && (
              <div>
                <h4 className="text-[10px] font-semibold text-fg-mute uppercase mb-1">Composite</h4>
                <p className="text-xs text-brand-500 bg-ink-2 p-2.5 rounded border border-line/50 break-all">{job.remotion_output_url}</p>
              </div>
            )}
            {job.meta_campaign_id && (
              <div>
                <h4 className="text-[10px] font-semibold text-fg-mute uppercase mb-1">Meta Campaign</h4>
                <p className="text-xs font-mono text-fg-soft bg-ink-2 p-2.5 rounded border border-line/50">{job.meta_campaign_id}</p>
              </div>
            )}
          </div>
          {(job.steps ?? []).length > 0 && (
            <div className="space-y-1.5">
              {(job.steps ?? []).map((step, i) => {
                const sc = step.status === 'completed' ? 'text-ok' : step.status === 'failed' ? 'text-err' : step.status === 'running' ? 'text-brand-600' : 'text-fg-mute';
                return (
                  <div key={i} className="bg-ink-2 p-2.5 rounded border border-line/50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-fg capitalize">{step.step}</span>
                      <span className={`font-medium ${sc}`}>{step.status}</span>
                    </div>
                    {step.duration_ms != null && <span className="text-fg-mute">{(step.duration_ms / 1000).toFixed(1)}s</span>}
                    {step.error && <span className="text-err ml-2 truncate max-w-[200px]">{step.error}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
          else if (step.status === 'running') { ring = 'border-brand-600'; bg = 'bg-brand-600/10'; }
          else if (step.status === 'failed') { ring = 'border-err'; bg = 'bg-err/10'; }
        }

        return (
          <div key={stepName} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`h-10 w-10 rounded-full border-2 ${ring} ${bg} flex items-center justify-center`}>
                {stepStatus === 'completed' ? <CheckCircle2 className="h-5 w-5 text-ok" />
                  : stepStatus === 'running' ? <Icon className="h-5 w-5 text-brand-600 animate-pulse" />
                  : stepStatus === 'failed' ? <XCircle className="h-5 w-5 text-err" />
                  : <Icon className="h-5 w-5 text-fg-mute opacity-40" />}
              </div>
              <span className="text-[10px] text-fg-soft mt-1.5 font-medium">{cfg.label}</span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 rounded-full ${
                step?.status === 'completed' ? 'bg-ok/50' : 'bg-line'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
