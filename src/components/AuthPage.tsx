import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '@/lib/supabase.client';
import { Music2, CheckCircle2, X } from 'lucide-react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import AnimatedBackground from './AnimatedBackground';

interface EmailCooldown {
  email: string;
  until: number;
}

const COOLDOWN_STORAGE_KEY = 'ghoste_signup_cooldown';
const COOLDOWN_DURATION = 60000;

// Email Confirmed Banner Component
function EmailConfirmedBanner({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-full max-w-lg mx-auto mb-4 rounded-xl border border-emerald-500/60 bg-emerald-900/40 text-emerald-100 px-4 py-3 flex items-start gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-semibold text-emerald-50">Email confirmed</div>
        <div className="text-sm text-emerald-200/90 mt-0.5">
          You're all set – you can log in to your Ghoste account now.
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-emerald-300/70 hover:text-emerald-100 transition-colors flex-shrink-0"
        aria-label="Close banner"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function AuthPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState<EmailCooldown | null>(null);
  const [spotifyArtistData, setSpotifyArtistData] = useState<any>(null);
  const [showEmailConfirmedBanner, setShowEmailConfirmedBanner] = useState(false);
  const { signIn, signUp, signInWithGoogle, user } = useAuth();

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') {
      setIsSignUp(true);
    } else if (mode === 'signin') {
      setIsSignUp(false);
    }

    // Check for email confirmation parameter
    const authParam = searchParams.get('auth');
    if (authParam === 'email_confirmed') {
      setShowEmailConfirmedBanner(true);
      setIsSignUp(false); // Switch to login tab

      // Remove the auth parameter from URL without reloading
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('auth');
      const newSearch = newSearchParams.toString();
      const newUrl = newSearch ? `${location.pathname}?${newSearch}` : location.pathname;
      navigate(newUrl, { replace: true });
    }

    if (location.state) {
      const state = location.state as any;
      if (state.spotifyArtistId) {
        setSpotifyArtistData(state);
        setIsSignUp(true);
      }
    }

    const pendingUrl = localStorage.getItem('pending_spotify_url');
    if (pendingUrl) {
      setIsSignUp(true);
    }

    const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as EmailCooldown;
        if (Date.now() >= stored.until) {
          localStorage.removeItem(COOLDOWN_STORAGE_KEY);
        } else {
          setCooldown(stored);
        }
      } catch (e) {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
    }
  }, [searchParams, location.pathname, navigate]);

  // Redirect logged-in users to returnTo or dashboard
  useEffect(() => {
    if (user) {
      try {
        const returnTo = searchParams.get('returnTo') || '/dashboard/overview';
        // Ensure returnTo is a valid path (not external)
        const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/dashboard/overview';
        console.log('[AuthPage] Redirecting authenticated user to:', safeReturnTo);
        navigate(safeReturnTo, { replace: true });
      } catch (error) {
        console.error('[AuthPage] Navigation error:', error);
        // Fallback to dashboard if navigation fails
        window.location.assign('/dashboard/overview');
      }
    }
  }, [user, searchParams, navigate]);

  // Auto-hide email confirmed banner after 5 seconds
  useEffect(() => {
    if (showEmailConfirmedBanner) {
      const timer = setTimeout(() => {
        setShowEmailConfirmedBanner(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [showEmailConfirmedBanner]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (cooldown && cooldown.email !== value) {
      setCooldown(null);
      setError('');
    }
  };

  const handleTabSwitch = (toSignUp: boolean) => {
    setIsSignUp(toSignUp);
    setError('');
    setSuccessBanner('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessBanner('');

    if (isSignUp && cooldown && cooldown.email === email && Date.now() < cooldown.until) {
      const remainingSeconds = Math.ceil((cooldown.until - Date.now()) / 1000);
      setError(
        `For security purposes, you can only request this again after ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}.`
      );
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error: authError } = await signUp(email, password, fullName);

        if (authError) {
          if (
            authError.message?.toLowerCase().includes('rate limit') ||
            authError.message?.toLowerCase().includes('too many') ||
            (authError as any).status === 429
          ) {
            const until = Date.now() + COOLDOWN_DURATION;
            const cd: EmailCooldown = { email, until };
            localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cd));
            setCooldown(cd);
            setError(
              `For security purposes, you can only request another verification email after ${COOLDOWN_DURATION / 1000} seconds.`
            );
          } else {
            setError(authError.message);
          }
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          try {
            const returnTo = searchParams.get('returnTo') || '/dashboard/overview';
            const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/dashboard/overview';
            navigate(safeReturnTo, { replace: true });
          } catch (navError) {
            console.error('[AuthPage] Navigation error after signup:', navError);
            window.location.assign('/dashboard/overview');
          }
        } else {
          // Show toast notification - Supabase will send the confirmation email
          window.dispatchEvent(
            new CustomEvent('show-toast', {
              detail: {
                message: "Check your email to confirm your account. Once confirmed, you can log in.",
                type: 'success',
              },
            })
          );

          setIsSignUp(false);
          setSuccessBanner('Account created ✅ Check your email to confirm, then log in to continue.');
          setPassword('');
        }
      } else {
        const { error: authError } = await signIn(email, password);

        if (authError) {
          setError(authError.message || 'Login failed. Check your details.');
        } else {
          // Sign-in successful - wait for auth state to propagate
          console.log('[AuthPage] Sign-in successful, auth state will trigger redirect');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccessBanner('');
    setLoading(true);
    try {
      const { error: authError } = await signInWithGoogle();
      if (authError) {
        setError(authError.message);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-ghoste-bg via-ghoste-bg-secondary to-ghoste-accent-soft flex items-center justify-center p-4 relative">
      {/* Animated Background */}
      <AnimatedBackground />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-ghoste-accent to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xl">G</span>
            </div>
            <h1 className="text-4xl font-bold text-ghoste-text">Ghoste</h1>
          </div>
          <p className="text-ghoste-text-muted">Your complete music marketing platform</p>
        </div>

        {/* Email Confirmed Banner */}
        {showEmailConfirmedBanner && (
          <EmailConfirmedBanner onClose={() => setShowEmailConfirmedBanner(false)} />
        )}

        <div className="bg-ghoste-surface/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-ghoste-border">
          {spotifyArtistData && (
            <div className="mb-6 p-4 bg-ghoste-accent-soft/30 border border-ghoste-accent/30 rounded-xl flex items-center gap-4">
              {spotifyArtistData.spotifyArtistImage && (
                <img
                  src={spotifyArtistData.spotifyArtistImage}
                  alt={spotifyArtistData.spotifyArtistName}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div>
                <div className="text-sm text-ghoste-text-muted">Signing up as</div>
                <div className="font-semibold text-ghoste-text">
                  {spotifyArtistData.spotifyArtistName}
                </div>
              </div>
            </div>
          )}
          <div className="flex mb-6 border-b border-ghoste-border">
            <button
              type="button"
              onClick={() => handleTabSwitch(false)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                !isSignUp
                  ? 'text-ghoste-text border-b-2 border-ghoste-accent'
                  : 'text-ghoste-text-muted hover:text-ghoste-text'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch(true)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                isSignUp
                  ? 'text-ghoste-text border-b-2 border-ghoste-accent'
                  : 'text-ghoste-text-muted hover:text-ghoste-text'
              }`}
            >
              Sign Up
            </button>
          </div>

          {successBanner && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              {successBanner}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2 bg-black/40 border border-ghoste-border rounded-lg text-ghoste-text placeholder-ghoste-text-secondary focus:outline-none focus:ring-2 focus:ring-ghoste-accent transition-colors"
                  required={isSignUp}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-black border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-ghoste-accent hover:bg-ghoste-accent-hover text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-900 text-gray-400">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3 bg-white hover:bg-gray-100 text-black font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>

        </div>
      </div>
    </div>
  );
}
