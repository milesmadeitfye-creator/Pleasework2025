import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, LogIn } from 'lucide-react';

/**
 * Email Confirmation Page - Bulletproof Implementation
 *
 * Shown after user clicks the Supabase confirmation link.
 * Supabase handles the email confirmation automatically before redirecting here.
 * This page never crashes and simply shows a success message.
 *
 * Features:
 * - Safe query param parsing with try/catch
 * - Fallback navigation if React Router fails
 * - No direct backend calls (Supabase already confirmed)
 * - Works even with missing/malformed query params
 */

const ConfirmEmail: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Safely parse query params; never let this throw
  const { email, type } = useMemo(() => {
    try {
      const search = location?.search ?? '';
      const params = new URLSearchParams(search);
      return {
        email: params.get('email') ?? '',
        type: params.get('type') ?? '',
      };
    } catch (err) {
      console.error('[ConfirmEmail] Failed to parse URL params', err);
      return { email: '', type: '' };
    }
  }, [location?.search]);

  const handleLoginClick = () => {
    try {
      navigate('/auth');
    } catch (err) {
      console.error('[ConfirmEmail] Failed to navigate to login, falling back to hard redirect', err);
      window.location.href = '/auth';
    }
  };

  const title =
    type === 'signup' || type === 'magiclink'
      ? 'Email confirmed 👻'
      : 'You are back in Ghoste 👻';

  const description = email
    ? `Your email ${email} has been confirmed.`
    : 'Your email has been confirmed.';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
          <div className="flex justify-center mb-4">
            <CheckCircle className="h-20 w-20 text-green-500" />
          </div>

          <h1 className="mt-6 text-4xl font-extrabold text-white">
            {title}
          </h1>

          <p className="mt-4 text-lg text-gray-300">
            {description}
          </p>

          <p className="mt-2 text-sm text-gray-400">
            You can now log in to your Ghoste account and start using the studio.
          </p>

          <div className="mt-6 p-4 bg-gray-900 rounded-lg border border-gray-700">
            <p className="text-sm text-green-400 font-medium">
              ✅ Email Verified
            </p>
            <p className="text-xs text-gray-400 mt-1">
              You're officially Ghosted!
            </p>
          </div>
        </div>

        <div className="mt-8">
          <button
            type="button"
            onClick={handleLoginClick}
            className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Go to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmEmail;
