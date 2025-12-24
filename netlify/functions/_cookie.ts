export function parseCookie(cookieHeader?: string) {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(/; */).forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const key = decodeURIComponent(part.slice(0, idx).trim());
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      out[key] = val;
    }
  });
  return out;
}

export function getFbpFbc(headers: Record<string, string | undefined>) {
  const cookie = headers["cookie"] || headers["Cookie"];
  const cookies = parseCookie(cookie);
  const fbp = cookies["_fbp"];
  const fbc = cookies["_fbc"];
  return { fbp, fbc };
}
