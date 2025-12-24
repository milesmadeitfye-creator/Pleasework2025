export async function metaGetSettings(userId: string) {
  const res = await fetch("/.netlify/functions/meta-get-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "Failed to load meta settings");
  return j.settings || {};
}

export async function metaSaveSettings(userId: string, patch: any) {
  const res = await fetch("/.netlify/functions/meta-save-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, ...patch }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || "Failed to save meta settings");
  return j.settings || {};
}
