import { useState } from 'react';
import { Mail, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function EmailVerificationBanner() {
  const { user, isEmailVerified, resendVerificationEmail } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  if (isEmailVerified || isDismissed || !user) {
    return null;
  }

  const handleResend = async () => {
    setIsResending(true);
    setResendSuccess(false);

    const { error } = await resendVerificationEmail();

    setIsResending(false);

    if (!error) {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    }
  };

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0">
              <Mail className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-yellow-100">
                <span className="font-semibold">Please verify your email</span> to unlock all features.
                {resendSuccess ? (
                  <span className="ml-2 text-green-300">✓ Verification email sent! Check your inbox.</span>
                ) : (
                  <>
                    {' '}Check your inbox at <span className="font-medium">{user?.email}</span> or{' '}
                    <button
                      onClick={handleResend}
                      disabled={isResending}
                      className="underline hover:text-yellow-200 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {isResending ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'click here to resend'
                      )}
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="flex-shrink-0 p-1 rounded hover:bg-yellow-500/20 transition-colors text-yellow-200 hover:text-yellow-100"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
