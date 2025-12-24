import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Fetch smart link by slug with fallback strategy:
 * 1. Try smart_links_v view (stable compatibility view)
 * 2. Try smart_links table (base table)
 * 3. Try smartlinks table (legacy naming)
 * 4. Try links table (alternative naming)
 */
async function fetchSmartLinkBySlug(supabase: any, slug: string): Promise<any | null> {
  const tables = ["smart_links_v", "smart_links", "smartlinks", "links"];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        // Table/view doesn't exist or query failed - try next
        continue;
      }

      if (data) {
        console.log(`[fetchSmartLinkBySlug] Found link in ${table}`);
        return data;
      }
    } catch (e) {
      // Table doesn't exist - try next
      continue;
    }
  }

  return null;
}

/**
 * Select destination URL with priority order:
 * 1. destination_url (explicit destination)
 * 2. Platform URLs in priority order (Spotify, Apple Music, YouTube, etc.)
 * 3. config.spotify_url / config.apple_music_url (legacy JSON config)
 * 4. null (caller should use fallback)
 */
function selectDestinationUrl(linkData: any): string | null {
  // Priority 1: Explicit destination_url
  if (linkData.destination_url && isValidUrl(linkData.destination_url)) {
    return linkData.destination_url;
  }

  // Priority 2: Platform URLs (check direct columns first)
  const platformUrls = [
    linkData.spotify_url,
    linkData.apple_music_url,
    linkData.youtube_url,
    linkData.soundcloud_url,
    linkData.tidal_url,
    linkData.amazon_music_url,
    linkData.deezer_url,
  ];

  for (const url of platformUrls) {
    if (url && isValidUrl(url)) {
      return url;
    }
  }

  // Priority 3: Legacy config JSON field (backward compatibility)
  if (linkData.config) {
    try {
      const config = typeof linkData.config === "string"
        ? JSON.parse(linkData.config)
        : linkData.config;

      const configUrls = [
        config.destination_url,
        config.spotify_url,
        config.apple_music_url,
        config.youtube_url,
        config.soundcloud_url,
        config.tidal_url,
      ];

      for (const url of configUrls) {
        if (url && isValidUrl(url)) {
          return url;
        }
      }
    } catch (e) {
      // Invalid JSON - skip
    }
  }

  return null;
}

/**
 * Validate URL is safe and well-formed
 */
function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Only allow http:// or https:// URLs
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }

  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

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
        // Normalize slug: trim, decode, and lowercase
        const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();

        // Try to fetch link data using stable view first, then fallback to base table
        const linkData = await fetchSmartLinkBySlug(supabase, normalizedSlug);

        if (linkData) {
          owner_user_id = linkData.user_id || null;
          link_id = linkData.id;

          // Select destination URL with priority order
          destination_url = selectDestinationUrl(linkData) || destination_url;

          console.log("[smartlink-track] Resolved destination:", {
            slug: normalizedSlug,
            destination: destination_url.substring(0, 50) + "...",
            link_id: link_id?.substring(0, 8)
          });
        } else {
          console.warn("[smartlink-track] Link not found for slug:", normalizedSlug);
        }
      } catch (e: any) {
        console.error("[smartlink-track] Failed to resolve destination:", e.message);
        // Don't throw - use fallback URL
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
