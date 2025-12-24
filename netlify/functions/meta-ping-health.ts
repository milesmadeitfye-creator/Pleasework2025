/**
 * Meta Health Check - Isolated HTTP-based ping
 *
 * Performs a lightweight Meta API call to verify connection health.
 * Does NOT modify credentials, tokens, or connection flow.
 * Returns normalized status for Overview display.
 */

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getUserMetaConnection } from "./_metaUserToken";
import { okJSON } from "./_headers";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Simple in-memory throttle (10 second cooldown per user)
const lastPingTime = new Map<string, number>();
const THROTTLE_MS = 10000;

interface MetaPingResult {
  ok: boolean;
  connected: boolean;
  healthy: boolean;
  reason?: string;
  checkedAt: string;
  latencyMs?: number;
  meta?: {
    userId?: string;
    name?: string;
  };
  error?: string;
}

/**
 * Timeout wrapper for fetch calls
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout after ' + timeoutMs + 'ms');
    }
    throw error;
  }
}

/**
 * Verify user from Authorization header
 */
async function verifyUser(event: HandlerEvent): Promise<string | null> {
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify with Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('[meta-ping-health] Auth error:', error);
    return null;
  }
}

/**
 * Check if user has valid Meta connection
 */
async function checkMetaHealth(userId: string): Promise<MetaPingResult> {
  const startTime = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    // Load user's Meta connection
    const connection = await getUserMetaConnection(userId);

    if (!connection) {
      return {
        ok: true,
        connected: false,
        healthy: false,
        reason: 'NOT_CONNECTED',
        checkedAt,
      };
    }

    if (!connection.access_token) {
      return {
        ok: true,
        connected: true,
        healthy: false,
        reason: 'NO_TOKEN',
        checkedAt,
      };
    }

    // Check if token is expired
    if (connection.expires_at) {
      const expiresAt = new Date(connection.expires_at);
      const now = new Date();

      if (expiresAt <= now) {
        return {
          ok: true,
          connected: true,
          healthy: false,
          reason: 'TOKEN_EXPIRED',
          checkedAt,
        };
      }
    }

    // Perform lightweight Meta API call
    // Use Graph API /me endpoint - minimal data, fast response
    const metaUrl = `https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${connection.access_token}`;

    const response = await fetchWithTimeout(metaUrl, { method: 'GET' }, 5000);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Check for common Meta API errors
      if (response.status === 401 || response.status === 403) {
        return {
          ok: true,
          connected: true,
          healthy: false,
          reason: 'TOKEN_INVALID',
          checkedAt,
          latencyMs,
        };
      }

      return {
        ok: true,
        connected: true,
        healthy: false,
        reason: 'API_ERROR',
        checkedAt,
        latencyMs,
        error: errorData.error?.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      ok: true,
      connected: true,
      healthy: true,
      checkedAt,
      latencyMs,
      meta: {
        userId: data.id,
        name: data.name,
      },
    };
  } catch (error: any) {
    console.error('[meta-ping-health] Health check error:', error);

    return {
      ok: false,
      connected: null as any,
      healthy: false,
      reason: 'SERVER_ERROR',
      checkedAt,
      error: error?.message || 'Unknown error',
    };
  }
}

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: okJSON,
      body: '',
    };
  }

  try {
    // Verify user authentication
    const userId = await verifyUser(event);

    if (!userId) {
      return {
        statusCode: 401,
        headers: okJSON,
        body: JSON.stringify({
          ok: false,
          connected: null,
          healthy: false,
          reason: 'AUTH_REQUIRED',
          checkedAt: new Date().toISOString(),
          error: 'Authentication required',
        }),
      };
    }

    // Check throttle
    const lastPing = lastPingTime.get(userId);
    const now = Date.now();

    if (lastPing && (now - lastPing) < THROTTLE_MS) {
      const waitMs = THROTTLE_MS - (now - lastPing);
      return {
        statusCode: 429,
        headers: okJSON,
        body: JSON.stringify({
          ok: false,
          connected: null,
          healthy: false,
          reason: 'THROTTLED',
          checkedAt: new Date().toISOString(),
          error: `Please wait ${Math.ceil(waitMs / 1000)}s before pinging again`,
        }),
      };
    }

    // Update throttle timestamp
    lastPingTime.set(userId, now);

    // Perform health check
    const result = await checkMetaHealth(userId);

    return {
      statusCode: 200,
      headers: okJSON,
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error('[meta-ping-health] Handler error:', error);

    return {
      statusCode: 500,
      headers: okJSON,
      body: JSON.stringify({
        ok: false,
        connected: null,
        healthy: false,
        reason: 'INTERNAL_ERROR',
        checkedAt: new Date().toISOString(),
        error: 'Internal server error',
      }),
    };
  }
};
