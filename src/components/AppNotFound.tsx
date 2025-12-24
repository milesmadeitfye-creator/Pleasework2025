import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';

/**
 * In-app 404 page for authenticated users
 * Shows when a user navigates to a non-existent route inside the app
 */
export default function AppNotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Search className="h-10 w-10 text-white/30" />
          </div>
        </div>

        {/* Large 404 */}
        <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white/90 to-white/30 mb-4">
          404
        </h1>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-3">
          Page not found
        </h2>

        {/* Description */}
        <p className="text-white/60 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/dashboard/overview"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white hover:from-blue-500 hover:to-cyan-500 transition-all"
          >
            <Home className="h-4 w-4" />
            Go to Overview
          </Link>

          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15 transition-all"
          >
            Go Back
          </button>
        </div>

        {/* Helpful Links */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-sm text-white/50 mb-4">
            Or try one of these:
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              to="/calendar"
              className="text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              Calendar
            </Link>
            <Link
              to="/analytics"
              className="text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              Analytics
            </Link>
            <Link
              to="/studio/smart-links"
              className="text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              Smart Links
            </Link>
            <Link
              to="/studio/ghoste-ai"
              className="text-xs text-white/70 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              Ghoste AI
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
