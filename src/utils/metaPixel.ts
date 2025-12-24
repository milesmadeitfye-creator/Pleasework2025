export function ensureFbqLoaded() {
  const w = window as any;
  if (w.fbq) return;

  !(function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
}

export function initFacebookPixel(pixelId: string) {
  if (!pixelId) return;
  const w = window as any;
  ensureFbqLoaded();
  try {
    w.fbq("init", pixelId);
  } catch {}
}

export function trackPageView() {
  try {
    (window as any).fbq?.("track", "PageView");
  } catch {}
}

export function trackCustom(eventName: string, params: Record<string, any> = {}, eventId?: string) {
  try {
    if (eventId) {
      (window as any).fbq?.("trackCustom", eventName, params, { eventID: eventId });
    } else {
      (window as any).fbq?.("trackCustom", eventName, params);
    }
  } catch {}
}
