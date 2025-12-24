import { lazy, ComponentType } from 'react';

const RECOVERY_FLAG = 'ghoste_chunk_recover';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Enhanced lazy loader with chunk error recovery
 *
 * Features:
 * - Retries failed imports up to MAX_RETRIES times
 * - Detects chunk load errors (stale builds, network issues)
 * - Reloads page once per session on chunk error
 * - Prevents infinite reload loops
 *
 * Usage:
 * const MyPage = lazyWithRecovery(() => import('./pages/MyPage'));
 */
export function lazyWithRecovery<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const loadWithRetry = async (attempt: number = 0): Promise<{ default: T }> => {
      try {
        return await importFn();
      } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || '';

        // Detect chunk load errors
        const isChunkError =
          errorMsg.includes('Failed to fetch dynamically imported module') ||
          errorMsg.includes('ChunkLoadError') ||
          errorMsg.includes('Loading chunk') ||
          errorMsg.includes('Importing a module script failed') ||
          errorMsg.includes('error loading dynamically imported module') ||
          errorMsg.includes('Failed to load module');

        if (isChunkError) {
          console.warn(`[lazyWithRecovery] Chunk error detected (attempt ${attempt + 1}/${MAX_RETRIES}):`, errorMsg);

          // Check if we've already reloaded this session
          const hasReloaded = sessionStorage.getItem(RECOVERY_FLAG);

          if (!hasReloaded) {
            // First chunk error this session - reload the page
            console.warn('[lazyWithRecovery] Setting recovery flag and reloading page...');
            sessionStorage.setItem(RECOVERY_FLAG, '1');
            window.location.reload();

            // Return a promise that never resolves (page is reloading)
            return new Promise(() => {});
          } else {
            // Already reloaded - retry import before giving up
            if (attempt < MAX_RETRIES) {
              console.warn(`[lazyWithRecovery] Retrying import after ${RETRY_DELAY}ms...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              return loadWithRetry(attempt + 1);
            } else {
              // Exhausted retries - throw error to show recovery UI
              console.error('[lazyWithRecovery] Max retries exhausted, throwing error');
              throw new Error(
                'Failed to load page component. This usually means you need to refresh. ' +
                'If the problem persists, please clear your cache.'
              );
            }
          }
        }

        // Not a chunk error - throw immediately
        throw error;
      }
    };

    return loadWithRetry();
  });
}
