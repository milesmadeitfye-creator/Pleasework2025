import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { trackCompleteRegistration } from '../lib/ownerMetaPixel';
import { getConfirmRedirectUrl } from '../lib/authRedirect';
import { buildDefaultOnboardingSchedule } from '../lib/scheduler/onboarding';
import { handleAuthFatalIfNeeded } from '../lib/authGuard';
import { safePostAuth } from '../lib/safeNetlify';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isEmailVerified: boolean;
  emailConfirmed: boolean;
  showProOnLogin: boolean;
  setShowProOnLogin: (show: boolean) => void;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithFacebook: () => Promise<{ error: AuthError | null }>;
  signInWithApple: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resendVerificationEmail: () => Promise<{ error: AuthError | null }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Meta connections are now handled via Supabase OAuth or meta_connections table
// Users must have a real Supabase account

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [showProOnLogin, setShowProOnLogin] = useState(false);

  // Prevent post-auth spam - only run once per user session
  const postAuthRan = useRef<string | null>(null);

  useEffect(() => {
    console.log('[AuthContext] Init - checking Supabase session');
    console.log('[AuthContext] Storage available:', typeof window !== 'undefined' && !!window.localStorage);

    // Load Supabase session with auth error handling
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        // Check for auth errors first
        if (error) {
          handleAuthFatalIfNeeded(error).then(handled => {
            if (!handled) {
              console.warn('[AuthContext] Session load error (non-fatal):', error.message);
            }
          });
          setUser(null);
          setLoading(false);
          console.log('[AuthContext] ❌ Session load failed, loading=false, user=null');
          return;
        }

        if (session?.user) {
          console.log('[AuthContext] ✅ Found Supabase user:', session.user.id);
          setUser(session.user);
          setIsEmailVerified(!!session.user.email_confirmed_at);
          setLoading(false);
          console.log('[AuthContext] ✅ Auth hydrated, loading=false, user=', session.user.id);

          // Handle profile creation and wallet bootstrap asynchronously
          (async () => {
            try {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('id', session.user.id)
                .maybeSingle();

              if (!profile) {
                console.log('[AuthContext] Creating user profile for:', session.user.id);
                await supabase.from('user_profiles').insert({
                  id: session.user.id,
                  display_name: session.user.user_metadata.full_name || '',
                });

                try {
                  const onboardingEvents = buildDefaultOnboardingSchedule({ userId: session.user.id });
                  const { error: scheduleError } = await supabase
                    .from('scheduler_events')
                    .insert(onboardingEvents);

                  if (scheduleError) {
                    console.warn('[AuthContext] Onboarding schedule creation failed:', scheduleError.message);
                  }
                } catch (scheduleErr) {
                  console.warn('[AuthContext] Error creating onboarding events:', scheduleErr);
                }
              }

              // Fire-and-forget post-auth call (once per user session)
              const uid = session.user.id;
              if (postAuthRan.current !== uid) {
                postAuthRan.current = uid;
                safePostAuth({ user_id: uid });
              }
            } catch (error) {
              console.warn('[AuthContext] Profile/wallet setup error (non-critical):', error);
            }
          })();

          return;
        }

        // No Supabase user - clear any stale state
        console.log('[AuthContext] ⚪ No Supabase user found, loading=false, user=null');
        setUser(null);
        setLoading(false);
      })
      .catch(async (err) => {
        // Handle fatal auth errors (expired tokens, etc)
        const handled = await handleAuthFatalIfNeeded(err);
        if (!handled) {
          console.warn('[AuthContext] Session restore failed:', err?.message || err);
        }
        setUser(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] Auth state changed:', event, session?.user ? `user ${session.user.id}` : 'no user');

      // Update user state from Supabase session
      setUser(session?.user ?? null);
      setIsEmailVerified(!!session?.user?.email_confirmed_at);

      // Set flag to show Pro modal on login (not on signup or other events)
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('[AuthContext] User signed in, setting Pro modal flag');
        setShowProOnLogin(true);
        localStorage.setItem('ghoste_show_pro_on_login', '1');
      }

      // Handle profile creation and wallet bootstrap asynchronously without affecting user state
      if (session?.user) {
        (async () => {
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('id')
              .eq('id', session.user.id)
              .maybeSingle();

            if (!profile) {
              console.log('[AuthContext] Creating user profile for:', session.user.id);
              await supabase.from('user_profiles').insert({
                id: session.user.id,
                display_name: session.user.user_metadata.full_name || '',
              });

              try {
                const onboardingEvents = buildDefaultOnboardingSchedule({ userId: session.user.id });
                const { error: scheduleError } = await supabase
                  .from('scheduler_events')
                  .insert(onboardingEvents);

                if (scheduleError) {
                  console.warn('[AuthContext] Onboarding schedule creation failed (non-critical):', scheduleError.message);
                }
              } catch (scheduleErr) {
                console.warn('[AuthContext] Onboarding events creation failed (non-critical):', scheduleErr);
              }
            }

            // Fire-and-forget post-auth call (once per user session)
            const uid = session.user.id;
            if (postAuthRan.current !== uid) {
              postAuthRan.current = uid;
              safePostAuth({ user_id: uid });
            }
          } catch (error) {
            console.warn('[AuthContext] Profile/wallet setup error (non-critical):', error);
          }
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectTo = getConfirmRedirectUrl();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        console.error('[AuthContext] Sign up error:', error);
        return { error };
      }

      if (data.user) {
        await supabase.from('user_profiles').insert({
          id: data.user.id,
          display_name: fullName,
        });

        try {
          const onboardingEvents = buildDefaultOnboardingSchedule({ userId: data.user.id });
          const { error: scheduleError } = await supabase
            .from('scheduler_events')
            .insert(onboardingEvents);

          if (scheduleError) {
            console.error('[AuthContext] Failed to create onboarding schedule:', scheduleError);
          }
        } catch (scheduleErr) {
          console.error('[AuthContext] Error creating onboarding events:', scheduleErr);
        }

        // Track successful registration with Meta Pixel
        try {
          trackCompleteRegistration(data.user.id);
        } catch (trackError) {
          // Swallow tracking errors - don't break signup flow
          console.error('[AuthContext] Error tracking CompleteRegistration:', trackError);
        }
      }

      // Auto-login: If Supabase didn't return a session, log them in manually
      let session = data.session;

      if (!session) {
        console.log('[AuthContext] No session after signup, logging in manually');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          console.error('[AuthContext] Auto-login error:', signInError);
          return { error: signInError };
        }

        session = signInData.session;
      }

      return { error: null };
    } catch (err) {
      console.error('[AuthContext] Unexpected sign up error:', err);
      return { error: err as AuthError };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  };

  const signInWithFacebook = async () => {
    // Clear any cached Facebook login state from ALL sources
    if (typeof window !== "undefined") {
      // Clear Supabase auth tokens
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-') || key.includes('auth-token')) {
          localStorage.removeItem(key);
        }
      });

      // Clear session storage
      sessionStorage.clear();

      // Clear any Facebook SDK state
      if ((window as any).FB) {
        try {
          (window as any).FB.logout();
        } catch (e) {
          console.log('[Auth] FB SDK not ready for logout');
        }
      }
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`,
      },
    });
    return { error };
  };

  const signInWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Clear Meta session from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("ghoste_meta_session");
    }
    await supabase.auth.signOut();
  };

  const resendVerificationEmail = async () => {
    if (!user?.email) {
      return { error: { message: 'No email address found', name: 'NoEmail', status: 400 } as AuthError };
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    });

    return { error };
  };

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user ?? null);
    setIsEmailVerified(!!session?.user?.email_confirmed_at);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isEmailVerified,
      emailConfirmed: isEmailVerified,
      showProOnLogin,
      setShowProOnLogin,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithFacebook,
      signInWithApple,
      signOut,
      resendVerificationEmail,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
