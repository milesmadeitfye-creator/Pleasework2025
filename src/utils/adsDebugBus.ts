/**
 * Ads Debug Bus - Global debug state for ads operations
 * Stores last run info in memory + localStorage
 */

export interface AdsDebugRun {
  at: string; // ISO timestamp
  label: 'publish' | 'saveDraft' | 'other';
  request: unknown;
  response: unknown;
  status: number;
  ok: boolean;
}

declare global {
  interface Window {
    __ghoste_ads_debug_last_run?: AdsDebugRun;
  }
}

const STORAGE_KEY = 'ghoste_ads_debug_last_run';

export function setAdsDebugLastRun(payload: AdsDebugRun): void {
  // Store in memory
  window.__ghoste_ads_debug_last_run = payload;

  // Persist to localStorage (best effort)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[AdsDebugBus] Failed to save to localStorage:', e);
  }
}

export function getAdsDebugLastRun(): AdsDebugRun | null {
  // Try memory first
  if (window.__ghoste_ads_debug_last_run) {
    return window.__ghoste_ads_debug_last_run;
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AdsDebugRun;
      // Restore to memory
      window.__ghoste_ads_debug_last_run = parsed;
      return parsed;
    }
  } catch (e) {
    console.warn('[AdsDebugBus] Failed to read from localStorage:', e);
  }

  return null;
}

export function clearAdsDebugLastRun(): void {
  delete window.__ghoste_ads_debug_last_run;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[AdsDebugBus] Failed to clear localStorage:', e);
  }
}
