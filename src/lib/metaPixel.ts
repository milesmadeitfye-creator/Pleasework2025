let activePixelId: string | null = null;

export function initMetaPixel(pixelId?: string | null) {
  if (typeof window === "undefined") return;
  if (!pixelId) return;

  // If same pixel already initialized, do nothing
  if ((window as any)._ghosteMetaPixelInit === pixelId) {
    return;
  }

  (function (f: any, b: any, e: any, v?: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script");

  (window as any)._ghosteMetaPixelInit = pixelId;
  (window as any).fbq("init", pixelId);
  (window as any).fbq("track", "PageView");

  activePixelId = pixelId;
  if (typeof console !== "undefined") {
    console.log("[metaPixel] Initialized Meta Pixel with ID:", pixelId);
  }
}

export function trackPlatformClick(platform: string, eventID?: string) {
  if (typeof window === "undefined") return;
  const fbq = (window as any).fbq;
  if (!fbq || !activePixelId) return;

  const eventData = { platform };
  const options = eventID ? { eventID } : {};

  fbq("trackCustom", "GhosteLinkClick", eventData, options);

  if (typeof console !== "undefined") {
    console.log("[metaPixel] GhosteLinkClick:", { platform, eventID });
  }
}

export function trackSmartLinkView(title: string, eventID?: string) {
  if (typeof window === "undefined") return;
  const fbq = (window as any).fbq;
  if (!fbq || !activePixelId) return;

  const eventData = {
    content_name: title,
    content_category: "smart_link",
  };
  const options = eventID ? { eventID } : {};

  fbq("track", "ViewContent", eventData, options);

  if (typeof console !== "undefined") {
    console.log("[metaPixel] ViewContent:", { title, eventID });
  }
}
