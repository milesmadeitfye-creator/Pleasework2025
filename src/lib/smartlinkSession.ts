/**
 * Smart Link session ID for unique visitor tracking
 * Persists in localStorage to track unique views/clicks within 24h
 */
export function getSmartLinkSessionId(): string {
  const key = "ghoste_smartlink_sid";

  try {
    let sid = localStorage.getItem(key);
    if (!sid) {
      // Generate new session ID
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        sid = crypto.randomUUID();
      } else {
        // Fallback for older browsers
        sid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      localStorage.setItem(key, sid);
    }
    return sid;
  } catch (e) {
    // Fallback if localStorage is unavailable
    return `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Track Smart Link event (page view or outbound click)
 * Uses sendBeacon for reliable delivery even during page navigation
 */
export function trackSmartLinkEvent(params: {
  smartlink_id: string;
  owner_user_id: string;
  event_type: "page_view" | "outbound_click";
  platform?: string;
  outbound_url?: string;
  meta?: Record<string, any>;
}) {
  const session_id = getSmartLinkSessionId();

  const payload = {
    ...params,
    session_id,
    meta: params.meta || {},
  };

  const url = "/.netlify/functions/smartlink-track";
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });

  // Try sendBeacon first (reliable for page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, blob);
  } else {
    // Fallback to fetch with keepalive
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch((err) => {
      console.warn("[trackSmartLinkEvent] Failed:", err);
    });
  }
}
