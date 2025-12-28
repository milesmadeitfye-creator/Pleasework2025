import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase.client';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, Trash2, Users, Building, TrendingUp, Instagram, Facebook, RefreshCw, Music, Calendar, Sparkles, AlertCircle, X as CloseIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { useMetaCredentials } from '../hooks/useMetaCredentials';
import { useSessionUser } from '../hooks/useSessionUser';
import PhoneInput from './common/PhoneInput';
import { MetaConnectWizard } from './meta/MetaConnectWizard';
import { MetaDebugPanel } from './meta/MetaDebugPanel';

// 🔒 ABSOLUTE FALLBACK: Prevent ReferenceError in production
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.metaCredentials = window.metaCredentials ?? null;
}

interface IntegrationDetails {
  externalAccountId?: string;
  connectedAt?: string;
  expiresAt?: string;
  meta?: any;
}

interface IntegrationStatus {
  connected: boolean;
  details?: IntegrationDetails | null;
}

interface IntegrationsResponse {
  meta: IntegrationStatus;
  mailchimp: IntegrationStatus;
  tiktok: IntegrationStatus;
  error?: string;
}

interface MetaAssets {
  connected: boolean;
  requiresReconnect?: boolean;
  profile?: {
    id: string;
    name: string;
  };
  businesses?: Array<{
    id: string;
    name: string;
  }>;
  adAccounts?: Array<{
    id: string;
    name: string;
    account_status: number;
  }>;
  pages?: Array<{
    id: string;
    name: string;
    picture?: string;
    link?: string;
  }>;
  instagramAccounts?: Array<{
    id: string;
    username: string;
    profile_picture_url?: string;
  }>;
}

interface ConnectedAccountsProps {
  onNavigateToBilling?: () => void;
}

