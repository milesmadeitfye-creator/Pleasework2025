import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { initFacebookPixel, trackCustom, trackPageView } from "../utils/metaPixel";
import { sendSmartLinkCapiEvent, generateEventId } from "../lib/smartlinkCapi";
import { getPlatformClickEventName } from "../lib/metaPlatformEvents";

type MetaCfg = { success: boolean; pixel_id?: string | null; owner_user_id?: string | null };

async function fetchSmartLinkMeta(slug: string): Promise<{ pixelId: string | null; ownerId: string | null }> {
  try {
    const resp = await fetch("/.netlify/functions/smartlink-meta-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    const json: MetaCfg = await resp.json();
    return {
      pixelId: json?.success ? (json.pixel_id || null) : null,
      ownerId: json?.owner_user_id || null,
    };
  } catch {
    return { pixelId: null, ownerId: null };
  }
}

export default function SmartLinkExit() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const platform = params.get("platform") || "unknown";
  const target = params.get("url") || "";
  const debug = params.get("debug") === "1";

  const [pixelId, setPixelId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("init");
  const eventId = useMemo(() => generateEventId(), []);

  const safeTarget = useMemo(() => {
    try {
      const u = new URL(target);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.toString();
    } catch {
      return "";
    }
  }, [target]);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setStatus("loading_pixel");
      const { pixelId: pid, ownerId: oid } = await fetchSmartLinkMeta(slug);
      setPixelId(pid);
      setOwnerId(oid);

      // ✅ Send CAPI event for page view
      if (oid) {
        try {
          sendSmartLinkCapiEvent({
            owner_user_id: oid,
            event_name: "SmartLinkClick",
            event_id: eventId,
            event_source_url: window.location.href,
            custom_data: {
              slug,
              platform,
              outbound_url: safeTarget,
              value: 0.00,
              currency: 'USD',
            },
          });
        } catch (e) {
          console.warn("[SmartLinkExit] CAPI failed:", e);
        }
      }

      // ✅ Send CAPI event for platform-specific click
      if (oid) {
        try {
          const platformEvent = getPlatformClickEventName(platform);
          sendSmartLinkCapiEvent({
            owner_user_id: oid,
            event_name: platformEvent,
            event_id: generateEventId(), // Different event, different ID
            event_source_url: window.location.href,
            custom_data: {
              slug,
              platform,
              outbound_url: safeTarget,
              value: 0.00,
              currency: 'USD',
            },
          });
        } catch (e) {
          console.warn("[SmartLinkExit] Platform CAPI failed:", e);
        }
      }

      // ✅ Existing Pixel code (UNCHANGED)
      if (pid) {
        setStatus("init_pixel");
        initFacebookPixel(pid);
        trackPageView();
        setStatus("fire_event");
        trackCustom("SmartLinkClick", { slug, platform, value: 0.00, currency: 'USD' });

        // Fire additional platform-specific event
        const platformEvent = getPlatformClickEventName(platform);
        trackCustom(platformEvent, { slug, platform, outbound_url: safeTarget, value: 0.00, currency: 'USD' });
      } else {
        setStatus("no_pixel_configured");
      }

      if (!safeTarget) {
        setStatus("bad_target_url");
        setTimeout(() => navigate(`/s/${slug}`), 600);
        return;
      }

      setStatus("redirecting");
      const delay = debug ? 3000 : 700;
      setTimeout(() => {
        window.location.assign(safeTarget);
      }, delay);
    })();
  }, [slug, platform, safeTarget, navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "white", background: "#0a0a0a" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 20 }}>
        <h2 style={{ fontSize: 22, marginBottom: 10 }}>Opening {platform}…</h2>
        <p style={{ opacity: 0.8 }}>One sec — loading your link.</p>

        {debug && (
          <div style={{
            marginTop: 16,
            textAlign: "left",
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 12,
            fontSize: 12
          }}>
            <div><b>SmartLink Exit Debug</b></div>
            <div>slug: {slug}</div>
            <div>platform: {platform}</div>
            <div>pixelId: {pixelId || "null"}</div>
            <div>status: {status}</div>
            <div>typeof fbq: {typeof (window as any).fbq}</div>
            <div>delay: 3000ms (debug mode)</div>
            <div style={{ marginTop: 8, fontSize: 10, opacity: 0.7 }}>
              Network tab should show:
              <br />• fbevents.js
              <br />• facebook.com/tr (PageView)
              <br />• facebook.com/tr (SmartLinkClick)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
