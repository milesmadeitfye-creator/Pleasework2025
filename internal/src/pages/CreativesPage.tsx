import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  AlertTriangle,
  Image,
  Music,
  Video,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface MediaAsset {
  id: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  createdAt: string;
  userId: string;
}

interface AIJob {
  id: string;
  jobType: 'cover_art' | 'music_visual';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userId: string;
  createdAt: string;
  completedAt: string | null;
  vibe?: string;
}

interface CreativesData {
  ok: true;
  mediaOverview: {
    totalImages: number;
    totalAudio: number;
    totalVideo: number;
  };
  aiCoverArtJobs: AIJob[];
  aiMusicVisualJobs: AIJob[];
  recentUploads: MediaAsset[];
}

export default function CreativesPage() {
  const [data, setData] = useState<CreativesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<CreativesData>('/.netlify/functions/admin-creatives');
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load creatives data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="rounded-lg border border-line bg-ink-1 p-6 text-center text-sm text-fg-mute">
          Loading creatives data...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">AI Creative Pipeline</h1>
        <p className="text-xs text-fg-mute">
          Media assets, cover art jobs, music visuals, and recent uploads.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-line bg-ink-1 p-4 text-sm text-err flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Image className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Images</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {data.mediaOverview.totalImages}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Music className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Audio Files</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {data.mediaOverview.totalAudio}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Video className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Videos</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {data.mediaOverview.totalVideo}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">AI Cover Art Jobs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Job ID</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">User</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Created</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiCoverArtJobs.length > 0 ? (
                    data.aiCoverArtJobs.map((job) => (
                      <tr key={job.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {job.id.slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 text-fg-soft">
                          {job.userId.slice(0, 12)}...
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft">
                          {relTime(job.createdAt)}
                        </td>
                        <td className="py-2 px-3">
                          <StatusChip status={job.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-fg-mute">
                        No cover art jobs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Music Visual Jobs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Job ID</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">User</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Vibe</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Created</th>
                    <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiMusicVisualJobs.length > 0 ? (
                    data.aiMusicVisualJobs.map((job) => (
                      <tr key={job.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {job.id.slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 text-fg-soft">
                          {job.userId.slice(0, 12)}...
                        </td>
                        <td className="py-2 px-3 text-fg-soft text-xs">
                          {job.vibe || '—'}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft">
                          {relTime(job.createdAt)}
                        </td>
                        <td className="py-2 px-3">
                          <StatusChip status={job.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-fg-mute">
                        No music visual jobs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {data.recentUploads.length > 0 && (
            <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <h2 className="text-sm font-semibold mb-4">Recent Uploads</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {data.recentUploads.map((asset) => (
                  <div key={asset.id} className="aspect-square rounded border border-line/50 bg-ink-2 overflow-hidden flex items-center justify-center">
                    {asset.type === 'image' && <Image className="h-8 w-8 text-fg-mute" />}
                    {asset.type === 'audio' && <Music className="h-8 w-8 text-fg-mute" />}
                    {asset.type === 'video' && <Video className="h-8 w-8 text-fg-mute" />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const config = {
    pending: { className: 'text-fg-soft bg-fg-soft/10', icon: Clock },
    processing: { className: 'text-warn bg-warn/10', icon: Clock },
    completed: { className: 'text-ok bg-ok/10', icon: CheckCircle2 },
    failed: { className: 'text-err bg-err/10', icon: XCircle },
  } as const;

  const cfg = config[status as keyof typeof config] || config.pending;
  const Icon = cfg.icon;

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded inline-flex items-center gap-1 ${cfg.className}`}>
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
