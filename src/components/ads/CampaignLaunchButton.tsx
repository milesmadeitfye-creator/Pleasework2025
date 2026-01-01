import { useState, useEffect } from 'react';
import { Rocket, RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CampaignLaunchButtonProps {
  campaign: {
    id: string;
    lifecycle_state?: string;
    meta_campaign_id?: string;
    meta_adset_id?: string;
    meta_ad_id?: string;
  };
  onStatusChange?: () => void;
}

export function CampaignLaunchButton({ campaign, onStatusChange }: CampaignLaunchButtonProps) {
  const [launching, setLaunching] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lifecycleState = campaign.lifecycle_state || 'draft';

  useEffect(() => {
    if (lifecycleState === 'launching') {
      startPolling();
    }
  }, [lifecycleState]);

  const startPolling = () => {
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 20;

    const pollInterval = setInterval(async () => {
      attempts++;
      console.log(`[CampaignLaunchButton] Polling attempt ${attempts}/${maxAttempts}`);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          clearInterval(pollInterval);
          setPolling(false);
          return;
        }

        const response = await fetch('/.netlify/functions/ads-sync-status', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[CampaignLaunchButton] Sync response:', data);

          if (data.campaigns && data.campaigns.length > 0) {
            const syncedCampaign = data.campaigns[0];
            if (syncedCampaign.lifecycle_state !== 'launching') {
              clearInterval(pollInterval);
              setPolling(false);
              onStatusChange?.();
            }
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setPolling(false);
          setError('Launch verification timed out. Check Meta Ads Manager.');
        }
      } catch (err) {
        console.error('[CampaignLaunchButton] Polling error:', err);
      }
    }, 3000);

    setTimeout(() => {
      clearInterval(pollInterval);
      setPolling(false);
    }, 60000);
  };

  const handleLaunch = async () => {
    if (!campaign.meta_campaign_id) {
      setError('Campaign must be published to Meta first');
      return;
    }

    setLaunching(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/ads-launch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id,
          mode: 'ACTIVE',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Launch failed');
      }

      console.log('[CampaignLaunchButton] Launch response:', data);

      if (data.needs_poll) {
        startPolling();
      }

      onStatusChange?.();
    } catch (err: any) {
      console.error('[CampaignLaunchButton] Launch error:', err);
      setError(err.message);
    } finally {
      setLaunching(false);
    }
  };

  const handleSync = async () => {
    setPolling(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/ads-sync-status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });

      if (response.ok) {
        onStatusChange?.();
      }
    } catch (err: any) {
      console.error('[CampaignLaunchButton] Sync error:', err);
      setError(err.message);
    } finally {
      setPolling(false);
    }
  };

  if (lifecycleState === 'active') {
    return (
      <button
        onClick={handleSync}
        disabled={polling}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-medium transition-colors"
        title="Sync status from Meta"
      >
        {polling ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        <span>Active</span>
      </button>
    );
  }

  if (lifecycleState === 'launching' || polling) {
    return (
      <button
        disabled
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 text-sm font-medium"
        title="Launching campaign..."
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Launching...</span>
      </button>
    );
  }

  if (lifecycleState === 'failed') {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={handleLaunch}
          disabled={launching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-medium transition-colors"
          title="Retry launch"
        >
          {launching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>Retry Launch</span>
        </button>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }

  if (lifecycleState === 'paused') {
    return (
      <button
        onClick={handleLaunch}
        disabled={launching}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm font-medium transition-colors"
        title="Resume campaign"
      >
        {launching ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Rocket className="w-4 h-4" />
        )}
        <span>Resume</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleLaunch}
        disabled={launching || !campaign.meta_campaign_id}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ghoste-blue hover:bg-blue-600 text-ghoste-white text-sm font-medium transition-colors shadow-[0_0_12px_rgba(26,108,255,0.2)] hover:shadow-[0_0_20px_rgba(26,108,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
        title={!campaign.meta_campaign_id ? 'Publish to Meta first' : 'Launch campaign'}
      >
        {launching ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Rocket className="w-4 h-4" />
        )}
        <span>Launch</span>
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