export default function ConnectedAccounts({ onNavigateToBilling }: ConnectedAccountsProps = {}) {
  const { user: authUser } = useAuth();
  const { user, loading: authLoading } = useSessionUser();
  const navigate = useNavigate();

  // Use unified connection status from connected_accounts table
  const metaConn = useConnectionStatus('meta');
  const googleCalConn = useConnectionStatus('google_calendar');

  // Check meta_credentials table directly (single source of truth)
  const { meta, isMetaConnected, isMetaConfigured, loading: metaLoading, error: metaError } = useMetaCredentials(user?.id);

  // 🔒 HARD SAFETY: ensure metaCredentials always exists (prevents ReferenceError)
  const metaCredentials = meta ?? null;

  const [metaStatus, setMetaStatus] = useState<IntegrationStatus>({ connected: false });
  const [mailchimpStatus, setMailchimpStatus] = useState<IntegrationStatus>({ connected: false });
  const [tiktokStatus, setTiktokStatus] = useState<IntegrationStatus>({ connected: false });
  const [metaAssets, setMetaAssets] = useState<MetaAssets | null>(null);
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // RPC-based Meta connection state (single source of truth)
  const [metaRpcStatus, setMetaRpcStatus] = useState<{
    connected: boolean;
    data: any;
    lastChecked: string | null;
  }>({
    connected: false,
    data: null,
    lastChecked: null,
  });

  // Log Meta credentials errors for debugging
  useEffect(() => {
    if (metaError) {
      console.warn('[ConnectedAccounts] Meta credentials read error:', metaError);
    }
  }, [metaError]);
  const [mailchimpConnection, setMailchimpConnection] = useState<any | null>(null);
  const [mailchimpLists, setMailchimpLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [aiConnected, setAiConnected] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('1');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [showPhoneBanner, setShowPhoneBanner] = useState(true);
  const [showMetaWizard, setShowMetaWizard] = useState(false);

  const fetchMailchimpConnection = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "mailchimp")
      .maybeSingle();

    if (error) {
      console.error("fetchMailchimpConnection error", error);
      return;
    }

    setMailchimpConnection(data);
    if (data?.mailchimp_list_id) {
      setSelectedListId(data.mailchimp_list_id);
    }
  };

  const isMailchimpConnected = !!mailchimpConnection;

  useEffect(() => {
    if (user) {
      fetchIntegrationsStatus();
      fetchMailchimpConnection();
      checkGoogleConnection();
      fetchUserPhone();
    }
  }, [user?.id]);

  const checkGoogleConnection = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.provider_token) {
        setGoogleConnected(true);
      } else {
        setGoogleConnected(false);
      }
    } catch (err) {
      console.error('Error checking Google connection:', err);
      setGoogleConnected(false);
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Security: Only accept messages from same origin
      if (event.origin !== window.location.origin) {
        console.warn('[ConnectedAccounts] Ignored message from different origin:', event.origin);
        return;
      }

      const data = event.data;
      if (!data) return;

      if (data.provider === "meta") {
        if (data.status === "success") {
          fetchIntegrationsStatus();
          metaConn.refresh(); // Refresh the connection status from both tables
          setSuccessMessage("Meta account connected successfully");
        } else {
          console.error("Meta connect error", data.error);
          setError(data.error || "Failed to connect Meta");
        }
      } else if (data.provider === "mailchimp") {
        if (data.status === "success") {
          console.log("Mailchimp connected via postMessage");
          fetchMailchimpConnection();
          setSuccessMessage("Mailchimp connected successfully");
          setTimeout(() => {
            navigate('/dashboard?tab=fan-communication');
          }, 1500);
        } else {
          console.error("Mailchimp connect error", data.message || data.error);
          setError(data.message || data.error || "Failed to connect Mailchimp");
        }
      } else if (data.provider === "tiktok") {
        if (data.status === "success") {
          console.log("TikTok connected via postMessage");
          fetchIntegrationsStatus();
          setSuccessMessage("TikTok connected successfully");
        } else {
          console.error("TikTok connect error", data.error);
          setError(data.error || "Failed to connect TikTok");
        }
      } else if (data.type === "GOOGLE_CALENDAR_CONNECTED") {
        if (data.status === "success") {
          console.log("Google Calendar connected via postMessage");

          // Give database a moment to commit the transaction
          setTimeout(() => {
            googleCalConn.refresh();
            console.log('[ConnectedAccounts] Google Calendar status refreshed');
          }, 500);

          // Also do a second check after a bit longer to ensure DB consistency
          setTimeout(() => {
            googleCalConn.refresh();
            console.log('[ConnectedAccounts] Google Calendar status double-checked');
          }, 1500);

          setSuccessMessage("Google Calendar connected successfully");
        } else {
          console.error("Google Calendar connect error", data.error);
          setError(data.error || "Failed to connect Google Calendar");
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [googleCalConn, metaConn, metaCredentials, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaCode = params.get('meta_code');
    const metaState = params.get('meta_state');
    const metaError = params.get('meta_error');
    const metaErrorDescription = params.get('meta_error_description');
    const metaStatusParam = params.get('meta_status');
    const mailchimpStatusParam = params.get('mailchimp_status');
    const reason = params.get('reason');

    // Handle Meta OAuth callback with code
    if (metaCode) {
      (async () => {
        try {
          setActionLoading(true);
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;

          if (!token) {
            setError('Not logged in. Please sign in and try again.');
            window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
            return;
          }

          const response = await fetch('/.netlify/functions/meta-connect-complete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              code: metaCode,
              state: metaState,
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            console.error('[ConnectedAccounts] Meta connect failed:', result);

            // Show detailed error message for debugging
            let errorMsg = 'Meta connection failed. Please try again.';

            if (result.error === 'META_TOKEN_EXCHANGE_FAILED') {
              errorMsg = 'Failed to complete authorization with Meta. Please try again.';
            } else if (result.error === 'META_USER_INFO_FAILED') {
              errorMsg = 'Failed to retrieve Meta account information. Please try again.';
            } else if (result.error === 'META_STORE_FAILED') {
              // Include the specific error message from the backend
              errorMsg = result.message
                ? `Failed to save Meta connection: ${result.message}`
                : 'Failed to save Meta connection. Please check the logs for details.';

              // Log additional details to console for debugging
              if (result.details) {
                console.error('[ConnectedAccounts] Error details:', result.details);
              }
              if (result.code) {
                console.error('[ConnectedAccounts] Error code:', result.code);
              }
              if (result.step) {
                console.error('[ConnectedAccounts] Failed at step:', result.step);
              }
            }

            setError(errorMsg);
          } else {
            console.log('[ConnectedAccounts] Meta connected successfully:', result);
            setSuccessMessage(`Meta account connected successfully! Found ${result.adAccountsCount} ad account(s).`);
            await fetchIntegrationsStatus();
            await fetchMetaAssets();
            metaConn.refresh(); // Refresh the connection status from connected_accounts table
          }
        } catch (err) {
          console.error('[ConnectedAccounts] Meta connect error:', err);
          setError('Failed to complete Meta connection. Please try again.');
        } finally {
          setActionLoading(false);
          window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
        }
      })();
      return;
    }

    // Handle Meta OAuth error
    if (metaError) {
      console.error('[ConnectedAccounts] Meta OAuth error:', metaError, metaErrorDescription);
      setError(`Meta authorization failed: ${metaErrorDescription || metaError}`);
      window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
      return;
    }

    if (metaStatusParam === 'connected') {
      setSuccessMessage('Meta account connected successfully!');
      fetchIntegrationsStatus();
      window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
    } else if (mailchimpStatusParam === 'connected') {
      setSuccessMessage('Mailchimp account connected successfully!');
      fetchIntegrationsStatus();
      window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
    } else if (metaStatusParam === 'error') {
      const errorMessages: Record<string, string> = {
        not_authenticated: 'Please sign in to your Ghoste account before connecting Meta.',
        config_missing: 'Meta connection is not configured. Please contact support.',
        missing_code: 'Authorization failed. Please try again.',
        invalid_state: 'Session expired. Please try again.',
        token_exchange_failed: 'Failed to complete authorization. Please try again.',
        user_info_failed: 'Failed to retrieve account information. Please try again.',
        db_error: 'Failed to save connection. Please try again.',
        no_user: 'User session not found. Please sign in again.',
      };
      setError(errorMessages[reason || ''] || 'Connection failed. Please try again or contact support.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
    } else if (mailchimpStatusParam === 'error') {
      const errorMessages: Record<string, string> = {
        server_config: 'Mailchimp is not configured. Please contact support.',
        missing_code: 'Authorization failed. Please try again.',
        missing_user: 'User not found. Please try again.',
        token_exchange_failed: 'Failed to complete authorization. Please try again.',
        metadata_failed: 'Failed to retrieve account information. Please try again.',
        db_error: 'Failed to save connection. Please try again.',
        no_user: 'User session not found. Please sign in again.',
        invalid_state: 'Session expired. Please try again.',
        unexpected: 'Connection failed. Please try again.',
      };
      setError(errorMessages[reason || ''] || 'Mailchimp connection failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=accounts');
    }
  }, []);

  const fetchIntegrationsStatus = async () => {
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setMetaStatus({ connected: false });
        setMetaRpcStatus({ connected: false, data: null, lastChecked: null });
        setMailchimpStatus({ connected: false });
        setTiktokStatus({ connected: false });
        setLoading(false);
        return;
      }

      // Fetch Meta status via RPC (single source of truth)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_meta_connection_status');

      const now = new Date().toISOString();

      if (rpcError) {
        console.error('[ConnectedAccounts] Meta RPC error:', rpcError);
        setMetaRpcStatus({ connected: false, data: null, lastChecked: now });
        setMetaStatus({ connected: false });
        setMetaAssets(null);
      } else {
        const isConnected = Boolean(rpcData?.is_connected) === true;
        setMetaRpcStatus({
          connected: isConnected,
          data: rpcData,
          lastChecked: now,
        });
        setMetaStatus({ connected: isConnected });

        // Set assets if available
        if (isConnected && rpcData) {
          setMetaAssets({
            connected: true,
            adAccounts: rpcData.ad_account_id ? [{ id: rpcData.ad_account_id, name: rpcData.ad_account_name || '', account_status: 1 }] : [],
            pages: rpcData.page_id ? [{ id: rpcData.page_id, name: rpcData.page_name || '' }] : [],
            instagramAccounts: rpcData.instagram_account_count > 0 ? Array(rpcData.instagram_account_count).fill({}) : [],
          } as MetaAssets);
        } else {
          setMetaAssets(null);
        }
      }

      // Fetch other integrations
      const response = await fetch('/.netlify/functions/get-integrations-status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data: IntegrationsResponse = await response.json();
        setMailchimpStatus(data.mailchimp);
        setTiktokStatus(data.tiktok);
      } else {
        console.error('Failed to fetch integrations status:', response.status);
        setMailchimpStatus({ connected: false });
        setTiktokStatus({ connected: false });
      }
    } catch (err) {
      console.error('Error in fetchIntegrationsStatus:', err);
      setMetaStatus({ connected: false });
      setMetaRpcStatus({ connected: false, data: null, lastChecked: new Date().toISOString() });
      setMailchimpStatus({ connected: false });
      setTiktokStatus({ connected: false });
      setMetaAssets(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetaAssets = async () => {
    setAssetsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session for refreshing Meta assets');
        setError('Please sign in to refresh Meta assets.');
        return;
      }

      const response = await fetch('/.netlify/functions/meta-refresh-assets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('[Meta Refresh] HTTP error:', response.status);
        setError('Could not refresh Meta assets. Please try again.');
        return;
      }

      const data = await response.json();

      // Check if Meta is truly disconnected
      if (data.status === 'disconnected') {
        console.log('[Meta Refresh] Meta is disconnected:', data.error);
        setMetaStatus({ connected: false });
        setMetaAssets(null);
        setError(data.message || 'Meta account is not connected.');
        // Refresh connection status to update UI
        metaConn.refresh();
        return;
      }

      // Status is 'connected' - check if refresh succeeded or failed
      if (data.success && data.counts) {
        // Successful refresh - update assets with new counts
        setMetaAssets({
          connected: true,
          adAccounts: Array(data.counts.adAccounts || 0).fill(null),
          pages: Array(data.counts.pages || 0).fill(null),
          instagramAccounts: Array(data.counts.instagramProfiles || 0).fill(null),
        } as MetaAssets);

        // Update meta status with new counts
        setMetaStatus({
          connected: true,
          details: {
            meta: {
              businesses: data.counts.businesses,
              pages: data.counts.pages,
              instagramProfiles: data.counts.instagramProfiles,
              adAccounts: data.counts.adAccounts,
            }
          }
        });

        setSuccessMessage('Meta assets refreshed successfully!');
        // Refresh connection status after fetching assets (counts may have updated)
        metaConn.refresh();
      } else if (data.warning === 'refresh_failed') {
        // Refresh failed but account is still connected
        console.warn('[Meta Refresh] Refresh failed but connection is still active:', data.error);
        setError(data.message || 'Meta assets refresh failed, but your account is still connected.');
        // Keep existing status - don't mark as disconnected
      }
    } catch (err) {
      console.error('[Meta Refresh] Unexpected error:', err);
      // Network/unexpected errors don't mean the account is disconnected
      setError('Meta assets refresh failed, but your account is still connected.');
    } finally {
      setAssetsLoading(false);
    }
  };

  const fetchUserPhone = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('phone, phone_country_code')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[ConnectedAccounts] Error fetching phone:', error);
      return;
    }

    if (data?.phone) {
      setUserPhone(data.phone);
      // Parse phone to extract country code and digits
      const fullPhone = data.phone;
      if (fullPhone.startsWith('+')) {
        const match = fullPhone.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          setPhoneCountryCode(match[1]);
          setPhoneDigits(match[2]);
        }
      }
    }
  };

  const savePhoneInConnectedAccounts = async () => {
    if (!user?.id) return;

    if (!phoneDigits || phoneDigits.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    setSavingPhone(true);
    setError(null);

    try {
      const fullPhone = `+${phoneCountryCode}${phoneDigits}`;

      const { error: dbError } = await supabase
        .from('user_profiles')
        .update({
          phone: fullPhone,
          phone_country_code: phoneCountryCode,
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Also update auth metadata
      await supabase.auth.updateUser({
        data: {
          phone: fullPhone,
        },
      });

      setUserPhone(fullPhone);
      setSuccessMessage('Phone number saved! You can now sync Ghoste AI Mobile.');
    } catch (err: any) {
      console.error('Error saving phone:', err);
      setError('Failed to save phone number: ' + err.message);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleConnectMeta = async () => {
    if (!user) {
      setError('Please sign in to your Ghoste account before connecting Meta.');
      navigate('/auth');
      return;
    }

    try {
      const url = `/.netlify/functions/meta-auth-start?user_id=${encodeURIComponent(user.id)}`;
      window.open(url, "metaConnect", "width=600,height=700");
    } catch (err) {
      console.error('Error connecting Meta:', err);
      setError('Failed to connect Meta account. Please try again.');
    }
  };

  const handleDisconnectMeta = async () => {
    if (!confirm('Are you sure you want to disconnect your Meta account? This will revoke permissions and remove access to your ad accounts and campaigns.')) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/meta-disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hard_reset: false }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to disconnect');
      }

      // Immediately clear ALL Meta state to force UI update
      setMetaStatus({ connected: false });
      setMetaAssets(null);

      // Show success message
      const message = result.revoked_permissions
        ? 'Meta disconnected and permissions revoked'
        : 'Meta disconnected (local data cleared)';
      setSuccessMessage(message);

      // Refresh from backend to ensure consistency
      await fetchIntegrationsStatus();
      metaConn.refresh(); // Refresh connection status from connected_accounts table
    } catch (err) {
      console.error('Error disconnecting Meta:', err);
      setError('Failed to disconnect Meta account. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHardResetMeta = async () => {
    if (!confirm('⚠️ HARD RESET will delete ALL Meta credentials and assets. You will need to reconnect Meta from scratch. Continue?')) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/meta-hard-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || result.error || 'Failed to reset');
      }

      // Immediately clear ALL Meta state to force UI update
      setMetaStatus({ connected: false });
      setMetaAssets(null);

      setSuccessMessage('✅ Meta hard reset complete - reconnect to restore');

      // Refresh from backend to ensure consistency
      await fetchIntegrationsStatus();
      metaConn.refresh();
    } catch (err) {
      console.error('Error resetting Meta:', err);
      setError('Failed to reset Meta connection. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnectMailchimp = async () => {
    if (!user) {
      setError('Please sign in to your Ghoste account before connecting Mailchimp.');
      navigate('/auth');
      return;
    }

    try {
      const url = `/.netlify/functions/mailchimp-auth-start?user_id=${encodeURIComponent(user.id)}`;
      window.open(url, "mailchimpConnect", "width=600,height=700");
    } catch (err) {
      console.error('Error connecting Mailchimp:', err);
      setError('Failed to connect Mailchimp account. Please try again.');
      setActionLoading(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    if (!user) {
      setError('Please sign in to your Ghoste account before connecting Google Calendar.');
      navigate('/auth');
      return;
    }

    try {
      setActionLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Session expired. Please sign in again.');
        navigate('/auth');
        return;
      }

      const response = await fetch('/.netlify/functions/gcal-start-connect', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok || !result.url) {
        console.error('[ConnectedAccounts] Google Calendar connect failed:', result);
        setError('Failed to start Google Calendar connection. Please try again.');
        setActionLoading(false);
        return;
      }

      window.open(result.url, "googleCalendarConnect", "width=600,height=700");
      setActionLoading(false);
    } catch (err) {
      console.error('Error connecting Google Calendar:', err);
      setError('Failed to connect Google Calendar. Please try again.');
      setActionLoading(false);
    }
  };

  const handleDisconnectMailchimp = async () => {
    if (!confirm('Are you sure you want to disconnect your Mailchimp account? This will remove access to your audience lists.')) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !user) {
        throw new Error('Not authenticated');
      }

      // Delete from user_integrations
      const { error } = await supabase
        .from('user_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', 'mailchimp');

      if (error) {
        throw new Error('Failed to disconnect');
      }

      setSuccessMessage('Mailchimp account disconnected successfully');
      await fetchMailchimpConnection();
    } catch (err) {
      console.error('Error disconnecting Mailchimp:', err);
      setError('Failed to disconnect Mailchimp account. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchMailchimpLists = async () => {
    if (!user || !mailchimpConnection) return;

    setLoadingLists(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const res = await fetch('/.netlify/functions/mailchimp-get-lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const text = await res.text();

      let result: any;
      try {
        result = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        console.error('Error parsing Mailchimp lists response:', parseErr, text.substring(0, 200));
        throw new Error('Mailchimp did not return valid JSON. Please try again.');
      }

      if (!res.ok || result.success === false) {
        console.error('Mailchimp lists fetch failed:', res.status, result);
        const errorMessage = result.message || result.error || 'Failed to load Mailchimp audiences. Please check your connection.';
        throw new Error(errorMessage);
      }

      const lists = result.lists || [];

      setMailchimpLists(lists);

      if (lists.length === 0) {
        console.log('No Mailchimp audiences found for this account');
      }
    } catch (err: any) {
      console.error('Error fetching Mailchimp lists:', err);
      setError(err.message || 'Failed to load Mailchimp audiences. Please try reconnecting.');
    } finally {
      setLoadingLists(false);
    }
  };

  const handleSaveAudience = async (list: any) => {
    if (!user) return;

    try {
      setSavingAudience(true);
      setError(null);
      setShowListDropdown(false);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const res = await fetch('/.netlify/functions/mailchimp-save-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ listId: list.id, listName: list.name }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to save audience');
      }

      setSelectedListId(list.id);
      setSuccessMessage(`Default audience saved: ${list.name}`);
      await fetchMailchimpConnection();
    } catch (err: any) {
      console.error('Error saving audience:', err);
      setError(`Failed to save audience: ${err.message}`);
    } finally {
      setSavingAudience(false);
    }
  };

  const handleConnectTikTok = async () => {
    if (!user) {
      setError('Please sign in to your Ghoste account before connecting TikTok.');
      navigate('/auth');
      return;
    }

    try {
      const functionUrl = `/.netlify/functions/tiktok-login-start?user_id=${encodeURIComponent(user.id)}`;

      // Fetch the TikTok OAuth URL from our function
      const response = await fetch(functionUrl);
      const data = await response.json().catch(() => ({}));

      if (data.code === 'NOT_CONFIGURED' || !data.success) {
        setError('TikTok integration is not configured yet. Please contact Ghoste support.');
        return;
      }

      if (!data.url) {
        setError('Failed to get TikTok authorization URL. Please try again.');
        return;
      }

      // Open the TikTok OAuth URL in a popup (browser redirect, not fetch)
      window.open(data.url, "tiktokConnect", "width=600,height=700");
    } catch (err) {
      console.error('Error connecting TikTok:', err);
      setError('Failed to connect TikTok account. Please try again.');
      setActionLoading(false);
    }
  };

  const handleDisconnectTikTok = async () => {
    if (!confirm('Are you sure you want to disconnect your TikTok account?')) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !user) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/.netlify/functions/tiktok-disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      setSuccessMessage('TikTok account disconnected successfully');
      await fetchIntegrationsStatus();
    } catch (err) {
      console.error('Error disconnecting TikTok:', err);
      setError('Failed to disconnect TikTok account. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const syncGhosteAI = async () => {
    setActionLoading(true);
    setError(null);

    try {
      if (!userPhone) {
        setError("No phone number found. Please add a phone number to your account to sync Ghoste AI Mobile.");
        return;
      }

      // Call ai-sync-text endpoint to send SMS
      const res = await fetch("/.netlify/functions/ai-sync-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: userPhone, type: "welcome" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI sync failed");

      setAiConnected(true);
      setSuccessMessage(aiConnected
        ? "Sync text sent successfully!"
        : "Ghoste AI Mobile synced successfully! Check your phone for confirmation.");
    } catch (err: any) {
      console.error("AI Connect Error:", err);
      setError("Failed to sync Ghoste AI Mobile. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // Derive Meta connection status from meta_credentials table (source of truth)
  // Show loading only while auth is still loading or meta is loading
  if (authLoading || metaLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center py-12 text-gray-400">Loading...</div>
      </div>
    );
  }

  // 🔒 ABSOLUTE SAFETY: wrap render in try-catch to prevent white screen
  try {
    return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Connected Accounts</h1>
        <p className="text-gray-400">Manage your connected platforms and integrations</p>
      </div>

      {/* Banner logic based on Meta connection state */}
      {!metaRpcStatus.connected && !loading && !error && !successMessage && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400">Meta account setup incomplete. Please connect your Meta account.</p>
          </div>
        </div>
      )}

      {metaRpcStatus.connected && !metaRpcStatus.data?.ad_account_id && !error && !successMessage && (
        <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-blue-400">Meta account connected. Finish asset configuration to start campaigns.</p>
          </div>
        </div>
      )}

      {/* Show error banner only if there's an actual error */}
      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            ×
          </button>
        </div>
      )}

      {/* Show success banner when config is complete */}
      {(successMessage || (metaRpcStatus.connected && metaRpcStatus.data?.ad_account_id)) && !error && (
        <div className="mb-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-400">
              {successMessage || 'Meta configuration saved! Your account is ready for campaigns.'}
            </p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-400 hover:text-green-300"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Meta / Facebook & Instagram connection card */}
        <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Facebook className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Meta / Facebook & Instagram</h3>
                <p className="text-sm text-gray-400">
                  {loading ? 'Checking...' : metaRpcStatus.connected ? 'Connected' : 'Not connected'}
                </p>
                {metaRpcStatus.lastChecked && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Last checked: {new Date(metaRpcStatus.lastChecked).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            {metaRpcStatus.connected && metaRpcStatus.data?.has_valid_token !== false && (
              <CheckCircle className="w-6 h-6 text-green-400" />
            )}
          </div>

          {metaRpcStatus.connected && metaRpcStatus.data && (
            <div className="mb-4 p-3 bg-ghoste-bg rounded-lg">
              <p className="text-sm text-gray-400">Connected account</p>
              <p className="text-white font-medium">
                {metaRpcStatus.data.ad_account_name || metaRpcStatus.data.page_name || 'Meta Account'}
              </p>
              {metaRpcStatus.data.ad_account_id && (
                <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                  {metaRpcStatus.data.ad_account_id && (
                    <p>Ad Account: {metaRpcStatus.data.ad_account_name || metaRpcStatus.data.ad_account_id}</p>
                  )}
                  {metaRpcStatus.data.page_id && (
                    <p>Facebook Page: {metaRpcStatus.data.page_name || metaRpcStatus.data.page_id}</p>
                  )}
                  {metaRpcStatus.data.instagram_account_count > 0 && (
                    <p>{metaRpcStatus.data.instagram_account_count} Instagram account{metaRpcStatus.data.instagram_account_count !== 1 ? 's' : ''}</p>
                  )}
                  {metaRpcStatus.data.pixel_id && (
                    <p>Pixel: {metaRpcStatus.data.pixel_id}</p>
                  )}
                  {metaRpcStatus.data.has_valid_token === false && (
                    <p className="text-yellow-400 mt-1">⚠ Token expired - reconnect needed</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Meta Onboarding Checklist - Show when connected */}
          {metaRpcStatus.connected && (
            <div className="mb-4 p-4 bg-ghoste-bg rounded-lg border border-ghoste-border">
              <h4 className="text-sm font-semibold text-white mb-3">Meta Setup Progress</h4>

              {/* Setup Steps (Required for configuration) */}
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Setup</p>
                <ul className="space-y-2">
                  {[
                    {
                      id: 1,
                      label: 'Connect Meta account',
                      completed: metaRpcStatus.connected
                    },
                    {
                      id: 2,
                      label: 'Select primary ad account',
                      completed: !!(metaRpcStatus.data?.ad_account_id)
                    },
                    {
                      id: 3,
                      label: 'Select Facebook page',
                      completed: !!(metaRpcStatus.data?.page_id)
                    },
                    {
                      id: 4,
                      label: 'Select Instagram account (optional)',
                      completed: (metaRpcStatus.data?.instagram_account_count ?? 0) > 0
                    },
                    {
                      id: 5,
                      label: 'Select Meta Pixel (optional)',
                      completed: !!(metaRpcStatus.data?.pixel_id)
                    },
                  ].map((step) => (
                    <li key={step.id} className="flex items-center gap-3 text-sm">
                      <span className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
                        step.completed
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-700 text-gray-400'
                      }`}>
                        {step.completed ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <span className="text-xs">{step.id}</span>
                        )}
                      </span>
                      <span className={step.completed ? 'text-white' : 'text-gray-400'}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Milestones (For Meta review, not required for configuration) */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Recommended for Meta Review</p>
                <ul className="space-y-2">
                  {[
                    {
                      id: 6,
                      label: 'Create at least one campaign',
                      completed: false
                    },
                    {
                      id: 7,
                      label: 'Generate API usage for 15 days',
                      completed: false
                    },
                  ].map((step) => (
                    <li key={step.id} className="flex items-center gap-3 text-sm">
                      <span className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${
                        step.completed
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}>
                        {step.completed ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <span className="text-xs">{step.id}</span>
                        )}
                      </span>
                      <span className={step.completed ? 'text-gray-300' : 'text-gray-500'}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Meta Debug Panel - Collapsible, always available */}
          <details className="mb-4 bg-slate-800/30 border border-slate-700 rounded-lg">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-300 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors select-none">
              Meta Debug
            </summary>
            <div className="px-4 py-3 border-t border-slate-700">
              <MetaDebugPanel />
            </div>
          </details>

          <div className="space-y-3">
            {!metaRpcStatus.connected ? (
              <button
                onClick={handleConnectMeta}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect Meta
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowMetaWizard(true)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Building className="w-4 h-4" />
                  Configure Assets
                </button>
                <button
                  onClick={fetchMetaAssets}
                  disabled={assetsLoading}
                  className="w-full px-4 py-2 bg-ghoste-border hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${assetsLoading ? 'animate-spin' : ''}`} />
                  Refresh Assets
                </button>
                <button
                  onClick={handleDisconnectMeta}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Disconnect
                </button>
                {/* Admin-only: Hard Reset button (only for dev/admin users) */}
                {user?.email === 'milesdorre5@gmail.com' && (
                  <button
                    onClick={handleHardResetMeta}
                    disabled={actionLoading}
                    className="w-full px-3 py-2 bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Hard Reset Meta (Admin)
                  </button>
                )}
              </>
            )}
          </div>

          {metaAssets && (
            <div className="mt-4 space-y-2 text-xs text-white/60">
              <p>
                {metaAssets.adAccounts?.length || 0} ad account{metaAssets.adAccounts?.length === 1 ? "" : "s"} ·{" "}
                {metaAssets.pages?.length || 0} Facebook Page{metaAssets.pages?.length === 1 ? "" : "s"} ·{" "}
                {metaAssets.instagramAccounts?.length || 0} Instagram profile{metaAssets.instagramAccounts?.length === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>

        {/* Mailchimp Card */}
        <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Mailchimp</h3>
                <p className="text-sm text-gray-400">
                  {isMailchimpConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            {isMailchimpConnected && (
              <CheckCircle className="w-6 h-6 text-green-400" />
            )}
          </div>

          {isMailchimpConnected && mailchimpConnection && (
            <div className="mb-4 space-y-3">
              <div className="p-3 bg-ghoste-bg rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-400">Status</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    mailchimpConnection.mailchimp_status === 'active'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {mailchimpConnection.mailchimp_status === 'active' ? 'Active' : 'Pending Setup'}
                  </span>
                </div>
                {mailchimpConnection.data_center && (
                  <p className="text-xs text-gray-500">
                    Data Center: {mailchimpConnection.data_center}
                  </p>
                )}
                {mailchimpConnection.created_at && (
                  <p className="text-xs text-gray-500">
                    Connected {new Date(mailchimpConnection.created_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="p-3 bg-ghoste-bg rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Default Audience</label>
                  {mailchimpLists.length > 0 && (
                    <button
                      onClick={fetchMailchimpLists}
                      disabled={loadingLists}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                    >
                      {loadingLists ? 'Loading...' : 'Refresh'}
                    </button>
                  )}
                </div>

                {mailchimpLists.length === 0 ? (
                  <button
                    type="button"
                    onClick={fetchMailchimpLists}
                    disabled={loadingLists}
                    className="inline-flex items-center justify-between w-full rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    <span>{loadingLists ? 'Loading...' : 'Load Audiences'}</span>
                    <RefreshCw className={`w-3 h-3 ${loadingLists ? 'animate-spin' : ''}`} />
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowListDropdown(!showListDropdown)}
                        disabled={savingAudience}
                        className="inline-flex items-center justify-between w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900 transition-colors disabled:opacity-50"
                      >
                        <span>
                          {mailchimpLists.find((l) => l.id === selectedListId)?.name ||
                            'Select an audience'}
                        </span>
                        <span className="ml-2 text-[10px] opacity-70">▼</span>
                      </button>

                      {showListDropdown && (
                        <div className="absolute z-20 mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 shadow-lg max-h-64 overflow-auto">
                          {mailchimpLists.map((list) => (
                            <button
                              key={list.id}
                              type="button"
                              onClick={() => handleSaveAudience(list)}
                              disabled={savingAudience}
                              className="w-full text-left px-3 py-2 text-xs text-slate-100 hover:bg-slate-800 flex items-center justify-between disabled:opacity-50"
                            >
                              <span>{list.name}</span>
                              {typeof list.stats?.member_count === 'number' && (
                                <span className="ml-2 text-[10px] text-slate-400">
                                  {list.stats.member_count} contacts
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedListId && mailchimpConnection.mailchimp_list_name && (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        <span className="text-gray-400">
                          Using: <span className="text-white">{mailchimpConnection.mailchimp_list_name}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {!isMailchimpConnected ? (
              <button
                onClick={handleConnectMailchimp}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect Mailchimp
              </button>
            ) : (
              <button
                onClick={handleDisconnectMailchimp}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* TikTok Card */}
        <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-pink-500/10 rounded-lg flex items-center justify-center">
                <Music className="w-6 h-6 text-pink-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">TikTok</h3>
                <p className="text-sm text-gray-400">
                  {tiktokStatus.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            {tiktokStatus.connected && (
              <CheckCircle className="w-6 h-6 text-green-400" />
            )}
          </div>

          {tiktokStatus.connected && tiktokStatus.details && (
            <div className="mb-4 p-3 bg-ghoste-bg rounded-lg">
              <p className="text-sm text-gray-400">Connected account</p>
              <p className="text-white font-medium">
                {tiktokStatus.details.meta?.username ? `@${tiktokStatus.details.meta.username}` : tiktokStatus.details.meta?.display_name || 'TikTok Account'}
              </p>
              {tiktokStatus.details.connectedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Connected {new Date(tiktokStatus.details.connectedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {!tiktokStatus.connected ? (
              <button
                onClick={handleConnectTikTok}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect TikTok
              </button>
            ) : (
              <button
                onClick={handleDisconnectTikTok}
                disabled={actionLoading}
                className="w-full px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Google Calendar Card */}
        <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Google Calendar</h3>
                <p className="text-sm text-gray-400">
                  {googleCalConn.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            {googleCalConn.connected && (
              <CheckCircle className="w-6 h-6 text-green-400" />
            )}
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Sync your Ghoste tasks and releases to your real calendar.
          </p>

          <button
            onClick={() => {
              if (googleCalConn.connected) {
                navigate('/dashboard?tab=calendar');
              } else {
                handleConnectGoogleCalendar();
              }
            }}
            disabled={googleCalConn.loading || actionLoading}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Calendar className="w-4 h-4" />
            {actionLoading ? 'Connecting...' : googleCalConn.connected ? 'Open Calendar & Tasks' : 'Connect Calendar'}
          </button>
        </div>

        {/* Ghoste AI Mobile Card */}
        <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6">
          {/* Phone Setup Block - Show when no phone */}
          {!userPhone && (
            <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <h4 className="text-sm font-semibold text-purple-300 mb-2">Set up your phone for Ghoste AI Mobile</h4>
              <p className="text-xs text-gray-400 mb-3">
                We'll use this number for Ghoste AI sync texts and 2FA.
              </p>
              <PhoneInput
                value={phoneDigits}
                countryCode={phoneCountryCode}
                onChangePhone={setPhoneDigits}
                onChangeCountryCode={setPhoneCountryCode}
                className="mb-3"
              />
              <button
                onClick={savePhoneInConnectedAccounts}
                disabled={savingPhone}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPhone ? 'Saving...' : 'Save Phone Number'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Ghoste AI Mobile</h3>
                <p className="text-sm flex items-center gap-2">
                  {userPhone ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                      <span className="text-green-400">
                        Phone connected: {userPhone.replace(/(\d{1,3})(\d+)(\d{4})$/, '$1 •••• ••$3')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      <span className="text-gray-400">No phone number</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            {userPhone && (
              <CheckCircle className="w-6 h-6 text-green-400" />
            )}
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Sync Ghoste AI to your mobile number and unlock SMS-powered automation.
          </p>

          <div className="space-y-3">
            {userPhone ? (
              !aiConnected ? (
                <button
                  onClick={syncGhosteAI}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sync with Ghoste AI Mobile
                </button>
              ) : (
                <button
                  onClick={syncGhosteAI}
                  disabled={actionLoading}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Sync Text
                </button>
              )
            ) : (
              <div className="text-sm text-amber-400 text-center">
                Add phone number above to enable sync
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meta Connect Wizard - Show when opened */}
      {metaRpcStatus.connected && showMetaWizard && (
        <div className="mt-6">
          <div className="bg-ghoste-dark border border-ghoste-border rounded-lg p-6 relative">
            <button
              onClick={() => setShowMetaWizard(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Close wizard"
            >
              <CloseIcon className="w-5 h-5 text-gray-400" />
            </button>
            <MetaConnectWizard
              onComplete={(result) => {
                console.log('[ConnectedAccounts] Meta wizard completed:', result);
                setSuccessMessage('Meta configuration saved! Your account is ready for campaigns.');

                // Refresh Meta connection status
                metaConn.refresh();
                fetchMetaAssets();

                // Close wizard
                setShowMetaWizard(false);

                // Scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onCancel={() => setShowMetaWizard(false)}
            />
          </div>
        </div>
      )}
    </div>
    );
  } catch (e) {
    console.error('[ConnectedAccounts] render crash:', e);
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Profile temporarily unavailable</h2>
          <p className="text-gray-400 mb-4">
            Please refresh the page. If this keeps happening, visit App Health to send a diagnostic report.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-ghoste-accent text-white rounded-lg hover:opacity-80"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
}
