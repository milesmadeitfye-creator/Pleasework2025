/**
 * Prompt Builder - Converts plain English to structured video prompts
 * Always generates B-roll style prompts (never talking head)
 */

export type BrollStyle =
  | 'performance'       // Artist/musician vibes: stage, studio, city nights, crowd energy
  | 'lifestyle'         // Daily moments: fashion, travel, candid shots
  | 'product'           // Product/app promo: UI overlays, hands-on, clean graphics
  | 'cinematic'         // Dramatic storytelling
  | 'minimal'           // Clean, simple, focused
  | 'energetic';        // Fast-paced, dynamic

export interface PromptAnalysis {
  final_prompt: string;
  broll_style: BrollStyle;
  shot_list: Array<{
    description: string;
    duration: string;
    camera_motion: string;
  }>;
  pacing: string;
  lighting: string;
  mood: string;
  transitions: string;
  aspect_ratio: string;
  text_safe_areas: boolean;
}

export interface PromptOptions {
  seconds?: number;
  orientation?: 'vertical' | 'horizontal' | 'square';
  platform?: 'meta' | 'tiktok' | 'youtube' | 'general';
  userIntent?: string; // e.g., 'music video', 'product demo', 'lifestyle vlog'
}

/**
 * Analyzes plain English input and detects B-roll style
 */
function detectBrollStyle(input: string): BrollStyle {
  const lowerInput = input.toLowerCase();

  // Performance indicators
  if (
    lowerInput.includes('music') ||
    lowerInput.includes('artist') ||
    lowerInput.includes('perform') ||
    lowerInput.includes('stage') ||
    lowerInput.includes('concert') ||
    lowerInput.includes('band') ||
    lowerInput.includes('singer') ||
    lowerInput.includes('crowd')
  ) {
    return 'performance';
  }

  // Lifestyle indicators
  if (
    lowerInput.includes('fashion') ||
    lowerInput.includes('travel') ||
    lowerInput.includes('daily') ||
    lowerInput.includes('vlog') ||
    lowerInput.includes('lifestyle') ||
    lowerInput.includes('candid') ||
    lowerInput.includes('street')
  ) {
    return 'lifestyle';
  }

  // Product indicators
  if (
    lowerInput.includes('product') ||
    lowerInput.includes('app') ||
    lowerInput.includes('phone') ||
    lowerInput.includes('ui') ||
    lowerInput.includes('demo') ||
    lowerInput.includes('showcase') ||
    lowerInput.includes('hands')
  ) {
    return 'product';
  }

  // Energetic indicators
  if (
    lowerInput.includes('fast') ||
    lowerInput.includes('dynamic') ||
    lowerInput.includes('energetic') ||
    lowerInput.includes('action') ||
    lowerInput.includes('movement')
  ) {
    return 'energetic';
  }

  // Minimal indicators
  if (
    lowerInput.includes('minimal') ||
    lowerInput.includes('clean') ||
    lowerInput.includes('simple') ||
    lowerInput.includes('focused')
  ) {
    return 'minimal';
  }

  // Default to cinematic for storytelling
  return 'cinematic';
}

/**
 * Builds structured prompt from plain English + style
 */
