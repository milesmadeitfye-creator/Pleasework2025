import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { sendSmartLinkCapiEvent, generateEventId } from "../lib/smartlinkCapi";

// Note: generateEventId is now imported from smartlinkCapi for consistency

function loadPixel(pixelId: string) {
  if ((window as any).fbq) return;

  (function(f: any, b: any, e: any, v: any) {
    if (f.fbq) return;
    const n: any = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  (window as any).fbq("init", pixelId);
}

export default function SmartLinkRedirect() {
  const { slug } = useParams();
  const eventId = useMemo(() => generateEventId(), []);
  const [debug, setDebug] = useState<any>(null);

  useEffect(() => {
    if (!slug) {
      window.location.href = "/";
      return;
    }

    const run = async () => {
      let destination = `https://ghoste.one/r/${slug}`;
      let pixelId: string | null = null;
      let ownerUserId: string | null = null;

      try {
        const response = await fetch("/.netlify/functions/smartlink-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            event_name: "ViewContent",
            event_id: eventId
          }),
        });

        const data = await response.json();
        setDebug(data);

        destination = data?.destination_url || destination;
        pixelId = data?.pixel_id || null;
        ownerUserId = data?.owner_user_id || null;
      } catch (e: any) {
        setDebug({
          ok: false,
          stage: "client_exception",
          error: e?.message || String(e)
        });
      }

      // ✅ Send CAPI event (server-side tracking alongside Pixel)
      // This does NOT interfere with Pixel - both use same event_id for deduplication
      if (ownerUserId) {
        try {
          sendSmartLinkCapiEvent({
            owner_user_id: ownerUserId,
            event_name: "ViewContent",
            event_id: eventId,
            event_source_url: window.location.href,
            custom_data: {
              content_name: "Smart Link",
              content_category: slug,
              content_type: "music",
              slug,
            },
          });
        } catch (e) {
          console.warn("[SmartLinkRedirect] CAPI send failed:", e);
        }
      }

      // ✅ Existing Pixel code (UNCHANGED)
      try {
        if (pixelId) {
          loadPixel(pixelId);
          if ((window as any).fbq) {
            (window as any).fbq("track", "ViewContent", {
              content_name: "Smart Link",
              content_category: slug,
              content_type: "music"
            }, { eventID: eventId });
          }
        }
      } catch (e) {
        console.warn("[SmartLinkRedirect] Pixel load failed:", e);
      }

      setTimeout(() => {
        window.location.replace(destination);
      }, 350);
    };

    run();
  }, [slug, eventId]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "white",
      fontFamily: "system-ui, -apple-system, sans-serif",
      padding: "40px 20px"
    }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "24px", marginBottom: "12px", fontWeight: "600" }}>
            Opening Smart Link...
          </div>
          <div style={{ fontSize: "14px", opacity: 0.8, marginBottom: "8px" }}>
            Slug: {slug}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.6, fontFamily: "monospace" }}>
            Event ID: {eventId}
          </div>
        </div>

        {debug && (
          <div style={{
            background: "rgba(0, 0, 0, 0.2)",
            borderRadius: "12px",
            padding: "20px",
            backdropFilter: "blur(10px)"
          }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>
              Debug Info
            </div>
            <pre style={{
              background: "rgba(0, 0, 0, 0.3)",
              padding: "16px",
              borderRadius: "8px",
              overflow: "auto",
              fontSize: "12px",
              lineHeight: "1.6"
            }}>
              {JSON.stringify(debug, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
