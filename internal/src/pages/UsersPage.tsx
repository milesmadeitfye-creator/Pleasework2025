import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MinusCircle,
  PlusCircle,
  Search,
  ShieldOff,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface UserRow {
  userId: string;
  email: string;
  displayName: string | null;
  plan: string | null;
  isPro: boolean;
  credits: number;
  subscriptionStatus: string | null;
  suspended: boolean;
  createdAt: string;
}

interface ListResponse {
  ok: true;
  page: number;
  pageSize: number;
  total: number;
  users: UserRow[];
}

export default function UsersPage() {
  const { identity } = useAdminAuth();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionOn, setActionOn] = useState<UserRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(qDebounced ? { q: qDebounced } : {}),
      });
      const res = await api<ListResponse>(`/.netlify/functions/admin-users-list?${params}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, qDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = useMemo(
    () => (data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1),
    [data],
  );

  const canModify = identity?.role === 'super_admin' || identity?.role === 'admin';

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">User Control Center</h1>
          <p className="text-xs text-fg-mute">
            {data ? `${data.total.toLocaleString()} users` : 'Loading…'}
          </p>
        </div>
        <label className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-mute" />
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search by email…"
            className="input pl-8"
          />
        </label>
      </header>

      {error && (
        <div className="card p-4 text-sm text-err flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="text-right">Credits</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.length ? (
                data.users.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <div className="font-medium text-fg">{u.email}</div>
                      {u.displayName && (
                        <div className="text-[11px] text-fg-mute">{u.displayName}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {u.isPro && <span className="chip text-brand-500 border-brand-500/40">PRO</span>}
                        <span className="text-fg-soft">{u.plan ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      {u.suspended ? (
                        <span className="chip text-err border-err/40">Suspended</span>
                      ) : u.subscriptionStatus ? (
                        <span className="chip capitalize">{u.subscriptionStatus}</span>
                      ) : (
                        <span className="text-fg-mute">—</span>
                      )}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {u.credits.toLocaleString()}
                    </td>
                    <td className="text-fg-mute text-[11px]">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="text-right">
                      <button
                        disabled={!canModify}
                        onClick={() => setActionOn(u)}
                        className="btn text-xs"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-fg-mute">
                    {loading ? 'Loading…' : 'No users found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2">
          <span className="text-[11px] text-fg-mute">
            Page {data?.page ?? 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              className="btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {actionOn && (
        <UserActionModal
          user={actionOn}
          onClose={() => setActionOn(null)}
          onDone={() => {
            setActionOn(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserActionModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState('1000');
  const [planDraft, setPlanDraft] = useState(user.plan ?? '');
  const [confirm, setConfirm] = useState<null | { label: string; run: () => Promise<void> }>(null);

  async function run(type: string, body: Record<string, unknown>) {
    setBusy(type);
    setError(null);
    try {
      await api('/.netlify/functions/admin-users-action', {
        method: 'POST',
        body: JSON.stringify({ type, userId: user.userId, ...body }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div className="w-full max-w-md card p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm font-semibold">{user.email}</div>
          <div className="text-[11px] text-fg-mute">
            {user.plan ?? 'free'} · {user.credits.toLocaleString()} credits
            {user.suspended ? ' · suspended' : ''}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-mute mb-1.5 flex items-center gap-1.5">
              <CreditCard className="h-3 w-3" /> Credits
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="input w-32"
              />
              <button
                onClick={() => run('grant_credits', { amount: Number(grantAmount) })}
                disabled={busy !== null}
                className="btn-primary text-xs"
              >
                <PlusCircle className="h-3.5 w-3.5" /> Grant
              </button>
              <button
                onClick={() =>
                  setConfirm({
                    label: `Revoke ${grantAmount} credits from ${user.email}?`,
                    run: () => run('revoke_credits', { amount: Number(grantAmount) }),
                  })
                }
                disabled={busy !== null}
                className="btn-danger text-xs"
              >
                <MinusCircle className="h-3.5 w-3.5" /> Revoke
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-mute mb-1.5">Plan</div>
            <div className="flex gap-2">
              <input
                value={planDraft}
                onChange={(e) => setPlanDraft(e.target.value)}
                placeholder="e.g. pro, label, free"
                className="input flex-1"
              />
              <button
                onClick={() => run('change_plan', { plan: planDraft })}
                disabled={busy !== null || !planDraft.trim()}
                className="btn-primary text-xs"
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-mute mb-1.5">Access</div>
            {user.suspended ? (
              <button
                onClick={() => run('unsuspend', {})}
                disabled={busy !== null}
                className="btn text-xs w-full justify-center"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Reinstate user
              </button>
            ) : (
              <button
                onClick={() =>
                  setConfirm({
                    label: `Suspend ${user.email}? They will lose access immediately.`,
                    run: () => run('suspend', {}),
                  })
                }
                disabled={busy !== null}
                className="btn-danger text-xs w-full justify-center"
              >
                <ShieldOff className="h-3.5 w-3.5" /> Suspend user
              </button>
            )}
          </div>
        </div>

        {error && <div className="text-xs text-err">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button onClick={onClose} className="btn text-xs">
            Close
          </button>
        </div>

        {confirm && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
            onClick={() => setConfirm(null)}
          >
            <div className="card p-5 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm">{confirm.label}</p>
              <div className="flex justify-end gap-2">
                <button className="btn text-xs" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button
                  className="btn-danger text-xs"
                  onClick={async () => {
                    const c = confirm;
                    setConfirm(null);
                    await c.run();
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
