import type { Handler } from "@netlify/functions";

/**
 * Simple test endpoint to verify Netlify functions work
 * and can return JSON properly
 */
export const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };

  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    };
  }

  try {
    const testId = `test_${Date.now()}`;

    // Test 1: Environment variables
    const hasSupabaseUrl = !!process.env.SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Test 2: Authorization header
    const auth = event.headers.authorization || event.headers.Authorization;
    const hasAuth = !!auth;
    const hasBearer = auth?.toLowerCase().startsWith("bearer ");

    // Test 3: Dynamic import (minimal)
    let importWorks = false;
    let importError = null;
    try {
      const module = await import("@supabase/supabase-js");
      importWorks = !!module.createClient;
    } catch (e: any) {
      importError = e?.message || String(e);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        testId,
        timestamp: new Date().toISOString(),
        tests: {
          env: {
            hasSupabaseUrl,
            hasServiceKey,
            passed: hasSupabaseUrl && hasServiceKey,
          },
          auth: {
            hasAuth,
            hasBearer,
            passed: hasAuth && hasBearer,
          },
          import: {
            importWorks,
            importError,
            passed: importWorks,
          },
        },
        allPassed: hasSupabaseUrl && hasServiceKey && hasAuth && hasBearer && importWorks,
      }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: e?.message || String(e),
        stack: e?.stack?.substring(0, 500),
      }),
    };
  }
};
