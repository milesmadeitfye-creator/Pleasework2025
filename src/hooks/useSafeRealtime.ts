import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export function useSafeRealtime(
  channelName: string,
  setup: (channel: any) => void,
  deps: any[] = []
) {
  const channelRef = useRef<any>(null);
  const cleanupAttemptedRef = useRef(false);

  useEffect(() => {
    cleanupAttemptedRef.current = false;

    // Check if WebSocket is globally disabled
    if (typeof window !== 'undefined' && (window as any).__wsDisabled) {
      console.warn('[realtime] WebSocket disabled globally, skipping channel setup');
      return;
    }

    // Cleanup previous
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (e) {
        console.warn("[realtime:cleanup]", e);
      }
      channelRef.current = null;
    }

    try {
      const ch = supabase.channel(channelName);
      channelRef.current = ch;

      try {
        setup(ch);
      } catch (e) {
        console.warn("[realtime:setup] Setup function threw:", e);
        return;
      }

      ch.subscribe((status: any) => {
        if (status === "SUBSCRIBED") {
          console.log("[realtime] Subscribed:", channelName);
        } else if (status === "CHANNEL_ERROR") {
          console.warn("[realtime] Channel error:", channelName);
        } else if (status === "TIMED_OUT") {
          console.warn("[realtime] Channel timed out:", channelName);
        } else if (status === "CLOSED") {
          console.log("[realtime] Channel closed:", channelName);
        }
      });

    } catch (e: any) {
      const isWebSocketError =
        e?.message?.toLowerCase().includes('websocket') ||
        e?.message?.toLowerCase().includes('operation is insecure');

      if (isWebSocketError) {
        console.warn("[realtime] WebSocket error, disabling globally:", e?.message);
        if (typeof window !== 'undefined') {
          (window as any).__wsDisabled = true;
        }
      } else {
        console.warn("[realtime] Channel creation failed:", e);
      }
    }

    return () => {
      if (channelRef.current && !cleanupAttemptedRef.current) {
        cleanupAttemptedRef.current = true;
        try {
          supabase.removeChannel(channelRef.current);
        } catch (e) {
          console.warn("[realtime:cleanup]", e);
        }
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
