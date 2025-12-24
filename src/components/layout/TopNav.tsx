import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUserPlan } from '../../hooks/useUserPlan';
import {
  Crown,
  LogOut,
} from 'lucide-react';
import { NotificationsBell } from '../navigation/NotificationsBell';
import WalletPill from '../ui/WalletPill';

const mainNavItems = [
  { label: 'Overview', href: '/dashboard/overview' },
  { label: 'Ghoste Studio', href: '/studio' },
  { label: 'My Manager', href: '/manager' },
  { label: 'Profile', href: '/profile' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Settings', href: '/settings' },
];

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isPro } = useUserPlan();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActivePath = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-gradient-to-r from-ghoste-black/90 via-ghoste-navy/90 to-ghoste-black/90 backdrop-blur-xl">
      <div className="mx-auto flex flex-col gap-2 px-4 py-2 md:h-16 md:flex-row md:items-center md:justify-between md:px-8">
        {/* Row 1: Logo + quick actions */}
        <div className="flex items-center justify-between gap-3">
          <Link to="/studio" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-ghoste-blue to-ghoste-navy shadow-[0_0_25px_rgba(26,108,255,0.45)] transition-shadow group-hover:shadow-[0_0_30px_rgba(26,108,255,0.6)]">
              <span className="text-sm font-bold text-ghoste-white">G</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-[0.12em] text-ghoste-white uppercase">
                Ghoste One
              </span>
              <span className="text-[10px] text-ghoste-grey/80 hidden sm:block">
                Artist Growth Operating System
              </span>
            </div>
          </Link>

          {/* Right side quick actions (mobile) */}
          <div className="flex items-center gap-2 md:hidden">
            <WalletPill />

            {user?.id && <NotificationsBell userId={user.id} />}

            {isPro ? (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-xs">
                <Crown className="w-3 h-3 text-amber-400" />
              </div>
            ) : (
              <Link
                to="/pricing"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-ghoste-blue hover:bg-ghoste-blue/90 shadow-[0_0_15px_rgba(26,108,255,0.4)] transition-all text-xs text-white"
              >
                <Crown className="w-3 h-3" />
              </Link>
            )}

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                onBlur={() => setTimeout(() => setUserMenuOpen(false), 200)}
                className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-ghoste-blue to-blue-600 flex items-center justify-center shadow-[0_0_12px_rgba(26,108,255,0.4)]">
                  <span className="text-white text-xs font-semibold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
              </button>

              {userMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-ghoste-black/95 border border-white/10 rounded-2xl shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-xs text-ghoste-grey">Signed in as</p>
                    <p className="text-sm text-ghoste-white truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-ghoste-grey hover:text-ghoste-white hover:bg-white/5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Main navigation - flat tabs */}
        <nav className="flex items-center gap-2 overflow-x-auto scrollbar-none text-xs md:text-sm pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
          {mainNavItems.map(item => {
            const active = isActivePath(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={[
                  'inline-flex items-center rounded-full px-3.5 py-1.5 whitespace-nowrap transition-all font-medium tracking-wide flex-shrink-0',
                  active
                    ? 'bg-ghoste-blue text-ghoste-white shadow-[0_0_18px_rgba(26,108,255,0.6)]'
                    : 'bg-white/5 text-ghoste-grey hover:bg-white/10 hover:text-ghoste-white'
                ].join(' ')}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right: Quick actions (desktop only) */}
        <div className="hidden md:flex items-center gap-3">
          <WalletPill />

          {user?.id && <NotificationsBell userId={user.id} />}

          {isPro ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-xs">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-amber-400">Pro</span>
            </div>
          ) : (
            <Link
              to="/pricing"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ghoste-blue hover:bg-ghoste-blue/90 shadow-[0_0_20px_rgba(26,108,255,0.5)] transition-all text-xs text-white"
            >
              <Crown className="w-4 h-4" />
              <span className="font-medium">Upgrade</span>
            </Link>
          )}

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              onBlur={() => setTimeout(() => setUserMenuOpen(false), 200)}
              className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ghoste-blue to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(26,108,255,0.4)]">
                <span className="text-white text-sm font-semibold">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm text-ghoste-grey">▼</span>
            </button>

            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-ghoste-black/95 border border-white/10 rounded-2xl shadow-[0_18px_45px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs text-ghoste-grey">Signed in as</p>
                  <p className="text-sm text-ghoste-white truncate font-medium">{user?.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-ghoste-grey hover:text-ghoste-white hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
