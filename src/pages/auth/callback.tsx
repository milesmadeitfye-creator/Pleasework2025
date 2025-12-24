import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { trackCompleteRegistration } from '../../lib/ownerMetaPixel';

export default function OAuthCallback() {
  const [msg, setMsg] = useState('Completing sign-in…');
  const trackedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        // If any legacy implicit-hash snuck in, remove it for a clean exchange
        if (window.location.hash) {
          history.replaceState({}, '', window.location.pathname + window.location.search);
        }

        // PKCE: exchange ?code=... (and optional state) for a session
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          console.error('exchangeCodeForSession error:', error);
          setMsg('Sign-in error. Please try again.');
          return;
        }

        // Wait for session to be fully established
        setMsg('Finalizing sign-in...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify session exists before redirecting
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('No session after exchange');
          setMsg('Session error. Please try again.');
          setTimeout(() => window.location.replace('/'), 2000);
          return;
        }

        console.log('[OAuth Callback] Session established for user:', session.user.id);

        // Track CompleteRegistration for new OAuth users
        // Check if user profile exists to determine if this is a new signup
        if (!trackedRef.current) {
          try {
            const { data: profile } = await supabase
              .from('user_profiles')
              .select('id, created_at')
              .eq('id', session.user.id)
              .maybeSingle();

            // If profile was just created (within last 10 seconds) or doesn't exist yet, this is a new signup
            const isNewUser = !profile ||
              (profile.created_at && new Date().getTime() - new Date(profile.created_at).getTime() < 10000);

            if (isNewUser) {
              trackCompleteRegistration(session.user.id);
              trackedRef.current = true;
            }
          } catch (trackError) {
            console.error('[OAuth Callback] Error tracking CompleteRegistration:', trackError);
          }
        }

        // Session created → go to app (check for next parameter)
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next') || '/dashboard/overview';
        window.location.replace(next);
      } catch (e: any) {
        console.error(e);
        setMsg(e?.message || 'Unexpected error');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
        <div className="font-semibold text-lg mb-2">{msg}</div>
        <div className="text-xs text-gray-500">auth/callback</div>
      </div>
    </div>
  );
}
