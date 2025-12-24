import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Mail, Lock, Facebook } from 'lucide-react'
import { trackCompleteRegistration } from '../lib/ownerMetaPixel'
import { getConfirmRedirectUrl } from '../lib/authRedirect'
import { trackMetaEvent } from '../lib/metaTrack'
import { useMetaOAuth } from '../hooks/useMetaOAuth'

interface AuthFormProps {
  mode: 'login' | 'signup'
  onToggleMode: () => void
}

interface EmailCooldown {
  email: string;
  until: number;
}

const COOLDOWN_STORAGE_KEY = 'ghoste_signup_cooldown';
const COOLDOWN_DURATION = 60000;

export function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [cooldown, setCooldown] = useState<EmailCooldown | null>(null)

  // Meta OAuth for Facebook login
  const { connectMeta, error: metaError } = useMetaOAuth()

  useEffect(() => {
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
  }, []);

  // Show Meta OAuth errors
  useEffect(() => {
    if (metaError) {
      setMessage({ type: 'error', text: metaError });
    }
  }, [metaError]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (cooldown && cooldown.email !== value) {
      setCooldown(null);
      setMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (mode === 'signup' && cooldown && cooldown.email === email && Date.now() < cooldown.until) {
      const remainingSeconds = Math.ceil((cooldown.until - Date.now()) / 1000);
      setMessage({
        type: 'error',
        text: `For security purposes, you can only request this again after ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}.`
      });
      return;
    }

    setLoading(true)

    try {
      if (mode === 'signup') {
        const redirectTo = getConfirmRedirectUrl();

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              phone: phone || null,
            },
          }
        })

        if (error) {
          console.error('[AuthForm] Sign up error:', error);
          if (
            error.message?.toLowerCase().includes('rate limit') ||
            error.message?.toLowerCase().includes('too many') ||
            (error as any).status === 429
          ) {
            const until = Date.now() + COOLDOWN_DURATION;
            const cd: EmailCooldown = { email, until };
            localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(cd));
            setCooldown(cd);
            throw new Error(
              `For security purposes, you can only request another verification email after ${COOLDOWN_DURATION / 1000} seconds.`
            );
          }
          throw error;
        }

        // Track free signup completion
        if (data.user) {
          try {
            trackCompleteRegistration(data.user.id);
          } catch (trackError) {
            console.error('[AuthForm] Error tracking registration:', trackError);
          }

          // Track CompleteRegistration via Pixel + CAPI
          try {
            trackMetaEvent('CompleteRegistration', {
              email,
              customData: {
                content_name: 'Ghoste Studio signup',
              },
            });
          } catch (trackError) {
            console.error('[AuthForm] Error tracking CompleteRegistration:', trackError);
          }

          // Enroll in marketing automation
          try {
            await fetch("/.netlify/functions/marketing-email-enroll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: data.user.id,
                email,
                sequence_key: "marketing_onboarding",
                context: { source: "signup" }
              }),
            });
          } catch (enrollError) {
            console.error('[AuthForm] Error enrolling in marketing automation:', enrollError);
          }
        }

        // Auto-login: If Supabase didn't return a session, log them in manually
        let session = data.session;

        if (!session) {
          console.log('[AuthForm] No session after signup, logging in manually');
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (signInError) {
            console.error('[AuthForm] Auto-login error:', signInError);
            throw signInError;
          }

          session = signInData.session;
        }

        // If we have a session, redirect to dashboard
        if (session) {
          console.log('[AuthForm] Auto-login successful, redirecting to dashboard');
          window.location.href = '/';
          return;
        }

        setMessage({
          type: 'success',
          text: 'Account created! Check your email to confirm and unlock all features.'
        })
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (error) {
          console.error('[AuthForm] Login error:', {
            message: error.message,
            status: error.status,
            name: error.name,
            stack: error.stack
          });
          throw error;
        }

        if (data.session) {
          console.log('[AuthForm] Login successful, session:', {
            userId: data.session.user.id,
            hasAccessToken: !!data.session.access_token
          });
        }
      }
    } catch (error: any) {
      console.error('[AuthForm] Authentication error:', error);

      // Provide more detailed error messages
      let errorText = error.message || 'An unexpected error occurred';

      if (errorText.toLowerCase().includes('fetch')) {
        errorText += ' - Check your network connection and verify Supabase URL is correct.';
      }

      if (errorText.toLowerCase().includes('invalid')) {
        errorText = 'Invalid email or password. Please try again.';
      }

      setMessage({
        type: 'error',
        text: errorText
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h2>
        </div>

        {/* Facebook Login Button */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={connectMeta}
            className="group relative w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <Facebook className="h-5 w-5" />
            Continue with Facebook
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">Or continue with email</span>
            </div>
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  className="appearance-none relative block w-full px-3 py-2 pl-10 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone number (optional)
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="+1 224 243 5172"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}
          </div>

          {message && (
            <div className={`rounded-md p-4 ${
              message.type === 'error' 
                ? 'bg-red-50 border border-red-200' 
                : 'bg-green-50 border border-green-200'
            }`}>
              <p className={`text-sm ${
                message.type === 'error' ? 'text-red-800' : 'text-green-800'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : (mode === 'login' ? 'Sign in' : 'Sign up')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onToggleMode}
              className="text-indigo-600 hover:text-indigo-500 text-sm"
            >
              {mode === 'login' 
                ? "Don't have an account? Sign up" 
                : 'Already have an account? Sign in'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}