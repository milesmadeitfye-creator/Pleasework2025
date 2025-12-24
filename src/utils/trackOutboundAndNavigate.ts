export type OutboundTrackFn = () => Promise<any> | any;

export async function trackOutboundAndNavigate(
  url: string,
  track?: OutboundTrackFn,
  opts?: { target?: "_self" | "_blank"; timeoutMs?: number }
) {
  const target = opts?.target ?? "_self";
  const timeoutMs = opts?.timeoutMs ?? 650;

  if (!url || typeof url !== "string") return;

  try {
    if (track) {
      await Promise.race([
        Promise.resolve(track()),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
  } catch (e) {
    console.warn("[trackOutboundAndNavigate] tracking failed:", e);
  }

  try {
    if (target === "_blank") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  } catch (e) {
    window.location.href = url;
  }
}
