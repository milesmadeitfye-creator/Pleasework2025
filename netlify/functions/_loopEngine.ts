/**
 * Loop Engine - Core logic for creating continuous videos from short B-roll clips
 *
 * Takes 4-6 short clips and creates a seamless 20/30/40s video with:
 * - No immediate repetition
 * - Micro-variations on repeated clips
 * - Smooth transitions
 * - Beat-aware cuts (when possible)
 */

export interface BrollClip {
  id: string;
  file_url: string;
  duration_seconds: number;
  energy_level: 'low' | 'medium' | 'high';
  aesthetic: string[];
}

export interface TimelineSegment {
  clip_id: string;
  clip_url: string;
  start_time: number;
  duration: number;

  // Micro-variations
  scale: number; // 0.97 - 1.03
  pan_x: number; // -20 to 20 pixels
  speed: number; // 0.95 - 1.05
  mirror: boolean;

  // Metadata
  is_repeat: boolean;
  energy_level: string;
}

export interface LoopTimeline {
  segments: TimelineSegment[];
  total_duration: number;
  clip_usage_count: Record<string, number>;
}

export interface CaptionTimestamp {
  text: string;
  start_time: number;
  end_time: number;
  style?: string;
}

/**
 * Build a deterministic timeline from clips to reach target duration
 */
export function buildLoopTimeline(
  clips: BrollClip[],
  targetDuration: number,
  lyricTimestamps?: CaptionTimestamp[]
): LoopTimeline {
  if (clips.length === 0) {
    throw new Error('No clips provided to loop engine');
  }

  const segments: TimelineSegment[] = [];
  const clipUsageCount: Record<string, number> = {};

  let currentTime = 0;
  let lastClipId: string | null = null;
  let clipIndex = 0;

  // Initialize usage count
  clips.forEach(clip => {
    clipUsageCount[clip.id] = 0;
  });

  // Build timeline until we reach target duration
  while (currentTime < targetDuration) {
    // Select next clip (avoid immediate repetition)
    let selectedClip: BrollClip;

    if (clips.length === 1) {
      // Only one clip available
      selectedClip = clips[0];
    } else {
      // Find a clip that wasn't used last
      const availableClips = clips.filter(c => c.id !== lastClipId);

      if (availableClips.length === 0) {
        // Fallback: use least used clip
        selectedClip = clips.reduce((least, curr) =>
          clipUsageCount[curr.id] < clipUsageCount[least.id] ? curr : least
        );
      } else {
        // Use round-robin with energy variation
        selectedClip = availableClips[clipIndex % availableClips.length];
        clipIndex++;
      }
    }

    const isRepeat = clipUsageCount[selectedClip.id] > 0;
    const remainingTime = targetDuration - currentTime;
    const clipDuration = Math.min(selectedClip.duration_seconds, remainingTime);

    // Apply micro-variations if this is a repeat
    const variation = isRepeat ? generateMicroVariation(clipUsageCount[selectedClip.id]) : null;

    segments.push({
      clip_id: selectedClip.id,
      clip_url: selectedClip.file_url,
      start_time: currentTime,
      duration: clipDuration,

      // Variations
      scale: variation?.scale ?? 1.0,
      pan_x: variation?.pan_x ?? 0,
      speed: variation?.speed ?? 1.0,
      mirror: variation?.mirror ?? false,

      is_repeat: isRepeat,
      energy_level: selectedClip.energy_level,
    });

    clipUsageCount[selectedClip.id]++;
    currentTime += clipDuration;
    lastClipId = selectedClip.id;
  }

  // Adjust last segment if we overshot
  if (segments.length > 0 && currentTime > targetDuration) {
    const lastSegment = segments[segments.length - 1];
    const overshoot = currentTime - targetDuration;
    lastSegment.duration -= overshoot;
  }

  return {
    segments,
    total_duration: targetDuration,
    clip_usage_count: clipUsageCount,
  };
}

/**
 * Generate deterministic micro-variations based on usage count
 */
