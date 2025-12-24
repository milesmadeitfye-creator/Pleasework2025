import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

// Meta API Configuration
const META_API_VERSION = "v19.0";

// Base endpoints (profile, businesses, pages, ad accounts)
const BASE_ENDPOINTS = [
  "/me/permissions",
  "/me/adaccounts?fields=id,name,account_status&limit=25",
  "/me/businesses?fields=id,name",
  "/me/accounts?fields=id,name",
];

// Ads object endpoints (campaigns, adsets, ads)
const ADS_OBJECT_ENDPOINTS = [
  "campaigns",
  "adsets",
  "ads",
];

// Rate limiting configuration
const MAX_TICKS_PER_HOUR = 20;
const HOUR_IN_MS = 60 * 60 * 1000;

// In-memory backoff state (user_id -> backoff_until timestamp)
const backoffState = new Map<string, number>();

// In-memory rotation counter (user_id -> tick_count)
const rotationCounter = new Map<string, number>();

// Helper: Get rotation counter for user
function getRotationCount(userId: string): number {
  const count = rotationCounter.get(userId) || 0;
  rotationCounter.set(userId, count + 1);
  return count;
}

// Helper: Normalize ad account ID to act_ format
function normalizeAdAccountId(id: string): string {
  if (!id) return "";
  if (id.startsWith("act_")) return id;
  return `act_${id}`;
}

// Helper: Select endpoint type based on rotation
function selectEndpointType(userId: string): "base" | "ads" {
  const count = getRotationCount(userId);
  // 1 out of every 3 ticks should be ads
  return count % 3 === 0 ? "ads" : "base";
}

// Helper: Hash user_id + hour to select base endpoint
function selectBaseEndpoint(userId: string): string {
  const hour = new Date().getHours();
  const hashInput = `${userId}-${hour}`;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = (hash << 5) - hash + hashInput.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % BASE_ENDPOINTS.length;
  return BASE_ENDPOINTS[index];
}

// Helper: Select ads object endpoint (rotate through campaigns/adsets/ads)
function selectAdsObjectEndpoint(): string {
  const minute = new Date().getMinutes();
  const index = minute % ADS_OBJECT_ENDPOINTS.length;
  return ADS_OBJECT_ENDPOINTS[index];
}

// Helper: Check if user is in backoff period
function isInBackoff(userId: string): boolean {
  const backoffUntil = backoffState.get(userId);
  if (!backoffUntil) return false;
  if (Date.now() < backoffUntil) {
    return true;
  }
  backoffState.delete(userId);
  return false;
}

// Helper: Set backoff for user
function setBackoff(userId: string, durationMs: number) {
  const backoffUntil = Date.now() + durationMs;
  backoffState.set(userId, backoffUntil);
  console.log(`[activity-ping-v2] User ${userId} in backoff for ${durationMs / 1000}s`);
}

