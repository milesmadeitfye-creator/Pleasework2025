/**
 * Caption Generator - Artist-First Caption System
 *
 * Generates organic, non-salesy captions for music visuals
 * NO "out now", "available", or CTA language unless artist explicitly adds it
 */

export type CaptionStyle = 'lyric_highlight' | 'mood_captions' | 'minimal_emotion' | 'story_fragments';

export interface Caption {
  text: string;
  start_time: number;
  end_time: number;
  style: CaptionStyle;
  position?: 'top' | 'center' | 'bottom';
  animation?: 'fade' | 'slide' | 'scale';
}

interface GenerateCaptionsOptions {
  style: CaptionStyle;
  targetDuration: number;
  lyrics?: string;
  songTitle?: string;
  artistName?: string;
  vibe?: string;
}

/**
 * Main caption generation function
 */
export function generateCaptions(options: GenerateCaptionsOptions): Caption[] {
  const { style, targetDuration, lyrics } = options;

  switch (style) {
    case 'lyric_highlight':
      return generateLyricHighlightCaptions(options);

    case 'mood_captions':
      return generateMoodCaptions(options);

    case 'minimal_emotion':
      return generateMinimalEmotionCaptions(options);

    case 'story_fragments':
      return generateStoryFragmentCaptions(options);

    default:
      return generateLyricHighlightCaptions(options);
  }
}

/**
 * Lyric Highlight - Show key lyrics at optimal times
 */
function generateLyricHighlightCaptions(options: GenerateCaptionsOptions): Caption[] {
  const { lyrics, targetDuration } = options;

  if (!lyrics || lyrics.trim() === '') {
    return [];
  }

  const captions: Caption[] = [];

  // Split lyrics into lines
  const lines = lyrics
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith('('));

  if (lines.length === 0) {
    return [];
  }

  // Distribute lyrics evenly across duration
  const timePerLine = targetDuration / lines.length;

  lines.forEach((line, index) => {
    const startTime = index * timePerLine;
    const endTime = Math.min((index + 1) * timePerLine, targetDuration);

    // Skip very short durations
    if (endTime - startTime < 1.0) {
      return;
    }

    captions.push({
      text: line,
      start_time: startTime,
      end_time: endTime,
      style: 'lyric_highlight',
      position: 'center',
      animation: 'fade',
    });
  });

  return captions;
}

/**
 * Mood Captions - Short, evocative phrases matching the vibe
 */
function generateMoodCaptions(options: GenerateCaptionsOptions): Caption[] {
  const { targetDuration, vibe } = options;

  const moodPhrases: Record<string, string[]> = {
    cinematic: [
      'Lost in the moment',
      'Where the story begins',
      'Between here and nowhere',
      'Chasing light',
    ],
    energetic: [
      'Feel the rush',
      'All in',
      'No limits',
      'Full speed',
    ],
    dreamy: [
      'Floating through',
      'Soft edges',
      'Somewhere else',
      'Time slows down',
    ],
    urban: [
      'City lights',
      'Late night drive',
      'Streets alive',
      'Concrete dreams',
    ],
    nature: [
      'Wild and free',
      'Earth speaks',
      'Under open skies',
      'Where nature breathes',
    ],
  };

  const phrases = moodPhrases[vibe || 'cinematic'] || moodPhrases.cinematic;
  const captions: Caption[] = [];

  // Show 2-3 mood phrases
  const phraseCount = Math.min(3, Math.floor(targetDuration / 10));
  const timePerPhrase = targetDuration / phraseCount;

  for (let i = 0; i < phraseCount; i++) {
    const phrase = phrases[i % phrases.length];
    const startTime = i * timePerPhrase + 1; // Start after 1s
    const endTime = Math.min(startTime + 3, (i + 1) * timePerPhrase);

    captions.push({
      text: phrase,
      start_time: startTime,
      end_time: endTime,
      style: 'mood_captions',
      position: 'bottom',
      animation: 'slide',
    });
  }

  return captions;
}

/**
 * Minimal Emotion - Single word or very short phrases
 */
function generateMinimalEmotionCaptions(options: GenerateCaptionsOptions): Caption[] {
  const { targetDuration, vibe } = options;

  const emotionWords: Record<string, string[]> = {
    cinematic: ['breathe', 'wonder', 'still', 'wait'],
    energetic: ['go', 'rise', 'now', 'move'],
    dreamy: ['drift', 'soft', 'glow', 'fade'],
    urban: ['drive', 'nights', 'pulse', 'alive'],
    nature: ['wild', 'free', 'sky', 'earth'],
  };

  const words = emotionWords[vibe || 'cinematic'] || emotionWords.cinematic;
  const captions: Caption[] = [];

  // Show 2 minimal words
  const wordCount = Math.min(2, Math.floor(targetDuration / 15));
  const timePerWord = targetDuration / wordCount;

  for (let i = 0; i < wordCount; i++) {
    const word = words[i % words.length];
    const startTime = i * timePerWord + 2;
    const endTime = Math.min(startTime + 2, targetDuration);

    captions.push({
      text: word,
      start_time: startTime,
      end_time: endTime,
      style: 'minimal_emotion',
      position: 'center',
      animation: 'scale',
    });
  }

  return captions;
}

/**
 * Story Fragments - Short narrative phrases (non-salesy)
 */
function generateStoryFragmentCaptions(options: GenerateCaptionsOptions): Caption[] {
  const { targetDuration, songTitle, artistName } = options;

  const fragments = [
    songTitle || 'This song',
    'A feeling',
    'Caught between',
    'Something real',
  ];

  const captions: Caption[] = [];

  // Show 2-3 fragments
  const fragmentCount = Math.min(3, fragments.filter(Boolean).length);
  const timePerFragment = targetDuration / fragmentCount;

  for (let i = 0; i < fragmentCount; i++) {
    const fragment = fragments[i];
    if (!fragment) continue;

    const startTime = i * timePerFragment + 1;
    const endTime = Math.min(startTime + 4, (i + 1) * timePerFragment);

    captions.push({
      text: fragment,
      start_time: startTime,
      end_time: endTime,
      style: 'story_fragments',
      position: 'bottom',
      animation: 'fade',
    });
  }

  return captions;
}

/**
 * Validate captions for loop-safety
 */
export function validateCaptions(
  captions: Caption[],
  totalDuration: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  captions.forEach((caption, index) => {
    if (caption.end_time > totalDuration) {
      errors.push(`Caption ${index} extends beyond video duration`);
    }

    if (caption.start_time >= caption.end_time) {
      errors.push(`Caption ${index} has invalid timing`);
    }

    if (caption.text.length === 0) {
      errors.push(`Caption ${index} has empty text`);
    }

    // Check for selling language (enforce rules)
    const bannedPhrases = ['out now', 'available', 'buy', 'stream now', 'listen now', 'download'];
    const lowerText = caption.text.toLowerCase();

    bannedPhrases.forEach(phrase => {
      if (lowerText.includes(phrase)) {
        errors.push(`Caption ${index} contains banned phrase: "${phrase}"`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Ensure captions are loop-safe (no changes in last 2-3 seconds)
 */
export function makeLoopSafe(
  captions: Caption[],
  totalDuration: number,
  fadeStartTime: number = 0
): Caption[] {
  return captions.map(caption => {
    // If caption starts during fade-out, remove it
    if (caption.start_time >= fadeStartTime) {
      return null;
    }

    // If caption extends into fade-out, trim it
    if (caption.end_time > fadeStartTime) {
      return {
        ...caption,
        end_time: fadeStartTime,
      };
    }

    return caption;
  }).filter((c): c is Caption => c !== null);
}
