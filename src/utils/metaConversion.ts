/**
 * Meta Conversions API - Frontend Helper
 *
 * Sends server-side conversion events to Meta via Netlify Function.
 * Automatically includes user agent and current URL.
 */

export async function trackServerConversion(payload: {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  value?: number;
  currency?: string;
  user_data?: {
    email?: string;
    phone?: string;
    fbp?: string;
    fbc?: string;
  };
}) {
  try {
    const body = {
      ...payload,
      event_source_url: payload.event_source_url ?? window.location.href,
      user_data: {
        ...payload.user_data,
        client_user_agent: navigator.userAgent,
      },
    };

    const res = await fetch("/.netlify/functions/meta-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    console.log("Server conversion result:", json);
  } catch (err) {
    console.error("Server conversion error:", err);
  }
}
