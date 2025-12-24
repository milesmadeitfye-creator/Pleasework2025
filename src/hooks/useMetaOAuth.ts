import { useEffect, useState, useCallback } from 'react';
import {
  buildMetaAuthUrl,
  generateOAuthState,
  getUserMetaConnection,
  upsertUserMetaConnection,
  deleteUserMetaConnection,
  isMetaConnectionExpired,
  type MetaConnection,
  type MetaOAuthData,
} from '../lib/metaOAuth';

const OAUTH_STATE_KEY = 'meta_oauth_state';
const OAUTH_WINDOW_NAME = 'meta_oauth_window';

type UseMetaOAuthReturn = {
  connection: MetaConnection | null;
  isLoading: boolean;
  isConnected: boolean;
  isExpired: boolean;
  error: string | null;
  connectMeta: () => void;
  disconnectMeta: () => Promise<void>;
  refreshConnection: () => Promise<void>;
};

export function useMetaOAuth(): UseMetaOAuthReturn {
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isConnected = !!connection && !!connection.access_token;
  const isExpired = isMetaConnectionExpired(connection);

  // Load connection on mount
  const loadConnection = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const conn = await getUserMetaConnection();
      setConnection(conn);
    } catch (err: any) {
      console.error('[useMetaOAuth] Failed to load connection:', err);
      setError(err.message || 'Failed to load Meta connection');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Security: Only accept messages from our OAuth callback
      // In production, you should verify event.origin matches your domain
      if (!event.data || !event.data.type) {
        return;
      }

      if (event.data.type === 'META_OAUTH_SUCCESS') {
        const data: MetaOAuthData = event.data.data;

        // Verify state matches
        const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (data.state !== storedState) {
          console.error('[useMetaOAuth] State mismatch');
          setError('Invalid OAuth state. Please try again.');
          return;
        }

        // Clear stored state
        sessionStorage.removeItem(OAUTH_STATE_KEY);

        try {
          setIsLoading(true);
          setError(null);

          // Save connection to Supabase
          const conn = await upsertUserMetaConnection({
            meta_user_id: data.meta_user_id,
            access_token: data.access_token,
            token_type: data.token_type,
            expires_at: data.expires_at,
          });

          setConnection(conn);
          console.log('[useMetaOAuth] Meta account connected successfully');
        } catch (err: any) {
          console.error('[useMetaOAuth] Failed to save connection:', err);
          setError(err.message || 'Failed to save Meta connection');
        } finally {
          setIsLoading(false);
        }
      } else if (event.data.type === 'META_OAUTH_ERROR') {
        console.error('[useMetaOAuth] OAuth error:', event.data.error);
        setError(event.data.error || 'Meta authorization failed');
        sessionStorage.removeItem(OAUTH_STATE_KEY);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Open OAuth popup
  const connectMeta = useCallback(() => {
    try {
      setError(null);

      // Check if env vars are configured
      if (!import.meta.env.VITE_META_APP_ID || !import.meta.env.VITE_META_REDIRECT_URI) {
        setError('Meta OAuth is not configured. Please check environment variables.');
        return;
      }

      // Generate and store state
      const state = generateOAuthState();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);

      // Build auth URL
      const authUrl = buildMetaAuthUrl(state);

      // Open popup window
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      window.open(
        authUrl,
        OAUTH_WINDOW_NAME,
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
      );

      console.log('[useMetaOAuth] Opened Meta OAuth popup');
    } catch (err: any) {
      console.error('[useMetaOAuth] Failed to open OAuth popup:', err);
      setError(err.message || 'Failed to start Meta authorization');
    }
  }, []);

  // Disconnect Meta account
  const disconnectMeta = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      await deleteUserMetaConnection();
      setConnection(null);

      console.log('[useMetaOAuth] Meta account disconnected');
    } catch (err: any) {
      console.error('[useMetaOAuth] Failed to disconnect:', err);
      setError(err.message || 'Failed to disconnect Meta account');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh connection from database
  const refreshConnection = useCallback(async () => {
    await loadConnection();
  }, [loadConnection]);

  return {
    connection,
    isLoading,
    isConnected,
    isExpired,
    error,
    connectMeta,
    disconnectMeta,
    refreshConnection,
  };
}
