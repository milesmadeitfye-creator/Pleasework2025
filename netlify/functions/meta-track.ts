import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function json(body: any, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json({ ok: true }, 200);
  }

  if (event.httpMethod !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const {
      slug,
      event_name,
      event_time,
      event_id,
      action_source,
      event_source_url,
      user_data,
      custom_data,
      test_event_code,
    } = body || {};

    if (!event_name) {
      return json({ ok: false, error: "Missing event_name" }, 400);
    }

    let userId: string | null = null;
    let pixelId: string | null = null;
    let accessToken: string | null = null;
    let apiVersion = "v21.0";

    if (slug) {
      const { data: linkData } = await supabaseAdmin
        .from("smart_links")
        .select("user_id")
        .eq("slug", slug)
        .maybeSingle();

      if (linkData?.user_id) {
        userId = linkData.user_id;

        const { data: metaCreds } = await supabaseAdmin
          .from("meta_credentials")
          .select("pixel_id, access_token")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (metaCreds) {
          pixelId = metaCreds.pixel_id;
          accessToken = metaCreds.access_token;
        }
      }
    }

    if (!pixelId || !accessToken) {
      const { data: appConfig } = await supabaseAdmin
        .from("app_config")
        .select("key, value")
        .in("key", [
          "meta_access_token",
          "meta_pixel_id",
          "meta_dataset_id",
          "meta_api_version",
          "meta_test_event_code",
        ]);

      const configMap: Record<string, any> = {};
      for (const c of appConfig || []) {
        configMap[c.key] = typeof c.value === "string" ? c.value : c.value?.value || c.value;
      }

      accessToken = accessToken || configMap.meta_access_token;
      pixelId = pixelId || configMap.meta_pixel_id || configMap.meta_dataset_id;
      apiVersion = configMap.meta_api_version || apiVersion;

      if (!test_event_code && configMap.meta_test_event_code) {
        body.test_event_code = configMap.meta_test_event_code;
      }
    }

    if (!accessToken || !pixelId) {
      console.log("[meta-track] Meta not configured, skipping event", {
        hasAccessToken: !!accessToken,
        hasPixelId: !!pixelId,
        userId,
        slug,
        event_name,
      });
      return json({
        ok: true,
        skipped: true,
        reason: "Meta not configured (missing access token or pixel id)",
        debug: {
          hasAccessToken: !!accessToken,
          hasPixelId: !!pixelId,
          userId,
          slug,
        },
      });
    }

    const ip =
      event.headers["x-nf-client-connection-ip"] ||
      event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      undefined;

    const ua = event.headers["user-agent"] || undefined;

    const normalizedUserData: any = {
      client_ip_address: ip,
      client_user_agent: ua,
    };

    if (user_data?.em) {
      normalizedUserData.em = [sha256(user_data.em)];
    }

    if (user_data?.fbp) normalizedUserData.fbp = user_data.fbp;
    if (user_data?.fbc) normalizedUserData.fbc = user_data.fbc;
    if (user_data?.external_id) normalizedUserData.external_id = user_data.external_id;

    const payload: any = {
      data: [
        {
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          event_id: event_id || `${event_name}-${Date.now()}`,
          action_source: action_source || "website",
          event_source_url: event_source_url || event.headers.referer || undefined,
          user_data: normalizedUserData,
          custom_data: custom_data || {},
        },
      ],
    };

    const tec = test_event_code || body.test_event_code;
    if (tec) {
      payload.test_event_code = tec;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${accessToken}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let meta: any;
    try {
      meta = JSON.parse(text);
    } catch {
      meta = { raw: text };
    }

    const ok = resp.ok && !meta?.error;

    console.log("[meta-track] result", {
      ok,
      status: resp.status,
      event_name,
      event_id: payload.data?.[0]?.event_id,
      slug,
      userId,
      meta: ok ? meta : meta?.error || meta,
    });

    return json(
      {
        ok,
        meta,
        pixel_id: pixelId,
        debug: {
          event_name,
          event_id: payload.data?.[0]?.event_id,
          slug,
          used_test_event_code: !!tec,
        },
      },
      ok ? 200 : 400
    );
  } catch (e: any) {
    console.error("[meta-track] fatal", e);
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
};
