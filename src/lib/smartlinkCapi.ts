/**
 * Meta Conversions API (CAPI) client helper for Smart Links
 *
 * This sends server-side events via Netlify function that mirror Pixel events.
 * Uses sendBeacon for reliability during page redirects.
 *
 * IMPORTANT: This does NOT replace Pixel tracking. Both work together.
 * The event_id is used by Meta to deduplicate events.
 */

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}

function makeEventId(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback to timestamp + random
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export interface SmartLinkCapiEvent {
  owner_user_id: string;
  event_name: string;
  event_source_url: string;
  custom_data?: Record<string, any>;
  event_id?: string; // Optional: pass if Pixel already created one
  email?: string; // Optional: for better matching
}

/**
 * Send a CAPI event to Meta via server-side Netlify function
 *
 * Uses sendBeacon to ensure delivery even during redirects.
 * Falls back to fetch with keepalive if sendBeacon fails.
 *
 * @param payload - Event data
 * @returns event_id used for this event (for Pixel deduplication)
 */
export function sendSmartLinkCapiEvent(payload: SmartLinkCapiEvent): string {
  const event_id = payload.event_id || makeEventId();

  const body = {
    owner_user_id: payload.owner_user_id,
    event_name: payload.event_name,
    event_id,
    event_source_url: payload.event_source_url,
    custom_data: payload.custom_data || {},
    fbp: getCookie("_fbp"),
    fbc: getCookie("_fbc"),
    email: payload.email,
  };

  // Try sendBeacon first (most reliable for redirects)
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const beaconSent = navigator.sendBeacon?.("/.netlify/functions/smartlink-capi-track", blob);

  if (!beaconSent) {
    // Fallback to fetch with keepalive
    fetch("/.netlify/functions/smartlink-capi-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch((err) => {
      console.warn("[smartlinkCapi] Failed to send CAPI event:", err);
    });
  }

  console.log("[smartlinkCapi] CAPI event queued:", {
    event_name: payload.event_name,
    event_id: event_id.slice(0, 12) + "...",
  });

  return event_id;
}

/**
 * Generate a unique event ID
 *
 * Use this if you want to generate an event_id upfront to use for both Pixel and CAPI.
 */
export function generateEventId(): string {
  return makeEventId();
}
