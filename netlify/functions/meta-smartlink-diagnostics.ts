import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Diagnostic endpoint to check why Meta test events aren't appearing
 * Call with: GET /.netlify/functions/meta-smartlink-diagnostics?slug=YOUR_SLUG
 */
export const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const slug = event.queryStringParameters?.slug;

  if (!slug) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: "missing_slug",
        message: "Provide ?slug=YOUR_SLUG to diagnose",
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const report: any = {
    slug,
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Check 1: Does smart link exist?
  const { data: linkData, error: linkError } = await supabase
    .from("smart_links")
    .select("id, user_id, title, slug, is_active")
    .eq("slug", slug)
    .maybeSingle();

  report.checks.smart_link = {
    exists: !!linkData,
    is_active: linkData?.is_active,
    user_id: linkData?.user_id,
    error: linkError?.message,
  };

  if (!linkData) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "FAIL",
        issue: "Smart link not found",
        solution: "Create a smart link with this slug first",
      }),
    };
  }

  // Check 2: Does user have meta_credentials?
  const { data: credData, error: credError } = await supabase
    .from("meta_credentials")
    .select("user_id, pixel_id, conversion_api_token, test_event_code, capi_enabled, pixel_enabled")
    .eq("user_id", linkData.user_id)
    .maybeSingle();

  report.checks.meta_credentials = {
    exists: !!credData,
    has_pixel_id: !!credData?.pixel_id,
    pixel_id: credData?.pixel_id ? `${credData.pixel_id.substring(0, 8)}...` : null,
    has_conversion_api_token: !!credData?.conversion_api_token,
    token_preview: credData?.conversion_api_token
      ? `${credData.conversion_api_token.substring(0, 15)}...`
      : null,
    has_test_event_code: !!credData?.test_event_code,
    test_event_code: credData?.test_event_code || "TEST62806 (hard-wired)",
    capi_enabled: credData?.capi_enabled,
    pixel_enabled: credData?.pixel_enabled,
    error: credError?.message,
  };

  if (!credData) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "FAIL",
        issue: "No meta_credentials found for this user",
        solution: "Connect Meta account in Settings → Connect Meta",
      }),
    };
  }

  if (!credData.pixel_id) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "FAIL",
        issue: "pixel_id is NULL in meta_credentials",
        solution: "Refresh Meta connection to sync pixel_id",
      }),
    };
  }

  if (!credData.conversion_api_token) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "FAIL",
        issue: "conversion_api_token is NULL in meta_credentials",
        solution: "Generate Conversions API token in Meta Business Manager and save in Settings",
      }),
    };
  }

  if (credData.capi_enabled === false) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "WARNING",
        issue: "capi_enabled is FALSE - CAPI events will be skipped",
        solution: "Enable CAPI in Settings → Meta Configuration",
      }),
    };
  }

  // Check 3: Test Meta API connection
  const testPayload = {
    data: [
      {
        event_name: "DiagnosticTest",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `diag_${Date.now()}`,
        action_source: "website",
        event_source_url: `https://ghoste.one/s/${slug}`,
        user_data: {
          client_ip_address: "1.2.3.4",
          client_user_agent: "diagnostic-test",
        },
      },
    ],
    test_event_code: "TEST62806", // Hard-wired test code
  };

  const metaUrl = `https://graph.facebook.com/v21.0/${credData.pixel_id}/events?access_token=${encodeURIComponent(
    credData.conversion_api_token
  )}`;

  let metaResponse: any;
  try {
    const res = await fetch(metaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    const text = await res.text();
    metaResponse = {
      status: res.status,
      ok: res.ok,
      body: safeJson(text),
    };
  } catch (err: any) {
    metaResponse = {
      error: err.message,
    };
  }

  report.checks.meta_api_test = metaResponse;

  if (!metaResponse.ok) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...report,
        result: "FAIL",
        issue: "Meta API test failed",
        solution: "Check if pixel_id and conversion_api_token are correct. Error: " + JSON.stringify(metaResponse.body),
      }),
    };
  }

  // All checks passed!
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ...report,
      result: "SUCCESS",
      message: "All checks passed! Test events should be appearing in Meta Test Events dashboard.",
      test_event_code: "TEST62806",
      how_to_view: [
        "1. Go to Meta Events Manager: https://business.facebook.com/events_manager2/list/pixel/" + credData.pixel_id,
        "2. Click 'Test Events' tab at the top",
        "3. Enter test code: TEST62806",
        "4. Visit your smart link to see events appear in real-time",
      ],
    }),
  };
};

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.substring(0, 500) };
  }
}
