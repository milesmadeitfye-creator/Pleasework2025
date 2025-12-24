import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getMailchimpConnectionForUser } from '../lib/integrations/mailchimp';
import { MailchimpListSelector } from '../components/MailchimpListSelector';
import { ProGate } from '../components/ProGate';
import { useConnectionStatus } from '../hooks/useConnectionStatus';

type MetaStatus = {
  metaReady: boolean;
  debug?: {
    hasAppId: boolean;
    hasAppSecret: boolean;
    hasRedirectUri: boolean;
  };
};

type AdAccount = {
  id: string;
  platform: 'tiktok_ads' | 'google_ads';
  external_account_id: string | null;
  account_name: string | null;
  status: string;
  created_at: string;
};

export default function ConnectedAccounts() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metaReady, setMetaReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [mailchimpConnected, setMailchimpConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [tiktokDisplayName, setTiktokDisplayName] = useState<string | null>(null);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Use unified connection status hook for Google Calendar
  const googleCalendar = useConnectionStatus('google_calendar');

  const fetchAdAccounts = async () => {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('connected_ad_accounts')
        .select('*')
        .eq('user_id', user.id);

      if (fetchError) {
        console.error('[ConnectedAccounts] Error fetching ad accounts:', fetchError);
      } else if (data) {
        setAdAccounts(data);
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Unexpected error fetching ad accounts:', err);
    }
  };

  const fetchMailchimpConnection = async () => {
    if (!user) return;

    try {
      const { connection, error: fetchError } = await getMailchimpConnectionForUser(supabase, user.id);

      if (fetchError) {
        console.error('[ConnectedAccounts] Error fetching Mailchimp connection:', fetchError);
        setMailchimpConnected(false);
      } else {
        setMailchimpConnected(!!connection && !!connection.access_token);
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Unexpected error fetching Mailchimp:', err);
      setMailchimpConnected(false);
    }
  };

  const fetchTiktokConnection = async () => {
    if (!user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'tiktok')
        .maybeSingle();

      if (fetchError) {
        console.error('[ConnectedAccounts] Error fetching TikTok connection:', fetchError);
        setTiktokConnected(false);
      } else {
        setTiktokConnected(!!data && !!data.access_token);
        if (data && data.meta && typeof data.meta === 'object' && 'display_name' in data.meta) {
          setTiktokDisplayName(data.meta.display_name as string);
        }
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Unexpected error fetching TikTok:', err);
      setTiktokConnected(false);
    }
  };

  const fetchCalendarConnection = async () => {
    if (!user) return;

    try {
      // Fetch email from user profile for display
      const { data: profile } = await supabase.auth.getUser();
      setCalendarEmail(profile?.user?.email || null);
    } catch (err) {
      console.error('[ConnectedAccounts] Unexpected error fetching Calendar email:', err);
      setCalendarEmail(null);
    }
  };

  useEffect(() => {
    const checkMeta = async () => {
      try {
        setError(null);
        const res = await fetch('/api/meta/status', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Meta status HTTP ${res.status}`);
        }

        const data: MetaStatus = await res.json();
        setMetaReady(Boolean(data.metaReady));
      } catch (err) {
        console.error('Meta status fetch failed:', err);
        setMetaReady(false);
        setError('Unable to verify Meta configuration.');
      } finally {
        setLoading(false);
      }
    };

    checkMeta();
    fetchAdAccounts();
    fetchMailchimpConnection();
    fetchTiktokConnection();
    fetchCalendarConnection();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaStatusParam = params.get('meta_status');
    const connectedParam = params.get('connected');
    const errorParam = params.get('error');
    const reason = params.get('reason');
    const mailchimpParam = params.get('mailchimp');
    const tiktokParam = params.get('tiktok');
    const gcalParam = params.get('gcal');

    if (gcalParam === 'connected') {
      setSuccess('Google Calendar connected successfully!');
      fetchCalendarConnection();
      googleCalendar.refresh(); // Refresh connection status
      window.history.replaceState({}, '', '/connected-accounts');
    } else if (tiktokParam === 'success') {
      setSuccess('TikTok connected successfully! 🎉');
      fetchTiktokConnection();
      window.history.replaceState({}, '', '/dashboard/connected-accounts');
    } else if (tiktokParam === 'error') {
      const tiktokErrorMessages: Record<string, string> = {
        missing_code: 'TikTok authorization failed. Please try again.',
        invalid_state: 'TikTok session expired. Please try again.',
        config_missing: 'TikTok is not configured. Please contact support.',
        token_exchange_failed: 'Failed to complete TikTok authorization. Please try again.',
        database_error: 'Failed to save TikTok connection. Please try again.',
        unexpected: 'An unexpected error occurred. Please try again.',
      };
      setError(tiktokErrorMessages[reason || ''] || 'TikTok connection failed. Please try again.');
      window.history.replaceState({}, '', '/dashboard/connected-accounts');
    } else if (mailchimpParam === 'success') {
      setSuccess('Mailchimp connected successfully! 🎉');
      fetchMailchimpConnection();
      window.history.replaceState({}, '', '/dashboard/connected-accounts');
    } else if (mailchimpParam === 'error') {
      setError('Mailchimp connection failed. Please try again.');
      window.history.replaceState({}, '', '/dashboard/connected-accounts');
    } else if (metaStatusParam === 'success') {
      setSuccess('Meta account connected successfully!');
      fetchAdAccounts();
      window.history.replaceState({}, '', '/connected-accounts');
    } else if (connectedParam === 'tiktok_ads') {
      setSuccess('TikTok Ads account connected successfully!');
      fetchAdAccounts();
      window.history.replaceState({}, '', '/connected-accounts');
    } else if (connectedParam === 'google_ads') {
      setSuccess('Google Ads account connected successfully!');
      fetchAdAccounts();
      window.history.replaceState({}, '', '/connected-accounts');
    } else if (metaStatusParam === 'error' || errorParam) {
      const errorMessages: Record<string, string> = {
        not_authenticated: 'Please sign in to your Ghoste account before connecting.',
        config_missing: 'Connection is not configured. Please contact support.',
        missing_code: 'Authorization failed. Please try again.',
        invalid_state: 'Session expired. Please try again.',
        token_exchange_failed: 'Failed to complete authorization. Please try again.',
        user_info_failed: 'Failed to retrieve account information. Please try again.',
        database_error: 'Failed to save connection. Please try again.',
        tiktok_config_missing: 'TikTok Ads is not configured. Please contact support.',
        tiktok_missing_code: 'TikTok authorization failed. Please try again.',
        tiktok_invalid_state: 'TikTok session expired. Please try again.',
        tiktok_token_exchange_failed: 'Failed to complete TikTok authorization. Please try again.',
        tiktok_database_error: 'Failed to save TikTok connection. Please try again.',
        tiktok_unexpected_error: 'An unexpected error occurred with TikTok. Please try again.',
        google_ads_config_missing: 'Google Ads is not configured. Please contact support.',
        google_ads_missing_code: 'Google Ads authorization failed. Please try again.',
        google_ads_invalid_state: 'Google Ads session expired. Please try again.',
        google_ads_token_exchange_failed: 'Failed to complete Google Ads authorization. Please try again.',
        google_ads_database_error: 'Failed to save Google Ads connection. Please try again.',
        google_ads_unexpected_error: 'An unexpected error occurred with Google Ads. Please try again.',
      };
      setError(errorMessages[reason || errorParam || ''] || 'Connection failed. Please try again or contact support.');
      window.history.replaceState({}, '', '/connected-accounts');
    }
  }, []);

  const handleMetaConnect = () => {
    if (!metaReady || loading || !user) {
      console.log('[ConnectedAccounts] Cannot connect:', { metaReady, loading, hasUser: !!user });
      return;
    }
    console.log('[ConnectedAccounts] Initiating Meta OAuth for user:', user.id);
    window.location.href = `/api/meta/auth?userId=${encodeURIComponent(user.id)}`;
  };

  const handleTikTokAdsConnect = async () => {
    if (!user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to connect TikTok Ads');
        return;
      }

      const response = await fetch('/.netlify/functions/tiktok-ads-auth-start', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.redirected) {
        window.location.href = response.url;
      } else if (!response.ok) {
        setError('Failed to initiate TikTok Ads connection');
      }
    } catch (err) {
      console.error('[ConnectedAccounts] TikTok Ads connect error:', err);
      setError('Failed to connect to TikTok Ads');
    }
  };

  const handleGoogleAdsConnect = async () => {
    if (!user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to connect Google Ads');
        return;
      }

      const response = await fetch('/.netlify/functions/google-ads-auth-start', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.redirected) {
        window.location.href = response.url;
      } else if (!response.ok) {
        setError('Failed to initiate Google Ads connection');
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Google Ads connect error:', err);
      setError('Failed to connect to Google Ads');
    }
  };

  const handleDisconnect = async (platform: 'tiktok_ads' | 'google_ads') => {
    if (!user || disconnecting) return;

    setDisconnecting(platform);
    try {
      const { error: deleteError } = await supabase
        .from('connected_ad_accounts')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', platform);

      if (deleteError) {
        console.error('[ConnectedAccounts] Error disconnecting:', deleteError);
        setError(`Failed to disconnect ${platform === 'tiktok_ads' ? 'TikTok Ads' : 'Google Ads'}`);
      } else {
        setSuccess(`${platform === 'tiktok_ads' ? 'TikTok Ads' : 'Google Ads'} disconnected successfully!`);
        fetchAdAccounts();
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Disconnect error:', err);
      setError('An unexpected error occurred');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleMailchimpConnect = () => {
    if (!user) return;
    console.log('[ConnectedAccounts] Initiating Mailchimp OAuth for user:', user.id);
    window.location.href = `/.netlify/functions/mailchimp-oauth-start?user_id=${encodeURIComponent(user.id)}`;
  };

  const handleMailchimpDisconnect = async () => {
    if (!user || disconnecting) return;

    setDisconnecting('mailchimp');
    try {
      const { error: deleteError } = await supabase
        .from('mailchimp_connections')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('[ConnectedAccounts] Error disconnecting Mailchimp:', deleteError);
        setError('Failed to disconnect Mailchimp');
      } else {
        setSuccess('Mailchimp disconnected successfully!');
        setMailchimpConnected(false);
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Disconnect error:', err);
      setError('An unexpected error occurred');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleTiktokConnect = () => {
    if (!user) return;
    console.log('[ConnectedAccounts] Initiating TikTok OAuth for user:', user.id);
    window.location.href = `/.netlify/functions/tiktok-auth-start?user_id=${encodeURIComponent(user.id)}`;
  };

  const handleTiktokDisconnect = async () => {
    if (!user || disconnecting) return;

    setDisconnecting('tiktok');
    try {
      const { error: deleteError } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'tiktok');

      if (deleteError) {
        console.error('[ConnectedAccounts] Error disconnecting TikTok:', deleteError);
        setError('Failed to disconnect TikTok');
      } else {
        setSuccess('TikTok disconnected successfully!');
        setTiktokConnected(false);
        setTiktokDisplayName(null);
      }
    } catch (err) {
      console.error('[ConnectedAccounts] Disconnect error:', err);
      setError('An unexpected error occurred');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleCalendarConnect = async () => {
    setLoadingCalendar(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please sign in to connect Google Calendar');
        setLoadingCalendar(false);
        return;
      }

      const res = await fetch('/.netlify/functions/gcal-start-connect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json();

      if (!res.ok || !json.authUrl) {
        console.error('[ConnectedAccounts] gcal-start-connect error:', json);
        throw new Error(json.error || 'Failed to start calendar auth');
      }

      console.log('[ConnectedAccounts] Redirecting to Google Calendar OAuth');
      // Don't set loading to false here since we're redirecting
      window.location.href = json.authUrl;
    } catch (err: any) {
      console.error('[ConnectedAccounts] Calendar connection failed:', err);
      setError(err.message || 'Calendar connection failed');
      setLoadingCalendar(false);
    }
  };

  const handleCalendarDisconnect = async () => {
    if (!user || disconnecting) return;

    setDisconnecting('calendar');
    try {
      // Delete from google_calendar_tokens
      const { error: deleteError } = await supabase
        .from('google_calendar_tokens')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('[ConnectedAccounts] Error disconnecting Calendar:', deleteError);
        setError('Failed to disconnect Google Calendar');
        setDisconnecting(null);
        return;
      }

      // Also update connected_accounts status
      const { error: statusError } = await supabase
        .from('connected_accounts')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar');

      if (statusError) {
        console.error('[ConnectedAccounts] Error updating connection status:', statusError);
      }

      setSuccess('Google Calendar disconnected successfully!');
      googleCalendar.refresh(); // Refresh connection status
    } catch (err) {
      console.error('[ConnectedAccounts] Disconnect error:', err);
      setError('An unexpected error occurred');
    } finally {
      setDisconnecting(null);
    }
  };

  const tiktokAccount = adAccounts.find(acc => acc.platform === 'tiktok_ads');
  const googleAdsAccount = adAccounts.find(acc => acc.platform === 'google_ads');

  if (loading) {
    return (
      <div className="px-8 py-8">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <ProGate feature="Connected Accounts" action="connect" fullPage>
      <div className="px-8 py-8">
      <h1 className="text-2xl font-semibold text-white mb-2">
        Connected Accounts
      </h1>
      <p className="text-gray-400 mb-6">
        Connect your ad accounts to sync campaigns, audiences, and analytics into Ghoste.
      </p>

      {success && (
        <div className="mb-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Mailchimp */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14.854 10.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L13.293 11H8.5a.5.5 0 0 1 0-1h4.793l-2.147-2.146a.5.5 0 0 1 .708-.708l3 3z"/>
                  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold">Mailchimp</h2>
                <p className="text-gray-400 text-sm mt-1">
                  {mailchimpConnected
                    ? 'Connected - Email marketing and audience management'
                    : 'Connect your Mailchimp account to sync contacts and campaigns'}
                </p>
              </div>
            </div>

            {mailchimpConnected ? (
              <button
                onClick={handleMailchimpDisconnect}
                disabled={disconnecting === 'mailchimp'}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {disconnecting === 'mailchimp' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleMailchimpConnect}
                className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                Connect Mailchimp
              </button>
            )}
          </div>

          {mailchimpConnected && <MailchimpListSelector />}
        </div>

        {/* TikTok Social */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">TikTok</h2>
              <p className="text-gray-400 text-sm mt-1">
                {tiktokConnected
                  ? `Connected${tiktokDisplayName ? ` as ${tiktokDisplayName}` : ''} - Post to TikTok`
                  : 'Connect your TikTok account to post content'}
              </p>
            </div>
          </div>

          {tiktokConnected ? (
            <button
              onClick={handleTiktokDisconnect}
              disabled={disconnecting === 'tiktok'}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {disconnecting === 'tiktok' ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleTiktokConnect}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-pink-600 hover:bg-pink-700 text-white"
            >
              Connect TikTok
            </button>
          )}
        </div>

        {/* Google Calendar */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2">
                  Google Calendar
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    googleCalendar.connected
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                  }`}>
                    {googleCalendar.connected ? 'Connected' : 'Not Connected'}
                  </span>
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {googleCalendar.connected
                    ? 'Let Ghoste AI schedule events for you'
                    : 'Connect your calendar to schedule releases and reminders'}
                </p>
                {googleCalendar.connected && calendarEmail && (
                  <p className="text-gray-500 text-xs mt-1">
                    {calendarEmail}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {googleCalendar.connected ? (
              <>
                <button
                  onClick={() => navigate('/dashboard?tab=calendar')}
                  className="flex-1 px-5 py-2.5 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Open Calendar & Tasks
                </button>
                <button
                  onClick={handleCalendarDisconnect}
                  disabled={disconnecting === 'calendar'}
                  className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {disconnecting === 'calendar' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </>
            ) : (
              <button
                onClick={handleCalendarConnect}
                disabled={loadingCalendar || googleCalendar.loading}
                className="flex-1 px-5 py-2.5 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 hover:opacity-100"
              >
                {loadingCalendar ? 'Redirecting to Google...' : 'Connect Calendar'}
              </button>
            )}
          </div>
        </div>

        {/* Meta / Facebook */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">Meta / Facebook Ads</h2>
              <p className="text-gray-400 text-sm mt-1">
                Connect your Facebook & Instagram ad accounts
              </p>
            </div>
          </div>

          <button
            onClick={handleMetaConnect}
            disabled={!metaReady || loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition ${
              !metaReady || loading
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {metaReady ? 'Connect' : 'Unavailable'}
          </button>
        </div>

        {/* NOTE: TikTok Ads and Google Ads temporarily disabled to reduce Netlify function load.
            Re-enable by restoring these sections and moving tiktok-ads-auth-start.ts,
            tiktok-ads-auth-callback.ts, google-ads-auth-start.ts, google-ads-auth-callback.ts
            back into netlify/functions. */}

        {/* TikTok Ads - TEMPORARILY DISABLED */}
        {/* <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">TikTok Ads</h2>
              <p className="text-gray-400 text-sm mt-1">
                {tiktokAccount
                  ? `Connected: ${tiktokAccount.account_name || 'TikTok Ads Account'}`
                  : 'Connect your TikTok Ads account to run and track campaigns'}
              </p>
            </div>
          </div>

          {tiktokAccount ? (
            <button
              onClick={() => handleDisconnect('tiktok_ads')}
              disabled={disconnecting === 'tiktok_ads'}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {disconnecting === 'tiktok_ads' ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleTikTokAdsConnect}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-pink-600 hover:bg-pink-700 text-white"
            >
              Connect TikTok Ads
            </button>
          )}
        </div> */}

        {/* Google Ads - TEMPORARILY DISABLED */}
        {/* <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">Google Ads</h2>
              <p className="text-gray-400 text-sm mt-1">
                {googleAdsAccount
                  ? `Connected: ${googleAdsAccount.account_name || 'Google Ads Account'}`
                  : 'Connect your Google Ads account to manage campaigns'}
              </p>
            </div>
          </div>

          {googleAdsAccount ? (
            <button
              onClick={() => handleDisconnect('google_ads')}
              disabled={disconnecting === 'google_ads'}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {disconnecting === 'google_ads' ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleGoogleAdsConnect}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-700 text-white"
            >
              Connect Google Ads
            </button>
          )}
        </div> */}
      </div>

      <p className="text-gray-500 text-xs mt-6">
        Note: All connections are secured with industry-standard OAuth 2.0 authentication.
      </p>
    </div>
    </ProGate>
  );
}
