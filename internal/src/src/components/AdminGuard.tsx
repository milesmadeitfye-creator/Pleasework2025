import type { ReactNode } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import EntryPage from '@/pages/EntryPage';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { phase } = useAdminAuth();
  if (phase === 'authenticated') return <>{children}</>;
  if (phase === 'rejected') return <div className="h-full w-full bg-ink-0" />;
  return <EntryPage />;
}
