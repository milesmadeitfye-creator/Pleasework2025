import { useAuth } from '../../contexts/AuthContext';
import { User, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Topbar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U';

  return (
    <header className="sticky top-0 z-30 border-b border-ghoste-border bg-ghoste-bg/80 backdrop-blur-sm">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Page title can be added here dynamically */}
          </div>

          <div className="flex items-center gap-4">
            {/* User menu */}
            <div className="relative group">
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ghoste-surface transition-colors">
                <div className="w-8 h-8 rounded-full bg-ghoste-accent flex items-center justify-center text-white text-sm font-semibold">
                  {userInitials}
                </div>
                <span className="text-sm text-ghoste-text hidden sm:block">
                  {user?.email}
                </span>
              </button>

              {/* Dropdown */}
              <div className="absolute right-0 mt-2 w-48 rounded-lg bg-ghoste-surface border border-ghoste-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ghoste-text-muted hover:text-ghoste-text hover:bg-ghoste-surface-hover rounded-lg transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
