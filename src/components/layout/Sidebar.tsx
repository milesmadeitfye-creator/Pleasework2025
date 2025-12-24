import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Link as LinkIcon,
  Mail,
  Settings,
  Menu,
  X,
  Wallet,
  BarChart3,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard/overview', icon: LayoutDashboard },
  { name: 'Ghoste Studio', href: '/studio', icon: Sparkles },
  { name: 'Smart Links', href: '/studio/smart-links', icon: LinkIcon },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Fan Communication', href: '/studio/fan-communication', icon: Mail },
  { name: 'Wallet', href: '/wallet', icon: Wallet },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    // Exact match or starts with href (for sub-routes)
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-ghoste-surface border border-ghoste-border text-ghoste-text hover:bg-ghoste-surface-hover transition-colors"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 h-screen
          w-64 bg-ghoste-surface border-r border-ghoste-border
          flex flex-col
          transition-transform duration-300 ease-in-out z-40
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="p-6 border-b border-ghoste-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-ghoste-accent to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <span className="text-xl font-bold text-ghoste-text">Ghoste</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.href);
                  setMobileMenuOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  text-sm font-medium transition-all
                  ${
                    active
                      ? 'bg-ghoste-accent-soft text-ghoste-accent'
                      : 'text-ghoste-text-muted hover:bg-ghoste-surface-hover hover:text-ghoste-text'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-ghoste-border">
          <div className="text-xs text-ghoste-text-secondary text-center">
            © 2025 Ghoste
          </div>
        </div>
      </aside>
    </>
  );
}
