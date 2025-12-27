import { supabase } from "@/lib/supabase.client";

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type TrackContext = {
  userId: string;
  linkType: "smart" | "presave" | "email_capture" | "show";
  linkId: string;
  pixelId?: string | null;
  pixelEnabled?: boolean;
  capiEnabled?: boolean; // Server decides, but we still send request
};

export async function ensurePixel(pixelId?: string | null) {
  if (!pixelId) {
    console.warn('[metaTracking] ensurePixel called with no pixelId');
    return;
  }

  console.log('[metaTracking] ensurePixel:', pixelId);

  // Inject pixel script once
  if (!document.getElementById("fb-pixel")) {
    console.log('[metaTracking] Injecting Meta Pixel script');
    const s = document.createElement("script");
    s.id = "fb-pixel";
    s.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
    `;
    document.head.appendChild(s);
    console.log('[metaTracking] Pixel script injected');
  } else {
    console.log('[metaTracking] Pixel script already exists');
  }

  // Init pixel id (idempotent: fbq handles multiple init calls)
  console.log('[metaTracking] Calling fbq init with pixelId:', pixelId);
  window.fbq?.("init", pixelId);
  console.log('[metaTracking] fbq init called, fbq exists:', !!window.fbq);
}

async function sendCapi(ctx: TrackContext, payload: any, keepalive = false) {
  try {
    // Use session user email if available (helps match)
    const session = await supabase.auth.getSession();
    const email = session.data.session?.user?.email || null;

    const data = JSON.stringify({
      userId: ctx.userId,
      linkType: ctx.linkType,
      linkId: ctx.linkId,
      ...payload,
      userData: {
        ...(payload.userData || {}),
        ...(email ? { email } : {}),
      },
      eventSourceUrl: window.location.href,
    });

    // Use sendBeacon for navigation events (guaranteed delivery)
    if (keepalive && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([data], { type: 'application/json' });
      navigator.sendBeacon("/.netlify/functions/meta-capi", blob);
    } else {
      // Normal fetch with keepalive flag
      await fetch("/.netlify/functions/meta-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
        ...(keepalive ? { keepalive: true } : {}),
      });
    }
  } catch (e) {
    // Never crash UI on tracking errors
    console.warn("[metaTracking] CAPI error:", e);
  }
}

export async function track(
  ctx: TrackContext,
  eventName: string,
  customData?: any,
  userData?: any,
  options?: { eventId?: string; keepalive?: boolean }
) {
  const eventId = options?.eventId || uuid();

  console.log('[metaTracking] track() called:', {
    eventName,
    eventId,
    pixelId: ctx.pixelId,
    pixelEnabled: ctx.pixelEnabled,
    capiEnabled: ctx.capiEnabled,
    customData,
  });

  // Pixel (client-side)
  if (ctx.pixelEnabled !== false && ctx.pixelId) {
    await ensurePixel(ctx.pixelId);
    console.log('[metaTracking] Pixel init complete, firing event:', eventName);
    // Standard Meta events
    window.fbq?.("track", eventName, customData || {}, { eventID: eventId });
    console.log('[metaTracking] Pixel event fired');
  } else {
    console.warn('[metaTracking] Pixel disabled or no pixelId:', {
      pixelEnabled: ctx.pixelEnabled,
      pixelId: ctx.pixelId,
    });
  }

  // CAPI (server-side, server decides if enabled based on saved token)
  console.log('[metaTracking] Sending CAPI request...');
  await sendCapi(ctx, { eventName, eventId, customData, userData }, options?.keepalive);
  console.log('[metaTracking] CAPI request sent');

  return eventId;
}

// Convenience wrappers

export async function trackPageView(ctx: TrackContext) {
  return track(ctx, "PageView");
}

export async function trackSmartLinkClick(ctx: TrackContext) {
  return track(ctx, "ViewContent", {
    content_name: "Smart Link",
    content_type: "smart_link",
  });
}

export async function trackOutbound(
  ctx: TrackContext,
  platform: string,
  url: string,
  options?: { eventId?: string; keepalive?: boolean }
) {
  // Generate stable event_id for dedupe (or use provided)
  const eventId = options?.eventId || `sl_${ctx.linkId}_${platform}_${Date.now()}`;

  if (ctx.pixelEnabled !== false && ctx.pixelId) {
    await ensurePixel(ctx.pixelId);
    window.fbq?.("trackCustom", "SmartLinkOutbound", {
      platform,
      url,
      value: 0.00,
      currency: 'USD',
    }, { eventID: eventId });
  }

  await sendCapi(ctx, {
    eventName: "SmartLinkOutbound",
    eventId,
    customData: { platform, url, value: 0.00, currency: 'USD' },
  }, options?.keepalive);

  return eventId;
}

export async function trackLead(
  ctx: TrackContext,
  source: string,
  email?: string
) {
  return track(
    ctx,
    "Lead",
    { lead_source: source },
    email ? { email } : undefined
  );
}

export async function trackCompleteRegistration(
  ctx: TrackContext,
  source: string,
  email?: string
) {
  return track(
    ctx,
    "CompleteRegistration",
    { registration_source: source },
    email ? { email } : undefined
  );
}

export async function trackShowEvent(
  ctx: TrackContext,
  action: string,
  meta?: any
) {
  // For shows: ViewContent on page view, InitiateCheckout on ticket click, AddToWishlist on reminder
  const map: Record<string, string> = {
    view: "ViewContent",
    ticket_click: "InitiateCheckout",
    rsvp: "AddToWishlist",
  };

  const eventName = map[action] || "CustomEvent";

  return track(ctx, eventName, { action, ...(meta || {}) });
}
