import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Activity,
  CreditCard,
  Film,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Music,
  ShieldAlert,
  Sparkles,
  Terminal,
  Users,
} from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import CommandPalette from './CommandPalette';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: ('super_admin' | 'admin' | 'support')[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/ai', label: 'AI Monitor', icon: Sparkles },
  { to: '/creatives', label: 'Ad Creatives', icon: Film },
  { to: '/ads', label: 'Meta Ads', icon: Megaphone },
  { to: '/distribution', label: 'Distribution', icon: Music },
  { to: '/links', label: 'Links', icon: Link2 },
  { to: '/billing', label: 'Billing', icon: CreditCard, minRole: ['super_admin', 'admin'] },
  { to: '/logs', label: 'Errors & Logs', icon: ShieldAlert },
];

export default function Shell() {
  const { identity, signOut } = useAdminAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full w-full bg-ink-0">
      <aside className="flex w-56 flex-col border-r border-line bg-ink-1">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-line">
          <div className="h-6 w-6 rounded bg-brand-600 flex items-center justify-center text-xs font-bold">G</div>
          <div>
            <div className="text-xs font-semibold tracking-tight">Ghoste Internal</div>
            <div className="text-[10px] text-fg-mute">Operator console</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV.filter((n) => !n.minRole || !identity || n.minRole.includes(identity.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-ink-3 text-fg'
                    : 'text-fg-soft hover:bg-ink-2 hover:text-fg'
                }`
              }
            >
              <n.icon className="h-4 w-4" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-3">
          <div className="mb-2 text-[11px] text-fg-mute truncate" title={identity?.email ?? ''}>
            {identity?.email}
          </div>
          <div className="flex items-center justify-between">
            <span className="chip capitalize">{identity?.role?.replace('_', ' ')}</span>
            <button
              onClick={() => signOut()}
              className="text-fg-mute hover:text-err transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-line bg-ink-1 px-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="group flex w-full max-w-md items-center gap-2 rounded-md border border-line bg-ink-2 px-3 py-1.5 text-sm text-fg-mute hover:border-line-strong"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Run command, search, or jump to…</span>
            <span className="ml-auto kbd">⌘K</span>
          </button>
          <div className="flex items-center gap-2">
            <SystemHealthDot />
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(path) => {
            navigate(path);
            setPaletteOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SystemHealthDot() {
  // Real status wired by Overview; here we just show a passive indicator.
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-fg-soft">
      <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
      <Activity className="h-3 w-3" />
    </div>
  );
}
