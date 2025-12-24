/**
 * Meta Pixel + Conversions API Event Tracking
 *
 * Sends events to both:
 * 1. Browser pixel (fbq) for immediate tracking
 * 2. Conversions API (via Netlify function) for server-side tracking
 *
 * Uses event_id for deduplication between browser and server events.
 */

export type MetaEventName =
  | 'PageView'
  | 'ViewContent'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | string;

export const generateEventId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

interface TrackOptions {
  email?: string;
  customData?: Record<string, any>;
}

/**
 * Track a Meta event via both Pixel (browser) and CAPI (server).
 *
 * @param eventName - Event name (PageView, ViewContent, etc.)
 * @param options - Optional email and custom data
 */
export const trackMetaEvent = async (
  eventName: MetaEventName,
  options: TrackOptions = {}
) => {
  const eventId = generateEventId();

  // 1) Browser pixel (if fbq exists) - best-effort, silent
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && typeof fbq === 'function') {
      // @ts-ignore
      fbq('track', eventName, options.customData ?? {}, { eventID: eventId });
      // Only log in dev
      if (import.meta.env.DEV) {
        console.log(`[metaTrack] Sent ${eventName} to browser pixel`);
      }
    }
  } catch (err) {
    // Silent in production - tracking is optional
    if (import.meta.env.DEV) {
      console.warn('[metaTrack] Browser pixel unavailable:', err);
    }
  }

  // 2) Conversions API via Netlify function (fire-and-forget, silent)
  try {
    const event_source_url =
      typeof window !== 'undefined' ? window.location.href : undefined;

    // Don't await - fire and forget
    fetch('/.netlify/functions/meta-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url,
        email: options.email,
        custom_data: options.customData ?? {},
      }),
    }).catch(() => {
      // Swallow errors silently - tracking is best-effort
      // No console spam on Safari
    });
  } catch (err) {
    // Silent - tracking failures should never impact user experience
  }
};
