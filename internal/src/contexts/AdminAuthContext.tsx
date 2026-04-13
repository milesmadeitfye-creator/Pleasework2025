import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { api, ApiError } from '@/lib/api';

export type AdminRole = 'super_admin' | 'admin' | 'support';

export interface AdminIdentity {
  email: string;
  role: AdminRole;
  userId: string;
}

type Phase = 'booting' | 'unauthenticated' | 'verifying' | 'authenticated' | 'rejected';

interface AdminAuthContextValue {
  phase: Phase;
  identity: AdminIdentity | null;
  error: string | null;
  requestMagicLink: (email: string) => Promise<void>;
  signOut: (redirect?: boolean) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verifyInFlight = useRef(false);

  const verify = useCallback(async () => {
    if (verifyInFlight.current) return;
    verifyInFlight.current = true;
    setPhase('verifying');
    try {
      const res = await api<{ ok: true; email: string; role: AdminRole; userId: string }>(
        '/.netlify/functions/admin-verify',
        { method: 'POST' },
      );
      setIdentity({ email: res.email, role: res.role, userId: res.userId });
      setPhase('authenticated');
      setError(null);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setIdentity(null);
      if (status === 403) {
        setError('Not authorized.');
        setPhase('rejected');
        // Kill session immediately and bounce to public site.
        await supabase.auth.signOut().catch(() => {});
        const publicUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://ghoste.one';
        window.location.replace(publicUrl);
      } else if (status === 401) {
        setPhase('unauthenticated');
      } else {
        setError(err instanceof Error ? err.message : 'Verification failed.');
        setPhase('unauthenticated');
      }
    } finally {
      verifyInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        await verify();
      } else {
        setPhase('unauthenticated');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        verify();
      } else {
        setIdentity(null);
        setPhase('unauthenticated');
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [verify]);

  const requestMagicLink = useCallback(async (email: string, password?: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) throw new Error('Enter an email.');
    if (password) {
      const { error: sbError } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (sbError) throw new Error(sbError.message);
    } else {
      const { error: sbError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: window.location.origin + '/?access=ghoste',
          shouldCreateUser: false,
        },
      });
      if (sbError) throw new Error(sbError.message);
    }
  }, []);

  const signOut = useCallback(async (redirect = true) => {
    await supabase.auth.signOut().catch(() => {});
    setIdentity(null);
    setPhase('unauthenticated');
    if (redirect) {
      const publicUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://ghoste.one';
      window.location.replace(publicUrl);
    }
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ phase, identity, error, requestMagicLink, signOut }),
    [phase, identity, error, requestMagicLink, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
