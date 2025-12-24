import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function MetaOAuthComplete() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors from Meta (user denied or Meta error)
    if (error) {
      console.error('[MetaOAuthComplete] Meta OAuth error:', error, errorDescription);
      setStatus('error');
      setErrorMessage(errorDescription || error || 'Meta authorization failed');
      setErrorDetails({ error, errorDescription });

      if (window.opener) {
        window.opener.postMessage(
          { provider: 'meta', status: 'error', error: errorDescription || error },
          window.location.origin
        );
      }
      return;
    }

    if (!code) {
      console.error('[MetaOAuthComplete] Missing code parameter');
      setStatus('error');
      setErrorMessage('Missing authorization code from Meta');

      if (window.opener) {
        window.opener.postMessage(
          { provider: 'meta', status: 'error', error: 'Missing authorization code' },
          window.location.origin
        );
      }
      return;
    }

    const completeOAuth = async () => {
      try {
        console.log('[MetaOAuthComplete] Starting Meta connection completion...');

        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          console.error('[MetaOAuthComplete] Missing session token');
          setStatus('error');
          setErrorMessage('Missing session token. Please log in again.');
          return;
        }

        console.log('[MetaOAuthComplete] Sending code to backend...');

        const response = await fetch('/.netlify/functions/meta-connect-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code, state }),
        });

        let result: any = {};
        try {
          result = await response.json();
        } catch (e) {
          console.error('[MetaOAuthComplete] Failed to parse response JSON:', e);
          result = {};
        }

        console.log('[MetaOAuthComplete] Backend response:', {
          status: response.status,
          ok: response.ok,
          data: result,
        });

        if (response.ok && result?.success) {
          console.log('[MetaOAuthComplete] Meta connection successful!');
          setStatus('success');
          setErrorMessage(null);

          // Notify opener and close window only on success
          if (window.opener) {
            window.opener.postMessage(
              { provider: 'meta', status: 'success', data: result },
              window.location.origin
            );
            setTimeout(() => {
              window.close();
            }, 1500);
          } else {
            setTimeout(() => {
              window.location.href = '/profile?tab=connected-accounts&meta_status=success';
            }, 1500);
          }
        } else {
          // Backend returned error - show detailed message
          const errorMsg = result?.details || result?.error || `Connection failed with status ${response.status}`;
          console.error('[MetaOAuthComplete] Backend error:', {
            status: response.status,
            error: result?.error,
            details: result?.details,
            code: result?.code,
            fullResponse: result,
          });

          setStatus('error');
          setErrorMessage(errorMsg);
          setErrorDetails(result);

          // Notify opener but DON'T close window so user can see error
          if (window.opener) {
            window.opener.postMessage(
              { provider: 'meta', status: 'error', error: errorMsg, details: result },
              window.location.origin
            );
          }
        }
      } catch (err: any) {
        console.error('[MetaOAuthComplete] Unexpected error:', err);
        setStatus('error');
        setErrorMessage(err?.message || 'Unexpected error during Meta connection');
        setErrorDetails(err);

        // Notify opener but DON'T close window
        if (window.opener) {
          window.opener.postMessage(
            { provider: 'meta', status: 'error', error: err.message },
            window.location.origin
          );
        }
      }
    };

    completeOAuth();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-ghoste-bg flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-ghoste-dark border border-ghoste-border rounded-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold text-white mb-2">Connecting Meta</h1>
            <p className="text-gray-400 text-sm">Exchanging authorization code...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Success!</h1>
            <p className="text-gray-400 text-sm">Meta connected successfully.</p>
            <p className="text-gray-500 text-xs mt-4">
              {window.opener ? 'This window will close automatically...' : 'Redirecting...'}
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Connection Failed</h1>
            <p className="text-gray-300 text-sm mb-4">
              {errorMessage || 'Failed to complete Meta connection.'}
            </p>

            {errorDetails && (
              <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-lg text-left">
                <p className="text-xs text-gray-400 font-mono break-words">
                  {JSON.stringify(errorDetails, null, 2)}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <button
                onClick={() => window.close()}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Close Window
              </button>

              {!window.opener && (
                <button
                  onClick={() => window.location.href = '/profile?tab=connected-accounts'}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Return to Profile
                </button>
              )}
            </div>

            <p className="text-gray-500 text-xs mt-4">
              Check the browser console (F12) for detailed error logs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
