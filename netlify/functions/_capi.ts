type CapiEvent = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  eventName: string;
  eventSourceUrl: string;
  clientIp?: string | null;
  clientUa?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  customData?: Record<string, any>;
};

export async function sendCapi(ev: CapiEvent) {
  const endpoint = `https://graph.facebook.com/v18.0/${encodeURIComponent(ev.pixelId)}/events`;
  const payload = {
    data: [
      {
        event_name: ev.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: ev.eventSourceUrl,
        action_source: "website",
        user_data: {
          client_ip_address: ev.clientIp || undefined,
          client_user_agent: ev.clientUa || undefined,
          fbp: ev.fbp || undefined,
          fbc: ev.fbc || undefined,
          external_id: ev.externalId || undefined,
        },
        custom_data: ev.customData || {},
      }
    ],
    ...(ev.testEventCode ? { test_event_code: ev.testEventCode } : {})
  };

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${endpoint}?access_token=${encodeURIComponent(ev.accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn("CAPI non-200", res.status, txt.slice(0, 200));
    }
  } catch (e) {
    console.warn("CAPI error", (e as Error).message);
  } finally {
    clearTimeout(to);
  }
}