// Helper: Call Meta API
async function callMetaAPI(
  userId: string,
  accessToken: string,
  endpoint: string,
  logAction?: string
): Promise<{
  ok: boolean;
  status?: number;
  errorCode?: string;
  errorMessage?: string;
  data?: any;
}> {
  try {
    const url = `https://graph.facebook.com/${META_API_VERSION}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = await response.json();

    if (!response.ok) {
      const errorCode = json?.error?.code || "unknown";
      const errorMessage = json?.error?.message || "Unknown error";

      // Log to meta_usage_logs
      if (logAction) {
        await logMetaUsage(userId, logAction, false, response.status, {
          errorCode: String(errorCode),
          errorMessage,
        });
      }

      return {
        ok: false,
        status: response.status,
        errorCode: String(errorCode),
        errorMessage,
      };
    }

    // Log success
    if (logAction) {
      await logMetaUsage(userId, logAction, true, response.status, json);
    }

    return { ok: true, status: response.status, data: json };
  } catch (err: any) {
    // Log error
    if (logAction) {
      await logMetaUsage(userId, logAction, false, 0, {
        errorMessage: err.message || String(err),
      });
    }

    return {
      ok: false,
      errorMessage: err.message || String(err),
    };
  }
}

// Helper: Log to meta_usage_logs table
async function logMetaUsage(
  userId: string,
  action: string,
  ok: boolean,
  status: number,
  data: any
): Promise<void> {
  try {
    await supabase.from("meta_usage_logs").insert({
      user_id: userId,
      action,
      ok,
      status,
      error: ok ? null : JSON.stringify(data),
      data: ok ? JSON.stringify(data) : null,
    });
  } catch (err) {
    // Ignore logging errors
    console.error("[activity-ping-v2] Failed to log meta usage:", err);
  }
}

// Helper: Check and enforce rate limiting
async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  nextDelaySeconds?: number;
  reason?: string;
}> {
  try {
    const now = new Date();

    // Get current counter
    const { data: counter, error: fetchError } = await supabase
      .from("meta_usage_counters")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[activity-ping-v2] Rate limit check error:", fetchError);
      // Fail open (allow request) on database errors
      return { allowed: true };
    }

    if (!counter) {
      // First tick for this user, create counter
      const { error: insertError } = await supabase
        .from("meta_usage_counters")
        .insert({
          user_id: userId,
          window_start: now.toISOString(),
          count: 1,
          updated_at: now.toISOString(),
        });

      if (insertError) {
        console.error("[activity-ping-v2] Failed to create counter:", insertError);
        return { allowed: true }; // Fail open
      }

      return { allowed: true };
    }

    // Check if window has expired (more than 1 hour old)
    const windowStart = new Date(counter.window_start);
    const windowAge = now.getTime() - windowStart.getTime();

    if (windowAge > HOUR_IN_MS) {
      // Reset window
      const { error: updateError } = await supabase
        .from("meta_usage_counters")
        .update({
          window_start: now.toISOString(),
          count: 1,
          updated_at: now.toISOString(),
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("[activity-ping-v2] Failed to reset counter:", updateError);
        return { allowed: true }; // Fail open
      }

      return { allowed: true };
    }

    // Window is still active, check count
    if (counter.count >= MAX_TICKS_PER_HOUR) {
      // Rate limit exceeded
      const windowEnd = windowStart.getTime() + HOUR_IN_MS;
      const secondsUntilReset = Math.ceil((windowEnd - now.getTime()) / 1000);

      console.warn(`[activity-ping-v2] Rate limit exceeded for ${userId}: ${counter.count}/${MAX_TICKS_PER_HOUR} ticks`);

      return {
        allowed: false,
        nextDelaySeconds: secondsUntilReset,
        reason: "hourly_cap",
      };
    }

    // Increment count
    const { error: incrementError } = await supabase
      .from("meta_usage_counters")
      .update({
        count: counter.count + 1,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);

    if (incrementError) {
      console.error("[activity-ping-v2] Failed to increment counter:", incrementError);
      return { allowed: true }; // Fail open
    }

    console.log(`[activity-ping-v2] Rate limit check passed: ${counter.count + 1}/${MAX_TICKS_PER_HOUR} ticks`);
    return { allowed: true };
  } catch (err) {
    console.error("[activity-ping-v2] Rate limit check exception:", err);
    return { allowed: true }; // Fail open on unexpected errors
  }
}

// Main function: Drive Meta API usage for user
async function driveMetaAPIUsage(userId: string): Promise<void> {
  // Check backoff first
  if (isInBackoff(userId)) {
    console.log(`[activity-ping-v2] Meta API skipped for ${userId} (in backoff)`);
    return;
  }

  // Load user's Meta credentials
  const { data: creds, error: credsError } = await supabase
    .from("meta_credentials")
    .select("access_token, ad_accounts")
    .eq("user_id", userId)
    .maybeSingle();

  if (credsError || !creds || !creds.access_token) {
    console.log(`[activity-ping-v2] Meta API skipped for ${userId} (no token)`);
    return;
  }

  const accessToken = creds.access_token;

  // Select endpoint type (base or ads)
  const endpointType = selectEndpointType(userId);

  if (endpointType === "base") {
    // Call base endpoint (permissions, businesses, pages, ad accounts)
    const endpoint = selectBaseEndpoint(userId);
    console.log(`[activity-ping-v2] Meta API calling base endpoint: ${endpoint} for ${userId}`);

    const result = await callMetaAPI(userId, accessToken, endpoint, "base_api");

    if (result.ok) {
      console.log(`[activity-ping-v2] Meta API success: ${endpoint} (${result.status})`);
    } else {
      console.warn(`[activity-ping-v2] Meta API error: ${endpoint}`, {
        status: result.status,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      // Apply backoff rules based on error
      if (result.status === 429 || result.errorCode === "17") {
        // Rate limit / throttle -> skip for 30 minutes
        setBackoff(userId, 30 * 60 * 1000);
      } else if (result.errorCode === "10") {
        // Permission error -> skip for 6 hours
        setBackoff(userId, 6 * 60 * 60 * 1000);
      } else if (result.status === 401 || result.status === 190) {
        // Invalid token -> skip for 24 hours
        setBackoff(userId, 24 * 60 * 60 * 1000);
      }
    }
  } else {
    // Call ads object endpoint (campaigns/adsets/ads)
    // First, get ad account ID
    let adAccountId: string | null = null;

    // Try to get from cached ad_accounts
    if (creds.ad_accounts && Array.isArray(creds.ad_accounts) && creds.ad_accounts.length > 0) {
      const firstAccount = creds.ad_accounts[0];
      adAccountId = firstAccount.id;
    }

    // If no cached ad account, fetch them
    if (!adAccountId) {
      console.log(`[activity-ping-v2] Fetching ad accounts for ${userId}`);
      const adAccountsResult = await callMetaAPI(
        userId,
        accessToken,
        "/me/adaccounts?fields=id,name,account_status&limit=1"
      );

      if (adAccountsResult.ok && adAccountsResult.data?.data?.length > 0) {
        adAccountId = adAccountsResult.data.data[0].id;
      }
    }

    if (!adAccountId) {
      console.log(`[activity-ping-v2] No ad account found for ${userId}, skipping ads call`);
      return;
    }

    // Normalize ad account ID to act_ format
    const normalizedAdAccountId = normalizeAdAccountId(adAccountId);

    // Select ads object endpoint
    const adsObjectType = selectAdsObjectEndpoint();
    const endpoint = `/${normalizedAdAccountId}/${adsObjectType}?fields=id,name,status,effective_status&limit=5`;

    console.log(`[activity-ping-v2] Meta API calling ads endpoint: ${endpoint} for ${userId}`);

    const result = await callMetaAPI(userId, accessToken, endpoint, `ads_${adsObjectType}`);

    if (result.ok) {
      console.log(`[activity-ping-v2] Meta API ads success: ${adsObjectType} (${result.status})`);
    } else {
      console.warn(`[activity-ping-v2] Meta API ads error: ${adsObjectType}`, {
        status: result.status,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      // Apply DIFFERENT backoff rules for ads endpoints
      if (result.status === 429 || result.errorCode === "17") {
        // Rate limit / throttle -> skip for 30 minutes
        setBackoff(userId, 30 * 60 * 1000);
      } else if (result.errorCode === "10") {
        // Permission error on ads -> skip for 30 minutes (not 6 hours!)
        // This allows base endpoints to keep running
        console.log(`[activity-ping-v2] Ads permission error, short backoff (30min)`);
        setBackoff(userId, 30 * 60 * 1000);
      } else if (result.status === 401 || result.status === 190) {
        // Invalid token -> skip for 24 hours
        setBackoff(userId, 24 * 60 * 60 * 1000);
      }
    }
  }
}

export const handler: Handler = async (event) => {
  // Handle OPTIONS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only accept POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    };
  }

  // Get and verify auth token
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Missing Authorization header" }),
    };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("[activity-ping-v2] Auth error:", authError);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Invalid or expired token" }),
    };
  }

  // Check rate limiting (max 20 ticks per hour per user)
  const rateLimit = await checkRateLimit(user.id);
  if (!rateLimit.allowed) {
    console.warn(`[activity-ping-v2] Rate limit exceeded for ${user.id}`);
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        ok: false,
        reason: rateLimit.reason,
        next_delay_seconds: rateLimit.nextDelaySeconds,
        message: `Rate limit exceeded. Please wait ${rateLimit.nextDelaySeconds} seconds.`,
      }),
    };
  }

  // Parse request body
  let payload: {
    session_id?: string;
    source?: string;
    path?: string;
  } = {};

  try {
    if (event.body) {
      payload = JSON.parse(event.body);
    }
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  // Extract IP from x-forwarded-for (first value)
  let clientIp: string | null = null;
  const forwardedFor = event.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = forwardedFor.split(",");
    clientIp = ips[0]?.trim() || null;
  }

  // Insert ping record
  try {
    const { data, error } = await supabase
      .from("user_activity_pings_v2")
      .insert({
        user_id: user.id,
        session_id: payload.session_id || null,
        source: payload.source || "app",
        path: payload.path || null,
        user_agent: event.headers["user-agent"] || null,
        ip: clientIp,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[activity-ping-v2] Insert error:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Failed to insert ping",
          details: error.message,
        }),
      };
    }

    console.log("[activity-ping-v2] Ping recorded", {
      user_id: user.id,
      ping_id: data.id,
      source: payload.source || "app",
      path: payload.path || null,
    });

    // ALSO: Drive Meta API usage (autonomous, safe, best-effort)
    driveMetaAPIUsage(user.id).catch((err) => {
      // Fire and forget - don't block ping response
      console.error("[activity-ping-v2] Meta API error (non-blocking):", err);
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        ping_id: data.id,
        created_at: data.created_at,
      }),
    };
  } catch (err: any) {
    console.error("[activity-ping-v2] Unexpected error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: err.message,
      }),
    };
  }
};
