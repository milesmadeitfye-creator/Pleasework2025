import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function EmailConfirmed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (user) {
      fetch('/.netlify/functions/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          name: user.user_metadata?.full_name || 'there',
        }),
      }).catch((err) => console.error('Failed to send welcome email:', err));
    }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-2xl shadow-2xl p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full mb-6 animate-pulse">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>

            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                Email Confirmed!
              </h1>
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>

            <p className="text-gray-300 mb-8">
              Your email has been successfully verified. Welcome to Ghoste!
            </p>

            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-lg p-6 mb-6">
              <p className="text-sm text-gray-400 mb-2">
                Redirecting to your dashboard in
              </p>
              <div className="text-5xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                {countdown}
              </div>
            </div>

            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="w-full px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold rounded-lg transition-all transform hover:scale-105"
            >
              Go to Dashboard Now
            </button>

            <p className="text-xs text-gray-500 mt-4">
              You can now access all features of your Ghoste account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
