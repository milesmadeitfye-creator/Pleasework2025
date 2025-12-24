// src/lib/ownerMetaPixel.ts
// Ghoste owner Meta Pixel (web events)

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _ghosteOwnerPixelInit?: boolean;
  }
}

const OWNER_PIXEL_ID =
  import.meta.env.VITE_OWNER_META_PIXEL_ID || "852830327354589";

export function initOwnerMetaPixel() {
  if (typeof window === "undefined") return;
  if (!OWNER_PIXEL_ID) return;
  if (window._ghosteOwnerPixelInit) return;

  window._ghosteOwnerPixelInit = true;

  // Standard Meta Web Pixel bootstrap
  // BUILD FIX: Added 4th parameter 'v' to match function signature (TS2554)
  !(function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function (...args: any[]) {
      if (n.callMethod) {
        n.callMethod.apply(n, args);
      } else {
        n.queue.push(args);
      }
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", undefined);

  // Init as WEB pixel and track initial PageView
  window.fbq!("init", OWNER_PIXEL_ID);
  window.fbq!("track", "PageView");

  console.log("[Owner Meta Pixel] Initialized:", OWNER_PIXEL_ID);
}

function safeFbq(...args: any[]) {
  if (typeof window === "undefined") return;
  if (!window.fbq) return;
  window.fbq(...args);
}

// ====== WEB EVENTS ======

export function trackPageView() {
  safeFbq("track", "PageView");
  console.log("[Owner Meta Pixel] PageView");
}

export function trackViewContent(name: string) {
  safeFbq("track", "ViewContent", {
    content_name: name,
  });
  console.log("[Owner Meta Pixel] ViewContent:", name);
}

// Free signup completed (web registration)
export function trackCompleteRegistration(userId?: string) {
  safeFbq("track", "CompleteRegistration", {
    content_name: "Free Account",
    value: 0,
    currency: "USD",
    user_id: userId,
  });
  console.log("[Owner Meta Pixel] CompleteRegistration:", userId);
}

// Lead (email capture, waitlist, download)
export function trackLead(source: string) {
  safeFbq("track", "Lead", {
    content_name: source,
  });
  console.log("[Owner Meta Pixel] Lead:", source);
}

// Paid signup / subscription (Pro plan)
export function trackSubscribe(planName: string, price: number) {
  safeFbq("track", "Subscribe", {
    content_name: planName,
    value: price,
    currency: "USD",
  });

  // Optionally also count as a Purchase
  safeFbq("track", "Purchase", {
    content_name: planName,
    value: price,
    currency: "USD",
  });

  console.log("[Owner Meta Pixel] Subscribe + Purchase:", planName, price);
}

export function trackUpgradeToPro(planName: string, price: number) {
  safeFbq("trackCustom", "UpgradeToPro", {
    plan_name: planName,
    value: price,
    currency: "USD",
  });
  console.log("[Owner Meta Pixel] UpgradeToPro:", planName, price);
}

// Optional: when user starts checkout (stripe, etc.)
export function trackInitiateCheckout(planName: string, price: number) {
  safeFbq("track", "InitiateCheckout", {
    content_name: planName,
    value: price,
    currency: "USD",
  });
  console.log("[Owner Meta Pixel] InitiateCheckout:", planName, price);
}

// Custom event tracking
export function trackCustom(eventName: string, parameters?: Record<string, any>) {
  safeFbq("trackCustom", eventName, parameters);
  console.log("[Owner Meta Pixel] Custom:", eventName, parameters);
}
