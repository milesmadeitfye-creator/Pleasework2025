/**
 * META ACTIVITY PINGER - Unbundled Version
 *
 * By placing this in a subdirectory with the same name,
 * Netlify will NOT bundle it with esbuild.
 *
 * This is the simplest possible version that can work.
 */

// Create JSON response
function makeJson(code, data) {
  const body = JSON.stringify({
    _id: "ping_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    _ts: new Date().toISOString(),
    ...data,
  });

  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store",
    },
    body: body,
  };
}

// Redact sensitive strings
function redact(str) {
  if (!str) return null;
  if (str.length < 12) return "***";
  return str.slice(0, 6) + "..." + str.slice(-6);
}

// Main handler
exports.handler = function (event, context, callback) {
  // Convert callback-style to promise for easier handling
  handleRequest(event, context)
    .then((response) => callback(null, response))
    .catch((error) => {
      console.error("[meta-activity-pinger] Fatal error:", error);
      callback(null, makeJson(200, {
        ok: false,
        stage: "fatal",
        msg: error.message || String(error),
        name: error.name,
      }));
    });
};

async function handleRequest(event, context) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return makeJson(200, { ok: true, cors: "ok" });
  }

  // Only POST
  if (event.httpMethod !== "POST") {
    return makeJson(405, {
      ok: false,
      stage: "method",
      msg: "Use POST",
      got: event.httpMethod,
    });
  }

  // Extract bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader.startsWith("bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return makeJson(200, {
      ok: false,
      stage: "auth",
      msg: "Missing Authorization header",
      hint: "Add: Authorization: Bearer <token>",
    });
  }

  // Check env vars
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return makeJson(200, {
      ok: false,
      stage: "env",
      msg: "Missing Supabase env vars",
      has_url: !!SUPABASE_URL,
      has_key: !!SERVICE_KEY,
    });
  }

  // Verify user token
  let userId = null;
  try {
    const authResp = await fetch(SUPABASE_URL + "/auth/v1/user", {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "apikey": SERVICE_KEY,
      },
    });

    if (!authResp.ok) {
      return makeJson(200, {
        ok: false,
        stage: "auth_verify",
        msg: "Token verification failed",
        http: authResp.status,
        hint: "User needs to re-login",
      });
    }

    const userData = await authResp.json();
    userId = userData.id;

    if (!userId) {
      return makeJson(200, {
        ok: false,
        stage: "auth_parse",
        msg: "No user ID in auth response",
      });
    }
  } catch (authErr) {
    return makeJson(200, {
      ok: false,
      stage: "auth_error",
      msg: authErr.message || String(authErr),
    });
  }

  // Find Meta token - try 3 tables
  let metaToken = null;
  let tokenSource = null;

  // Table 1: user_meta_connections
  if (!metaToken) {
    try {
      const url = SUPABASE_URL + "/rest/v1/user_meta_connections?user_id=eq." + userId + "&select=access_token,meta_access_token";
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json",
        },
      });

      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0) {
          const row = rows[0];
          metaToken = row.access_token || row.meta_access_token;
          if (metaToken) tokenSource = "user_meta_connections";
        }
      }
    } catch (e) {
      // Silent fail
    }
  }

  // Table 2: meta_credentials
  if (!metaToken) {
    try {
      const url = SUPABASE_URL + "/rest/v1/meta_credentials?user_id=eq." + userId + "&select=access_token,meta_access_token,meta_user_token";
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json",
        },
      });

      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0) {
          const row = rows[0];
          metaToken = row.access_token || row.meta_access_token || row.meta_user_token;
          if (metaToken) tokenSource = "meta_credentials";
        }
      }
    } catch (e) {
      // Silent fail
    }
  }

  // Table 3: user_integrations
  if (!metaToken) {
    try {
      const url = SUPABASE_URL + "/rest/v1/user_integrations?user_id=eq." + userId + "&provider=eq.meta&select=access_token,api_key";
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json",
        },
      });

      if (resp.ok) {
        const rows = await resp.json();
        if (rows && rows.length > 0) {
          const row = rows[0];
          metaToken = row.access_token || row.api_key;
          if (metaToken) tokenSource = "user_integrations";
        }
      }
    } catch (e) {
      // Silent fail
    }
  }

  if (!metaToken) {
    return makeJson(200, {
      ok: false,
      stage: "token",
      msg: "No Meta token found in database",
      user_id: userId,
      tables_checked: ["user_meta_connections", "meta_credentials", "user_integrations"],
      hint: "User needs to connect Meta account in Profile → Connected Accounts",
    });
  }

  // Call Meta Graph API
  const metaUrl = "https://graph.facebook.com/v21.0/me?fields=id,name&access_token=" + encodeURIComponent(metaToken);

  let metaResp;
  let metaText;

  try {
    // Simple fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
      controller.abort();
    }, 8000);

    metaResp = await fetch(metaUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    metaText = await metaResp.text();
  } catch (fetchErr) {
    return makeJson(200, {
      ok: false,
      stage: "fetch",
      msg: fetchErr.name === "AbortError" ? "Meta API timeout (8s)" : "Network error",
      err: fetchErr.message || String(fetchErr),
    });
  }

  // Parse Meta response
  let metaData;
  try {
    metaData = JSON.parse(metaText);
  } catch (parseErr) {
    return makeJson(200, {
      ok: false,
      stage: "parse",
      msg: "Meta returned invalid JSON",
      preview: metaText.slice(0, 200),
    });
  }

  // Check for Meta API error
  if (metaData.error) {
    return makeJson(200, {
      ok: false,
      stage: "meta_error",
      msg: metaData.error.message || "Meta API error",
      http: metaResp.status,
      error_type: metaData.error.type,
      error_code: metaData.error.code,
      token_from: tokenSource,
      token_preview: redact(metaToken),
      hint: metaData.error.type === "OAuthException" ? "Token expired - user needs to reconnect Meta account" : "Check error_type and error_code",
    });
  }

  if (!metaResp.ok) {
    return makeJson(200, {
      ok: false,
      stage: "meta_http",
      msg: "Meta returned HTTP " + metaResp.status,
      http: metaResp.status,
      token_from: tokenSource,
    });
  }

  // Try to record activity (ignore failures)
  try {
    const activityUrl = SUPABASE_URL + "/rest/v1/meta_api_activity_daily";
    await fetch(activityUrl, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        day: new Date().toISOString().slice(0, 10),
        success_count: 1,
        error_count: 0,
        last_success_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    // Ignore
  }

  // SUCCESS!
  return makeJson(200, {
    ok: true,
    stage: "done",
    msg: "Meta ping successful",
    user_id: userId,
    token_from: tokenSource,
    token_preview: redact(metaToken),
    meta: {
      id: metaData.id,
      name: metaData.name,
    },
  });
}
