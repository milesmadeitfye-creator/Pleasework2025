declare global {
  interface Window {
    ttq?: any;
  }
}

export function initTikTokPixel(pixelId: string) {
  if (!pixelId || typeof window === 'undefined') return;

  if (window.ttq) return;

  const ttq: any = function() {
    if (ttq.methods) {
      ttq.methods.apply(ttq, arguments);
    } else {
      ttq.queue.push(arguments);
    }
  };

  window.ttq = ttq;
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
  ttq.setAndDefer = function(t: any, e: any) {
    t[e] = function() {
      t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };

  for (let i = 0; i < ttq.methods.length; i++) {
    ttq.setAndDefer(ttq, ttq.methods[i]);
  }

  ttq.instance = function(t: string) {
    const e = ttq._i[t] || [];
    for (let n = 0; n < ttq.methods.length; n++) {
      ttq.setAndDefer(e, ttq.methods[n]);
    }
    return e;
  };

  ttq.load = function(e: string, n?: any) {
    const i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {};
    ttq._i[e] = [];
    ttq._i[e]._u = i;
    ttq._t = ttq._t || {};
    ttq._t[e] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[e] = n || {};

    const o = document.createElement('script');
    o.type = 'text/javascript';
    o.async = true;
    o.src = i + '?sdkid=' + e + '&lib=' + 't';
    const a = document.getElementsByTagName('script')[0];
    a.parentNode?.insertBefore(o, a);
  };

  ttq.queue = [];
  ttq.load(pixelId);
  ttq.page();
}

export function trackTikTokEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.ttq) {
    window.ttq.track(eventName, params);
  }
}

export function trackTikTokSmartLinkClick(linkTitle: string, platform: string) {
  if (typeof window !== 'undefined' && window.ttq) {
    const eventMap: Record<string, string> = {
      'Spotify': 'SpotifyLinkClick',
      'Apple Music': 'AppleMusicLinkClick',
      'YouTube': 'YouTubeLinkClick',
      'YouTube Music': 'YouTubeLinkClick',
      'Tidal': 'TidalLinkClick',
      'SoundCloud': 'SoundCloudLinkClick',
    };

    const eventName = eventMap[platform] || 'StreamingLinkClick';

    window.ttq.track(eventName, {
      content_name: linkTitle,
      platform: platform,
    });
  }
}
