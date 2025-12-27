import { isSupabaseConfigured } from '@/lib/supabase.client';

interface SupabaseGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Guard component that only renders children if Supabase is configured.
 * Shows a warning banner if Supabase is not configured.
 */
export function SupabaseGuard({ children, fallback }: SupabaseGuardProps) {
  if (!isSupabaseConfigured) {
    return (
      fallback || (
        <div className="min-h-screen bg-[#0A0F29] flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-red-900/20 border border-red-500/50 rounded-lg p-8">
            <div className="flex items-start gap-4">
              <div className="text-red-500 text-3xl">⚠️</div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Database Not Configured
                </h2>
                <p className="text-gray-300 mb-4">
                  Supabase configuration is missing. This application requires a valid database connection to function.
                </p>
                <div className="bg-black/30 rounded p-4 mb-4">
                  <p className="text-sm text-gray-400 mb-2">Missing environment variables:</p>
                  <ul className="text-sm text-red-400 font-mono space-y-1">
                    <li>• VITE_SUPABASE_URL</li>
                    <li>• VITE_SUPABASE_ANON_KEY</li>
                  </ul>
                </div>
                <p className="text-sm text-gray-400">
                  If you're a developer, check your <code className="bg-black/50 px-2 py-1 rounded text-red-400">.env</code> file
                  or build environment variables.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
}
