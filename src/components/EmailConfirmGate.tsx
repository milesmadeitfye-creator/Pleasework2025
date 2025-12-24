import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, RefreshCw } from 'lucide-react';

type EmailConfirmGateProps = {
  children: React.ReactNode;
};

export const EmailConfirmGate: React.FC<EmailConfirmGateProps> = ({ children }) => {
  const { user, emailConfirmed, resendVerificationEmail } = useAuth();
  const [resending, setResending] = React.useState(false);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);

  if (!user) {
    // Not logged in – render children normally
    return <>{children}</>;
  }

  if (!emailConfirmed) {
    const handleResend = async () => {
      setResending(true);
      setResendMessage(null);

      const { error } = await resendVerificationEmail();

      if (error) {
        setResendMessage(`Error: ${error.message}`);
      } else {
        setResendMessage('Verification email sent! Check your inbox.');
      }

      setResending(false);
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
          <Mail className="w-8 h-8 text-purple-500" />
        </div>

        <div className="max-w-md space-y-2">
          <h2 className="text-2xl font-semibold text-white">Confirm your email to unlock Ghoste</h2>
          <p className="text-sm text-gray-400">
            You're logged in, but we need you to confirm your email before you can use all features.
            Check your inbox for a confirmation link. Once you click it, refresh this page.
          </p>
        </div>

        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={handleResend}
            disabled={resending}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
          >
            {resending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Resend confirmation email
              </>
            )}
          </button>

          {resendMessage && (
            <p className={`text-sm ${resendMessage.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {resendMessage}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500 max-w-sm">
          Didn't receive an email? Check your spam folder or try resending the confirmation email above.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
