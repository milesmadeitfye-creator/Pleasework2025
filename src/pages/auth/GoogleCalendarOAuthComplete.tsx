import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function GoogleCalendarOAuthComplete() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'success' | 'error'>('success');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    const reason = searchParams.get('reason');

    // Use current origin for messages (works in both dev and production)
    const targetOrigin = window.location.origin;

    if (statusParam === 'error') {
      setStatus('error');
      setErrorMessage(reason || 'Failed to connect Google Calendar');

      // Notify opener about error
      if (window.opener && !window.opener.closed) {
        const errorPayload = {
          type: 'GOOGLE_CALENDAR_CONNECTED',
          status: 'error',
          error: errorMessage || reason || 'Failed to connect Google Calendar'
        };
        window.opener.postMessage(errorPayload, targetOrigin);
      }
      return;
    }

    // Success - notify opener and auto-close
    setStatus('success');

    // Notify the opener (main app) that Google Calendar is connected
    if (window.opener && !window.opener.closed) {
      console.log('[GoogleCalendarOAuthComplete] Notifying opener window...');
      const successPayload = {
        type: 'GOOGLE_CALENDAR_CONNECTED',
        status: 'success',
        provider: 'google_calendar'
      };

      window.opener.postMessage(successPayload, targetOrigin);
    }

    // Auto-close after a brief delay (800ms for snappy UX)
    const timeout = setTimeout(() => {
      console.log('[GoogleCalendarOAuthComplete] Attempting to close window...');
      try {
        window.close();
      } catch (e) {
        console.log('[GoogleCalendarOAuthComplete] Could not auto-close window:', e);
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [searchParams, errorMessage]);

  return (
    <div className="min-h-screen bg-ghoste-bg flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-ghoste-dark border border-ghoste-border rounded-xl p-8 text-center">
        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">Google Calendar Connected</h1>
            <p className="text-gray-400 text-sm mb-2">
              Your calendar is now linked to Ghoste One.
            </p>
            <p className="text-gray-400 text-sm">
              This window will close automatically.
            </p>
            <p className="text-gray-500 text-xs mt-4">
              If this window doesn't close automatically, you can close it now.
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
              {errorMessage || 'Failed to connect Google Calendar.'}
            </p>

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
              You can close this window.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