function generateMicroVariation(usageCount: number): {
  scale: number;
  pan_x: number;
  speed: number;
  mirror: boolean;
} {
  // Use usage count as seed for deterministic variations
  const seed = usageCount;

  // Pseudo-random but deterministic
  const random = (min: number, max: number, offset: number = 0) => {
    const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
    const normalized = x - Math.floor(x);
    return min + normalized * (max - min);
  };

  return {
    scale: random(0.97, 1.03, 1),
    pan_x: random(-20, 20, 2),
    speed: random(0.95, 1.05, 3),
    mirror: seed % 3 === 0, // Mirror every 3rd repeat
  };
}

/**
 * Find optimal cut points based on lyric changes
 */
export function findLyricCutPoints(
  timeline: LoopTimeline,
  lyricTimestamps: CaptionTimestamp[]
): number[] {
  const cutPoints: number[] = [];

  lyricTimestamps.forEach(lyric => {
    // Add cut point at start of each lyric line
    cutPoints.push(lyric.start_time);
  });

  return cutPoints.sort((a, b) => a - b);
}

/**
 * Adjust timeline segments to align with cut points (if beneficial)
 */
export function alignToCutPoints(
  timeline: LoopTimeline,
  cutPoints: number[],
  maxAdjustment: number = 0.5 // Max 0.5s adjustment
): LoopTimeline {
  const adjustedSegments = [...timeline.segments];

  cutPoints.forEach(cutPoint => {
    // Find segment that contains this cut point
    const segmentIndex = adjustedSegments.findIndex(seg =>
      seg.start_time <= cutPoint && (seg.start_time + seg.duration) > cutPoint
    );

    if (segmentIndex === -1) return;

    const segment = adjustedSegments[segmentIndex];
    const cutOffset = cutPoint - segment.start_time;

    // Only adjust if cut point is close to segment boundary
    if (cutOffset < maxAdjustment) {
      // Shorten segment to align with cut point
      segment.duration = cutOffset;

      // Adjust all subsequent segments
      for (let i = segmentIndex + 1; i < adjustedSegments.length; i++) {
        adjustedSegments[i].start_time = adjustedSegments[i - 1].start_time + adjustedSegments[i - 1].duration;
      }
    }
  });

  return {
    ...timeline,
    segments: adjustedSegments,
  };
}

/**
 * Add fade-out to last 2-3 seconds of timeline
 */
export function addFadeOut(timeline: LoopTimeline, fadeDuration: number = 2.5): LoopTimeline {
  const fadeStartTime = timeline.total_duration - fadeDuration;

  const segmentsWithFade = timeline.segments.map(segment => ({
    ...segment,
    fade_out: segment.start_time >= fadeStartTime,
  }));

  return {
    ...timeline,
    segments: segmentsWithFade,
  };
}

/**
 * Generate complete timeline with all optimizations
 */
export function generateCompleteTimeline(
  clips: BrollClip[],
  targetDuration: number,
  lyricTimestamps?: CaptionTimestamp[]
): LoopTimeline {
  // Build base timeline
  let timeline = buildLoopTimeline(clips, targetDuration, lyricTimestamps);

  // Align to lyric cut points if provided
  if (lyricTimestamps && lyricTimestamps.length > 0) {
    const cutPoints = findLyricCutPoints(timeline, lyricTimestamps);
    timeline = alignToCutPoints(timeline, cutPoints);
  }

  // Add fade-out
  timeline = addFadeOut(timeline);

  return timeline;
}

/**
 * Validate timeline for rendering
 */
export function validateTimeline(timeline: LoopTimeline): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (timeline.segments.length === 0) {
    errors.push('Timeline has no segments');
  }

  timeline.segments.forEach((segment, index) => {
    if (segment.duration <= 0) {
      errors.push(`Segment ${index} has invalid duration: ${segment.duration}`);
    }
    if (!segment.clip_url || segment.clip_url.trim() === '') {
      errors.push(`Segment ${index} has no clip URL`);
    }
  });

  // Check for gaps in timeline
  for (let i = 1; i < timeline.segments.length; i++) {
    const prevEnd = timeline.segments[i - 1].start_time + timeline.segments[i - 1].duration;
    const currentStart = timeline.segments[i].start_time;
    const gap = currentStart - prevEnd;

    if (Math.abs(gap) > 0.1) {
      errors.push(`Gap detected between segment ${i - 1} and ${i}: ${gap}s`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
