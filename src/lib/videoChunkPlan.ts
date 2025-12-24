/**
 * Video Chunk Planning for Multi-Segment Sora Videos
 *
 * Rules:
 * - Use mostly 12s chunks (Sora's sweet spot)
 * - Fill remainder with 8s or 4s
 * - Over-generate if needed (trim in editor)
 */

export type ChunkPlan = {
  chunks: number[];
  totalSeconds: number;
};

/**
 * Create a chunk plan for the target duration
 *
 * @param targetSeconds - Desired video length (15, 30, 60)
 * @returns Plan with chunks array and total seconds
 *
 * @example
 * makeChunkPlan(15) // { chunks: [12, 4], totalSeconds: 16 }
 * makeChunkPlan(30) // { chunks: [12, 12, 8], totalSeconds: 32 }
 * makeChunkPlan(60) // { chunks: [12, 12, 12, 12, 12], totalSeconds: 60 }
 */
export function makeChunkPlan(targetSeconds: number): ChunkPlan {
  // For standard durations, return immediately
  if (targetSeconds <= 4) return { chunks: [4], totalSeconds: 4 };
  if (targetSeconds <= 8) return { chunks: [8], totalSeconds: 8 };
  if (targetSeconds <= 12) return { chunks: [12], totalSeconds: 12 };

  const chunks: number[] = [];
  let remaining = targetSeconds;

  // Fill with 12s chunks first
  while (remaining >= 12) {
    chunks.push(12);
    remaining -= 12;
  }

  // Handle remainder
  if (remaining > 0) {
    // Remainder 1-3: add 4s (slight over-generation)
    if (remaining >= 1 && remaining <= 3) {
      chunks.push(4);
      remaining = 0;
    }
    // Remainder 4: perfect fit
    else if (remaining === 4) {
      chunks.push(4);
      remaining = 0;
    }
    // Remainder 5-7: add 8s (slight over-generation)
    else if (remaining >= 5 && remaining <= 7) {
      chunks.push(8);
      remaining = 0;
    }
    // Remainder 8: perfect fit
    else if (remaining === 8) {
      chunks.push(8);
      remaining = 0;
    }
    // Remainder 9-11: add 12s (slight over-generation)
    else if (remaining >= 9 && remaining <= 11) {
      chunks.push(12);
      remaining = 0;
    }
  }

  const totalSeconds = chunks.reduce((sum, s) => sum + s, 0);

  return { chunks, totalSeconds };
}

/**
 * Check if a duration requires multi-segment generation
 */
export function isMultiSegmentDuration(seconds: number): boolean {
  return seconds > 12 && [15, 30, 60].includes(seconds);
}

/**
 * Get the allowed durations for video generation
 */
export const ALLOWED_DURATIONS = [4, 8, 12, 15, 30, 60] as const;
export const SINGLE_SEGMENT_DURATIONS = [4, 8, 12] as const;
export const MULTI_SEGMENT_DURATIONS = [15, 30, 60] as const;

/**
 * Validate that a duration is allowed
 */
export function isAllowedDuration(seconds: number): boolean {
  return ALLOWED_DURATIONS.includes(seconds as any);
}