export function buildVideoPrompt(
  plainEnglish: string,
  options: PromptOptions = {}
): PromptAnalysis {
  const {
    seconds = 8,
    orientation = 'vertical',
    platform = 'general',
    userIntent = '',
  } = options;

  // Detect B-roll style
  const brollStyle = detectBrollStyle(plainEnglish + ' ' + userIntent);

  // Build aspect ratio
  const aspectRatioMap = {
    vertical: '9:16',
    horizontal: '16:9',
    square: '1:1',
  };
  const aspectRatio = aspectRatioMap[orientation];

  // Style-specific enhancements
  let stylePrompt = '';
  let lighting = '';
  let pacing = '';
  let transitions = '';
  let shotList: Array<{ description: string; duration: string; camera_motion: string }> = [];

  switch (brollStyle) {
    case 'performance':
      stylePrompt = 'Cinematic B-roll of music performance. Dynamic stage lighting with purple and blue hues. Crowd energy. Studio shots with atmospheric smoke. City nightscape. Close-ups of instruments and hands. Never show talking head or direct address to camera.';
      lighting = 'Dramatic stage lighting, volumetric fog, neon accents, golden hour for outdoor shots';
      pacing = 'Beat-synced cuts every 2-3 seconds, energy builds throughout';
      transitions = 'Quick cuts, light leaks, chromatic aberration for energy';
      shotList = [
        { description: 'Wide shot of stage with dramatic lighting', duration: '2s', camera_motion: 'Slow push in' },
        { description: 'Close-up of hands on instrument', duration: '1.5s', camera_motion: 'Handheld shake' },
        { description: 'Crowd reaction, hands up', duration: '1.5s', camera_motion: 'Static' },
        { description: 'Medium shot of performer with atmospheric smoke', duration: '2s', camera_motion: 'Slow orbit' },
        { description: 'City nightscape with neon lights', duration: '1s', camera_motion: 'Drone shot' },
      ];
      break;

    case 'lifestyle':
      stylePrompt = 'Lifestyle B-roll capturing authentic moments. Natural lighting. Fashion-forward shots. Travel and exploration. Candid interactions. Street photography aesthetic. Never show talking head or vlogging style.';
      lighting = 'Natural light, golden hour, soft window light, urban neon at night';
      pacing = 'Relaxed cuts every 3-4 seconds, smooth flow';
      transitions = 'Smooth dissolves, match cuts, gentle fades';
      shotList = [
        { description: 'Wide establishing shot of location', duration: '2s', camera_motion: 'Slow pan' },
        { description: 'Medium shot of subject in motion', duration: '2s', camera_motion: 'Follow tracking' },
        { description: 'Close-up of details (fashion, food, objects)', duration: '1.5s', camera_motion: 'Static macro' },
        { description: 'Candid moment, natural interaction', duration: '2s', camera_motion: 'Handheld subtle' },
        { description: 'Wide shot at different angle', duration: '0.5s', camera_motion: 'Static' },
      ];
      break;

    case 'product':
      stylePrompt = 'Product showcase B-roll. Clean studio setup or lifestyle integration. Focus on product features and UI. Hands-on demonstration. Motion graphics overlays. Sleek camera movements. Never show talking head or presenter.';
      lighting = 'Clean studio lighting, gradient backgrounds, rim lighting, screen glow';
      pacing = 'Deliberate cuts every 2-3 seconds, emphasize key features';
      transitions = 'Wipes, zoom transitions, graphic overlays';
      shotList = [
        { description: 'Product hero shot on clean surface', duration: '2s', camera_motion: 'Slow rotation' },
        { description: 'Hands interacting with product/UI', duration: '2s', camera_motion: 'Overhead tracking' },
        { description: 'Close-up of key feature', duration: '1.5s', camera_motion: 'Macro push in' },
        { description: 'Lifestyle context shot', duration: '1.5s', camera_motion: 'Dolly slide' },
        { description: 'Final product beauty shot', duration: '1s', camera_motion: 'Static' },
      ];
      break;

    case 'energetic':
      stylePrompt = 'High-energy B-roll with dynamic movement. Fast-paced action shots. Vibrant colors. Quick camera movements. Athletic or kinetic scenes. Never show talking head or static presenter.';
      lighting = 'High contrast, saturated colors, motion blur for speed, sharp highlights';
      pacing = 'Rapid cuts every 1-2 seconds, constant motion';
      transitions = 'Whip pans, speed ramps, glitch effects';
      shotList = [
        { description: 'Action shot with motion blur', duration: '1s', camera_motion: 'Fast whip pan' },
        { description: 'Close-up of dynamic movement', duration: '1.5s', camera_motion: 'High speed follow' },
        { description: 'Wide shot showing full action', duration: '2s', camera_motion: 'Drone sweep' },
        { description: 'Detail shot with speed ramp', duration: '1.5s', camera_motion: 'Slow-mo to real-time' },
        { description: 'Explosive transition shot', duration: '2s', camera_motion: 'Crash zoom out' },
      ];
      break;

    case 'minimal':
      stylePrompt = 'Minimalist B-roll with clean composition. Simple focused shots. Negative space. Geometric patterns. Zen aesthetic. Never show talking head or people speaking.';
      lighting = 'Soft even lighting, subtle shadows, clean white or gradient backgrounds';
      pacing = 'Slow deliberate cuts every 4-5 seconds, breathing room';
      transitions = 'Simple fades, clean cuts, minimal effects';
      shotList = [
        { description: 'Clean wide shot with negative space', duration: '3s', camera_motion: 'Static or subtle drift' },
        { description: 'Centered medium shot, symmetrical', duration: '2s', camera_motion: 'Slow zoom' },
        { description: 'Abstract close-up, texture', duration: '2s', camera_motion: 'Minimal movement' },
        { description: 'Return to wide, different angle', duration: '1s', camera_motion: 'Static' },
      ];
      break;

    case 'cinematic':
    default:
      stylePrompt = 'Cinematic B-roll with storytelling atmosphere. Dramatic lighting and shadows. Epic camera movements. Rich color grading. Visual narrative without dialogue. Never show talking head or monologue.';
      lighting = 'Cinematic three-point lighting, god rays, dramatic shadows, moody atmosphere';
      pacing = 'Measured cuts every 3-4 seconds, building narrative tension';
      transitions = 'L-cuts, match cuts, cross dissolves, motivated wipes';
      shotList = [
        { description: 'Epic establishing shot', duration: '2.5s', camera_motion: 'Dramatic crane or drone' },
        { description: 'Atmospheric medium shot', duration: '2s', camera_motion: 'Slow dolly push' },
        { description: 'Intimate close-up with shallow DOF', duration: '1.5s', camera_motion: 'Handheld subtle' },
        { description: 'Dramatic reveal shot', duration: '1.5s', camera_motion: 'Track and reveal' },
        { description: 'Final wide shot', duration: '0.5s', camera_motion: 'Static hold' },
      ];
      break;
  }

  // Build final structured prompt
  const final_prompt = `${plainEnglish.trim()}. ${stylePrompt}

TECHNICAL SPECS:
- Duration: ${seconds} seconds
- Aspect Ratio: ${aspectRatio}
- Pacing: ${pacing}
- Lighting: ${lighting}
- Transitions: ${transitions}
- Camera: ${shotList.map(s => s.camera_motion).join(', ')}
- Mood: Professional, polished, never amateur or home video quality
- Text-Safe: Maintain clear areas in ${orientation === 'vertical' ? 'top and bottom thirds' : 'left and right thirds'} for captions

CRITICAL: This is B-roll only. No talking heads, no direct address to camera, no presenter speaking. Focus on visual storytelling through action, atmosphere, and cinematic composition.`;

  return {
    final_prompt,
    broll_style: brollStyle,
    shot_list: shotList,
    pacing,
    lighting,
    mood: `${brollStyle} aesthetic`,
    transitions,
    aspect_ratio: aspectRatio,
    text_safe_areas: true,
  };
}

/**
 * Quick validation that audio is present when required
 */
export function validateAudioRequirement(
  audioUrl: string | null | undefined,
  audioSourceType: string | null | undefined
): { valid: boolean; error?: string } {
  if (!audioSourceType || audioSourceType === 'none') {
    return { valid: true }; // Audio optional
  }

  if (!audioUrl || audioUrl.trim() === '') {
    return {
      valid: false,
      error: 'Audio source type specified but no audio URL provided',
    };
  }

  // Basic URL validation
  try {
    new URL(audioUrl);
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Invalid audio URL format',
    };
  }
}
