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
  Loader2,
} from 'lucide-react';

interface RecentUpload {
  id: string;
  user_id: string;
  asset_kind: 'image' | 'audio' | 'video';
  mime_type: string;
  size: number;
  object_path: string;
  created_at: string;
}

interface CreativesData {
  totalAssets: number;
  assetsByKind: {
    image: number;
    audio: number;
    video: number;
  };
  assetsByMimeType: Record<string, number>;
  recentUploads: RecentUpload[];
  coverArtJobs: {
    total: number;
    statusCounts: {
      completed: number;
      failed: number;
      pending: number;
    };
  };
  visualJobs: {
    total: number;
    statusCounts: {
      completed: number;
      processing: number;
      pending: number;
    };
  };
}

export default function CreativesPage() {
  const [data, setData] = useState<CreativesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api<CreativesData>(
          '/.netlify/functions/admin-creatives'
        );
        setData(res);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load creatives data.'
        );
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
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading creatives data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Creative Assets</h1>
        <p className="text-xs text-fg-mute">
          Media assets, cover art jobs, visual generation, and recent uploads.
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
                <span className="uppercase tracking-wider">Total Assets</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {(data?.totalAssets ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Cover Art Jobs</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {(data?.coverArtJobs?.total ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <div className="flex items-center gap-2 text-fg-mute text-[11px] mb-2">
                <Video className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Visual Jobs</span>
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-fg">
                {(data?.visualJobs?.total ?? 0).toLocaleString()}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Assets by Kind</h2>
            <div className="grid grid-cols-3 gap-4">
              {['image', 'audio', 'video'].map((kind) => {
                const count =
                  (data?.assetsByKind as any)?.[kind] ?? 0;
                const total =
                  (data?.assetsByKind?.image ?? 0) +
                  (data?.assetsByKind?.audio ?? 0) +
                  (data?.assetsByKind?.video ?? 0);
                const percent =
                  total > 0 ? ((count / total) * 100).toFixed(1) : '0';

                return (
                  <div key={kind} className="p-4 bg-ink-2 rounded border border-line/50">
                    <p className="text-xs text-fg-mute uppercase tracking-wider capitalize">
                      {kind}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold text-fg">
                      {count.toLocaleString()}
                    </p>
                    <p className="text-xs text-fg-soft mt-1">{percent}% of total</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Cover Art Jobs Status</h2>
            <div className="grid grid-cols-3 gap-4">
              {['completed', 'pending', 'failed'].map((status) => {
                const count =
                  (data?.coverArtJobs?.statusCounts as any)?.[status] ?? 0;

                const colorMap = {
                  completed: 'text-ok bg-ok/10',
                  pending: 'text-warn bg-warn/10',
                  failed: 'text-err bg-err/10',
                };
                const colorClass =
                  colorMap[status as keyof typeof colorMap];

                return (
                  <div
                    key={status}
                    className={`p-4 rounded border ${colorClass} border-line/50`}
                  >
                    <p className="text-xs uppercase tracking-wider font-medium capitalize">
                      {status}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold">
                      {count.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
            <h2 className="text-sm font-semibold mb-4">Visual Jobs Status</h2>
            <div className="grid grid-cols-3 gap-4">
              {['completed', 'processing', 'pending'].map((status) => {
                const count =
                  (data?.visualJobs?.statusCounts as any)?.[status] ?? 0;

                const colorMap = {
                  completed: 'text-ok bg-ok/10',
                  processing: 'text-warn bg-warn/10',
                  pending: 'text-fg-soft bg-fg-soft/10',
                };
                const colorClass =
                  colorMap[status as keyof typeof colorMap];

                return (
                  <div
                    key={status}
                    className={`p-4 rounded border ${colorClass} border-line/50`}
                  >
                    <p className="text-xs uppercase tracking-wider font-medium capitalize">
                      {status === 'processing' ? 'Processing' : status}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold">
                      {count.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {((data?.recentUploads ?? []).length > 0) && (
            <section className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
              <h2 className="text-sm font-semibold mb-4">Recent Uploads</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                        ID
                      </th>
                      <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                        User
                      </th>
                      <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                        Kind
                      </th>
                      <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                        Size
                      </th>
                      <th className="text-left py-2 px-3 text-xs text-fg-mute uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentUploads ?? []).slice(0, 20).map((upload) => (
                      <tr key={upload?.id} className="border-b border-line/50">
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {(upload?.id ?? '').slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-fg-soft">
                          {(upload?.user_id ?? '').slice(0, 8)}...
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft capitalize">
                          {upload?.asset_kind ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-soft">
                          {formatBytes((upload?.size ?? 0))}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg-mute">
                          {new Date(
                            upload?.created_at ?? ''
                          ).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if ((bytes ?? 0) === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log((bytes ?? 0) / k) / Math.log(k));
  return (
    Math.round(((bytes ?? 0) / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  );
}
