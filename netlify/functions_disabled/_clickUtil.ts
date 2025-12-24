export function parseUA(ua: string = "") {
  const s = ua.toLowerCase();
  const isAndroid = /android/.test(s);
  const isiOS = /iphone|ipad|ipod/.test(s);
  const isMobile = isAndroid || isiOS;
  const isMac = /mac os x/.test(s);
  const isWin = /windows/.test(s);
  const isLinux = /linux/.test(s) && !isAndroid;

  let os = "unknown";
  if (isiOS) os = "ios";
  else if (isAndroid) os = "android";
  else if (isMac) os = "macos";
  else if (isWin) os = "windows";
  else if (isLinux) os = "linux";

  let browser = "other";
  if (/chrome|crios/.test(s)) browser = "chrome";
  else if (/safari/.test(s) && !/chrome|crios/.test(s)) browser = "safari";
  else if (/firefox/.test(s)) browser = "firefox";
  else if (/edg\//.test(s)) browser = "edge";

  const device = isMobile ? "mobile" : /tablet|ipad/.test(s) ? "tablet" : "desktop";

  return { device, os, browser, isAndroid, isiOS };
}

export function guessStorefront(acceptLanguage?: string) {
  const m = (acceptLanguage || "").match(/-([A-Z]{2})/i);
  return (m?.[1] || "US").toUpperCase();
}

export function hashIp(ip?: string, salt?: string) {
  if (!ip) return null;
  const src = `${ip}|${salt || "STATIC_SALT"}`;
  let h = 0, i = 0, chr = 0;
  for (i = 0; i < src.length; i++) {
    chr = src.charCodeAt(i);
    h = ((h << 5) - h) + chr;
    h |= 0;
  }
  return String(h);
}

export function smallAppOpenHTML(platform: string, id: string, universalUrl: string) {
  const scheme = platform === "spotify" ? `spotify://track/${id}`
               : platform === "apple"   ? universalUrl
               : universalUrl;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opening ${platform}…</title></head>
<body style="margin:0">
<script>
  var universal='${universalUrl.replace(/'/g,"\\'")}';
  var scheme='${scheme.replace(/'/g,"\\'")}';
  var t=setTimeout(function(){ location.replace(universal); }, 750);
  document.addEventListener('visibilitychange',function(){ if(document.hidden){ clearTimeout(t); }}, {passive:true});
  var f=document.createElement('iframe'); f.style.display='none'; f.src=scheme; document.body.appendChild(f);
  var a=document.createElement('a'); a.href=scheme; a.style.display='none'; a.target='_self'; document.body.appendChild(a); a.click();
</script>
</body></html>`;
}
