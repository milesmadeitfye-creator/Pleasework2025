/**
 * Meta Health Check Client
 *
 * Frontend client for pinging Meta connection health.
 * Uses isolated HTTP endpoint, no WebSockets.
 */

import { supabase } from './supabase';

export interface MetaPingResult {
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
 * Ping Meta health endpoint
 */
export async function pingMetaHealth(): Promise<MetaPingResult> {
  try {
    // Get auth token
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      return {
        ok: false,
        connected: false,
        healthy: false,
        reason: 'NOT_AUTHENTICATED',
        checkedAt: new Date().toISOString(),
        error: 'User not authenticated',
      };
    }

    // Call health check endpoint
    const response = await fetch('/.netlify/functions/meta-ping-health', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle non-200 responses
    if (!response.ok) {
      const data = await response.json().catch(() => ({
        ok: false,
        connected: null,
        healthy: false,
        reason: 'HTTP_ERROR',
        checkedAt: new Date().toISOString(),
        error: `HTTP ${response.status}`,
      }));

      return data;
    }

    // Parse JSON response
    const data: MetaPingResult = await response.json();
    return data;
  } catch (error: any) {
    console.error('[metaPing] Error:', error);

    return {
      ok: false,
      connected: false,
      healthy: false,
      reason: 'NETWORK_ERROR',
      checkedAt: new Date().toISOString(),
      error: error?.message || 'Network error',
    };
  }
}
