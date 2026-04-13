import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { accessUnlocked } from '@/lib/accessTrigger';

export default function EntryPage() {
  const [unlocked, setUnlocked] = useState(() => accessUnlocked());
  const { phase, error, requestMagicLink } = useAdminAuth();

  useEffect(() => {
    const t = setInterval(() => setUnlocked(accessUnlocked()), 300);
    return () => clearInterval(t);
  }, []);

  if (!unlocked) {
    // Stealth: absolutely nothing visible.
    return <div className="h-full w-full bg-ink-0" />;
  }

  return (
    <div className="min-h-full w-full flex items-center justify-center bg-ink-0 px-6">
      <div className="w-full max-w-sm">
        {phase === 'verifying' ? (
          <VerifyingPanel />
        ) : (
          <LoginPanel onSubmit={requestMagicLink} error={error} />
        )}
      </div>
    </div>
  );
}

function LoginPanel({
  onSubmit,
  error,
}: {
  onSubmit: (email: string, password?: string) => Promise<void>;
  error: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSending(true);
    try {
      await onSubmit(email, password || undefined);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-ink-1 p-6 shadow-card">
      <div className="mb-6">
        <div className="text-sm font-semibold tracking-tight text-fg">Ghoste Internal</div>
        <div className="text-xs text-fg-mute">Operator console</div>
      </div>
      <label className="block text-xs text-fg-soft mb-2" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        autoFocus
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@ghoste.one"
        className="w-full rounded-md border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-mute outline-none focus:border-brand-600"
        required
      />
      <label className="block text-xs text-fg-soft mt-4 mb-2" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        className="w-full rounded-md border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-mute outline-none focus:border-brand-600"
        required
      />
      <button
        type="submit"
        disabled={sending}
        className="mt-4 w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {sending ? 'Signing in…' : 'Sign in'}
      </button>
      {(localError || error) && (
        <p className="mt-3 text-xs text-err">{localError || error}</p>
      )}
    </form>
  );
}

function VerifyingPanel() {
  return (
    <div className="rounded-lg border border-line bg-ink-1 p-6 text-center shadow-card">
      <div className="mx-auto h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      <p className="mt-3 text-xs text-fg-mute">Verifying access…</p>
    </div>
  );
}
