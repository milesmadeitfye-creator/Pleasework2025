type NotifyLevel = "info" | "success" | "warning" | "error";

function safeString(x: any, fallback = "") {
  if (typeof x === "string") return x;
  if (x == null) return fallback;
  try {
    return String(x);
  } catch {
    return fallback;
  }
}

export function notify(level: NotifyLevel, title: any, message?: any) {
  const t = safeString(title, "");
  const m = safeString(message, "");

  // Never throw in UI
  try {
    // Use existing toast system via custom event
    if (typeof window !== "undefined") {
      const event = new CustomEvent("show-toast", {
        detail: {
          message: t || m || "Update",
          type: level,
        },
      });
      window.dispatchEvent(event);
      return;
    }

    // Fallback to console if window not available (SSR)
    const payload = { level, title: t || "Update", message: m || undefined };
    if (level === "error") console.error("[notify]", payload);
    else console.log("[notify]", payload);
  } catch (e) {
    console.log("[notify:failed]", e);
  }
}
