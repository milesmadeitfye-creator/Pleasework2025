/**
 * Video Chunk Planning for Multi-Segment Sora Videos (Server-Side)
 *
 * This is a copy of src/lib/videoChunkPlan.ts for use in Netlify functions
 */

export type ChunkPlan = {
  chunks: number[];
  totalSeconds: number;
};

export function makeChunkPlan(targetSeconds: number): ChunkPlan {
  if (targetSeconds <= 4) return { chunks: [4], totalSeconds: 4 };
  if (targetSeconds <= 8) return { chunks: [8], totalSeconds: 8 };
  if (targetSeconds <= 12) return { chunks: [12], totalSeconds: 12 };

  const chunks: number[] = [];
  let remaining = targetSeconds;

  while (remaining >= 12) {
    chunks.push(12);
    remaining -= 12;
  }

  if (remaining > 0) {
    if (remaining >= 1 && remaining <= 3) {
      chunks.push(4);
    } else if (remaining === 4) {
      chunks.push(4);
    } else if (remaining >= 5 && remaining <= 7) {
      chunks.push(8);
    } else if (remaining === 8) {
      chunks.push(8);
    } else if (remaining >= 9 && remaining <= 11) {
      chunks.push(12);
    }
  }

  const totalSeconds = chunks.reduce((sum, s) => sum + s, 0);
  return { chunks, totalSeconds };
}

export function isMultiSegmentDuration(seconds: number): boolean {
  return seconds > 12 && [15, 30, 60].includes(seconds);
}
