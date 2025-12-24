import { useState } from 'react';
import { useMetaCredentials } from '../../hooks/useMetaCredentials';
import { useSessionUser } from '../../hooks/useSessionUser';
import { Settings, CheckCircle2, AlertCircle } from 'lucide-react';

interface MetaConnectBannerProps {
  context?: 'ads' | 'social' | 'general';
}

export function MetaConnectBanner({ context = 'general' }: MetaConnectBannerProps) {
  const { user, loading: authLoading } = useSessionUser();
  const { meta, isMetaReady, loading: metaLoading } = useMetaCredentials(user?.id);
  const [dismissed, setDismissed] = useState(false);

  // If loading auth or meta, don't show anything yet (prevents "Not connected" flash)
  if (authLoading || metaLoading) {
    return null;
  }

  // If user dismissed or setup is complete and no issues, don't show banner
  if (dismissed) {
    return null;
  }

  // If Meta is fully configured, show green success banner
  if (isMetaReady) {
    return (
      <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 mb-6 flex items-start gap-3">
        <div className="mt-0.5">
          <CheckCircle2 className="h-5 w-5 text-green-400" />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-green-200">Meta setup complete</div>

          <div className="text-sm text-white/70 mt-1">
            You're connected and ready to create campaigns.
          </div>

          <div className="mt-3">
            <a
              href="/profile?tab=connected-accounts"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-200 hover:bg-green-500/25 inline-block transition-colors"
            >
              View Meta Setup
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If has access token but missing ad_account_id or page_id, show setup incomplete banner
  if (meta?.access_token) {
    return (
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 mb-6 flex items-start gap-3">
        <div className="mt-0.5">
          <AlertCircle className="h-5 w-5 text-blue-400" />
        </div>

        <div className="flex-1">
          <div className="font-semibold text-white">Complete Your Meta Setup</div>

          <div className="text-sm text-white/70 mt-1">
            You're connected to Meta, but you need to select which Business, Page, and Ad Account to
            use for your campaigns.
          </div>

          <div className="mt-3">
            <a
              href="/profile?tab=connected-accounts"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-200 hover:bg-blue-500/25 inline-block transition-colors"
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Complete Setup in Profile
            </a>
          </div>
        </div>
      </div>
    );
  }

  // If not connected at all, show connect prompt
  const contextMessage =
    context === 'ads'
      ? 'To create and manage Meta ad campaigns, connect your Meta account in your Profile settings.'
      : context === 'social'
      ? 'To post to Facebook and Instagram, connect your Meta account in your Profile settings.'
      : 'Connect your Meta account to access Facebook and Instagram features.';

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 mb-6 flex items-start gap-3">
      <div className="mt-0.5">
        <AlertCircle className="h-5 w-5 text-blue-400" />
      </div>

      <div className="flex-1">
        <div className="font-semibold text-white">Meta Account Required</div>

        <div className="text-sm text-white/70 mt-1">{contextMessage}</div>

        <div className="mt-3">
          <a
            href="/profile?tab=connected-accounts"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-200 hover:bg-blue-500/25 inline-block transition-colors"
          >
            Go to Connected Accounts
          </a>
        </div>
      </div>
    </div>
  );
}
