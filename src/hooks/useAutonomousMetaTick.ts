import { useEffect, useRef, useState } from 'react';
import { sendActivityPingV2 } from '../lib/activityPingV2';

interface TickState {
  lastTickTime: number | null;
  nextTickTime: number | null;
  lastAction: string | null;
  lastStatus: 'success' | 'error' | 'idle';
  lastError: string | null;
  isRunning: boolean;
  isUserActive: boolean;
}

interface UseAutonomousMetaTickReturn {
  state: TickState;
  forceTick: () => void;
}

const BASE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const MAX_JITTER_MS = 3 * 60 * 1000; // 3 minutes
const USER_INACTIVE_THRESHOLD_MS = 7 * 60 * 1000; // 7 minutes

function getJitteredDelay(baseMs: number, jitterMs: number): number {
  return baseMs + Math.random() * jitterMs;
}

export function useAutonomousMetaTick(enabled: boolean): UseAutonomousMetaTickReturn {
  const [state, setState] = useState<TickState>({
    lastTickTime: null,
    nextTickTime: null,
    lastAction: null,
    lastStatus: 'idle',
    lastError: null,
    isRunning: false,
    isUserActive: true,
  });

  const timeoutRef = useRef<number | null>(null);
  const mutexRef = useRef<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const activityCheckIntervalRef = useRef<number | null>(null);

  // Track user activity
  useEffect(() => {
    if (!enabled) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      setState(prev => ({ ...prev, isUserActive: true }));
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });

    // Check activity status every minute
    activityCheckIntervalRef.current = window.setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      const isActive = timeSinceActivity < USER_INACTIVE_THRESHOLD_MS;

      setState(prev => {
        if (prev.isUserActive !== isActive) {
          console.log(`[MetaTick] User ${isActive ? 'active' : 'inactive'} (${Math.floor(timeSinceActivity / 1000)}s since last activity)`);
          return { ...prev, isUserActive: isActive };
        }
        return prev;
      });
    }, 60000);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity);
      });
      if (activityCheckIntervalRef.current) {
        clearInterval(activityCheckIntervalRef.current);
      }
    };
  }, [enabled]);

  // Execute tick
  const executeTick = async (isForced = false) => {
    // Check mutex
    if (mutexRef.current) {
      console.log('[MetaTick] Skipped (already running)');
      return;
    }

    // Check if user is active (unless forced)
    if (!isForced && !state.isUserActive) {
      console.log('[MetaTick] Skipped (user inactive)');
      scheduleNextTick();
      return;
    }

    // Check if tab is visible
    if (document.visibilityState !== 'visible') {
      console.log('[MetaTick] Skipped (tab not visible)');
      scheduleNextTick();
      return;
    }

    // Acquire mutex
    mutexRef.current = true;
    setState(prev => ({ ...prev, isRunning: true }));

    try {
      console.log('[MetaTick] Executing tick...');
      const result = await sendActivityPingV2({
        source: 'autonomous_tick',
        path: window.location.pathname,
      });

      const now = Date.now();
      setState(prev => ({
        ...prev,
        lastTickTime: now,
        lastStatus: 'success',
        lastError: null,
        isRunning: false,
      }));

      console.log('[MetaTick] Success:', result.ping_id);

      // Schedule next tick
      scheduleNextTick();
    } catch (err: any) {
      console.error('[MetaTick] Error:', err.message);

      const now = Date.now();
      setState(prev => ({
        ...prev,
        lastTickTime: now,
        lastStatus: 'error',
        lastError: err.message,
        isRunning: false,
      }));

      // Parse server-side delay if provided
      let delayMs = getJitteredDelay(BASE_INTERVAL_MS, MAX_JITTER_MS);

      try {
        const errorData = JSON.parse(err.message || '{}');
        if (errorData.next_delay_seconds) {
          delayMs = Math.max(delayMs, errorData.next_delay_seconds * 1000);
          console.log(`[MetaTick] Server requested delay: ${errorData.next_delay_seconds}s`);
        }
      } catch (parseErr) {
        // Not JSON, use default delay
      }

      scheduleNextTick(delayMs);
    } finally {
      // Release mutex
      mutexRef.current = false;
    }
  };

  // Schedule next tick
  const scheduleNextTick = (customDelayMs?: number) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const delayMs = customDelayMs || getJitteredDelay(BASE_INTERVAL_MS, MAX_JITTER_MS);
    const nextTime = Date.now() + delayMs;

    setState(prev => ({ ...prev, nextTickTime: nextTime }));

    console.log(`[MetaTick] Next tick in ${Math.floor(delayMs / 1000)}s (${Math.floor(delayMs / 60000)}m ${Math.floor((delayMs % 60000) / 1000)}s)`);

    timeoutRef.current = window.setTimeout(() => {
      executeTick();
    }, delayMs);
  };

  // Force tick (for manual trigger or resume from inactivity)
  const forceTick = () => {
    console.log('[MetaTick] Force tick requested');
    executeTick(true);
  };

  // Main effect: start autonomous ticking
  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Start initial tick
    console.log('[MetaTick] Starting autonomous Meta usage engine');
    scheduleNextTick();

    // Resume on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[MetaTick] Tab visible, checking if tick needed');
        // Check if we missed a tick while hidden
        if (state.nextTickTime && Date.now() > state.nextTickTime) {
          console.log('[MetaTick] Missed tick while hidden, executing now');
          forceTick();
        }
      } else {
        console.log('[MetaTick] Tab hidden, ticks will pause');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  // Resume tick when user becomes active again
  useEffect(() => {
    if (enabled && state.isUserActive && !state.isRunning) {
      // If user just became active and no tick is scheduled, run one
      if (!timeoutRef.current && state.lastTickTime) {
        const timeSinceLastTick = Date.now() - state.lastTickTime;
        if (timeSinceLastTick > USER_INACTIVE_THRESHOLD_MS) {
          console.log('[MetaTick] User active again after inactivity, resuming');
          forceTick();
        }
      }
    }
  }, [enabled, state.isUserActive, state.isRunning, state.lastTickTime]);

  return { state, forceTick };
}