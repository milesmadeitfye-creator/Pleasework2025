import { useState } from "react";

export function ConfirmRelease({
  trackId,
  title,
  artist,
  durationMs,
  previewUrl,
  onDone,
}: {
  trackId: string;
  title: string;
  artist: string;
  durationMs?: number;
  previewUrl?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const send = async (confirm: boolean) => {
    setBusy(true);
    try {
      const resp = await fetch("/.netlify/functions/confirm-release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_id: trackId, confirm }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed");
      onDone?.();
    } catch (e) {
      console.error("Confirmation error:", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl shadow p-4 border bg-white">
      <div className="font-semibold text-lg mb-1">{title}</div>
      <div className="text-sm text-gray-600 mb-3">
        {artist}
        {durationMs ? ` • ${(durationMs / 1000) | 0}s` : ""}
      </div>
      {previewUrl && (
        <audio controls className="w-full mb-3">
          <source src={previewUrl} />
        </audio>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => send(true)}
          disabled={busy}
          className="btn btn-primary"
        >
          Yes, that&apos;s me
        </button>
        <button
          onClick={() => send(false)}
          disabled={busy}
          className="btn btn-secondary"
        >
          No, not my release
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Confirming locks links and boosts confidence. If it&apos;s not your
        release, we&apos;ll re-scan and let you paste a correct link.
      </p>
    </div>
  );
}
