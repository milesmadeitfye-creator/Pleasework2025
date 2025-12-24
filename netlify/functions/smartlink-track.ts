import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      slug,
      event_name,
      event_id,
      // New analytics system params
      smartlink_id,
      owner_user_id: provided_owner_user_id,
      event_type,
      platform,
      outbound_url,
      session_id,
      meta
    } = body;

    // Support both old (slug) and new (smartlink_id) systems
    const supabase = createClient(supabaseUrl, supabaseKey);
    let destination_url = slug ? `https://ghoste.one/r/${slug}` : "";
    let owner_user_id: string | null = provided_owner_user_id || null;
    let link_id: string | null = smartlink_id || null;

    // If using new analytics system with smartlink_id
    if (smartlink_id && event_type) {
      try {
        // Get link details if not provided
        if (!owner_user_id) {
          const { data: linkData } = await supabase
            .from("smart_links")
            .select("id, user_id")
            .eq("id", smartlink_id)
            .maybeSingle();

          if (linkData) {
            owner_user_id = linkData.user_id;
            link_id = linkData.id;
          }
        }

        // Insert into smartlink_events table for analytics
        if (owner_user_id && link_id) {
          const referrer = event.headers.referer || event.headers.referrer || null;
          const user_agent = event.headers["user-agent"] || null;
          const ip_raw = event.headers["x-forwarded-for"]?.split(",")[0] || event.headers["client-ip"] || null;

          // Simple IP hash for privacy (not cryptographic, just for grouping)
          const ip_hash = ip_raw ? `ip_${ip_raw.split('.').slice(0, 3).join('.')}` : null;

          await supabase.from("smartlink_events").insert([{
            smartlink_id: link_id,
            owner_user_id,
            event_type: event_type,
            platform: platform || null,
            outbound_url: outbound_url || null,
            referrer,
            user_agent,
            ip_hash,
            session_id: session_id || null,
            meta: meta || {}
          }]);

          console.log("[smartlink-track] Inserted analytics event:", {
            event_type,
            platform,
            link_id: link_id.substring(0, 8)
          });
        }
      } catch (e: any) {
        console.error("[smartlink-track] Analytics insert failed:", e.message);
        // Don't fail the whole request if analytics insert fails
      }
    }

    // Legacy slug-based tracking (for backward compatibility)
    if (slug && !link_id) {
      try {
        const { data: linkData } = await supabase
          .from("smart_links")
          .select("id, slug, config, user_id")
          .eq("slug", slug)
          .maybeSingle();

        if (linkData) {
          owner_user_id = linkData.user_id || null;
          link_id = linkData.id;

          if (linkData.config) {
            const config = typeof linkData.config === "string"
              ? JSON.parse(linkData.config)
              : linkData.config;

            if (config.spotify_url) {
              destination_url = config.spotify_url;
            } else if (config.apple_music_url) {
              destination_url = config.apple_music_url;
            }
          }
        }
      } catch (e) {
        console.warn("[smartlink-track] Failed to resolve destination:", e);
      }
    }

    // If no slug provided and using new system only, return success
    if (!slug && event_type) {
      return json(headers, {
        ok: true,
        stage: "analytics_only",
        message: "Event tracked in analytics system",
        owner_user_id,
        link_id
      });
    }

    if (!slug) {
      return json(headers, { ok: false, stage: "missing_slug" });
    }

    const PIXEL_ID = process.env.META_PIXEL_ID || process.env.VITE_META_PIXEL_ID;
    const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
    const TEST_CODE = process.env.META_TEST_EVENT_CODE;

    if (!PIXEL_ID || !ACCESS_TOKEN) {
      return json(headers, {
        ok: false,
        stage: "missing_meta_env",
        message: "META_PIXEL_ID or META_CAPI_ACCESS_TOKEN not configured",
        destination_url,
        owner_user_id,
        pixel_id: PIXEL_ID || null,
      });
    }

    const event_time = Math.floor(Date.now() / 1000);
    const final_event_id = event_id || `evt_${Date.now()}`;

    const payload = {
      data: [
        {
          event_name: event_name || "ViewContent",
          event_time,
          action_source: "website",
          event_id: final_event_id,
          event_source_url: `https://ghoste.one/smart/${slug}`,
          custom_data: {
            content_name: "Smart Link",
            slug,
          },
          user_data: {
            client_user_agent: event.headers["user-agent"] || "",
            client_ip_address: event.headers["x-forwarded-for"]?.split(",")[0] || event.headers["client-ip"] || "",
          },
        },
      ],
      ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}),
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const text = await res.text();
    const metaResponse = safeJson(text);

    if (!res.ok) {
      return json(headers, {
        ok: false,
        stage: "meta_api_error",
        status: res.status,
        response: metaResponse,
        event_id: final_event_id,
        pixel_id: PIXEL_ID,
        destination_url,
        owner_user_id,
        used_test_event_code: !!TEST_CODE,
      });
    }

    return json(headers, {
      ok: true,
      stage: "sent",
      status: res.status,
      response: metaResponse,
      event_id: final_event_id,
      pixel_id: PIXEL_ID,
      destination_url,
      owner_user_id,
      used_test_event_code: !!TEST_CODE,
    });
  } catch (err: any) {
    return json(headers, {
      ok: false,
      stage: "catch",
      error: err.message || String(err),
    });
  }
};

function json(headers: Record<string, string>, body: any) {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(body),
  };
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t.substring(0, 500) };
  }
}
