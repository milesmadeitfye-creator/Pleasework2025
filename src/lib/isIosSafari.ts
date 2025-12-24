/**
 * iOS Safari Detection
 *
 * Detects if running on Safari browser on iOS (iPhone/iPad/iPod)
 * Used to disable WebSocket on iOS Safari to prevent crashes
 */

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isWebkit = /WebKit/.test(ua);
  const isCriOS = /CriOS/.test(ua);
  const isFxiOS = /FxiOS/.test(ua);

  // Safari on iOS is WebKit but not Chrome/Firefox wrappers
  return isIOS && isWebkit && !isCriOS && !isFxiOS;
}

/**
 * Check if running on any iOS device (including Chrome/Firefox)
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua);
}

/**
 * Check if running on mobile Safari (iOS or iPadOS)
 */
export function isMobileSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/.test(ua) && /Mobile/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
}
