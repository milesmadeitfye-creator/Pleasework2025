/**
 * Extract Meta cookies for CAPI user_data
 * fbp = Meta browser cookie
 * fbc = Meta click ID (from fbclid query param)
 */
export function getMetaCookies() {
  if (typeof document === 'undefined') {
    return { fbp: null, fbc: null };
  }

  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  // Check for fbclid in URL
  const urlParams = new URLSearchParams(window.location.search);
  const fbclid = urlParams.get('fbclid');

  return {
    fbp: cookies['_fbp'] || null,
    fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : cookies['_fbc'] || null,
  };
}
