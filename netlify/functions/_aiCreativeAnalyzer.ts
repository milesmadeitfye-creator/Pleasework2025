import OpenAI from 'openai';

export interface CreativeAnalysisResult {
  hook_strength: number;
  hook_style: string;
  energy_level: string;
  platform_fit: {
    instagram: number;
    facebook: number;
    tiktok: number;
  };
  pacing_score: number;
  visual_quality: number;
  hook_timestamp_seconds: number;
  hook_description: string;
  hook_effectiveness_reasons: string[];
  pacing_description: string;
  scene_changes: number;
  visual_flow_score: number;
  suggested_captions: string[];
  platform_scores: Record<string, number>;
  best_platforms: string[];
  optimization_suggestions: string[];
}

export async function analyzeCreative(
  videoUrl: string,
  duration_seconds: number,
  userCaption?: string
): Promise<CreativeAnalysisResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Analyze this video creative for ad performance:

Video duration: ${duration_seconds}s
${userCaption ? `User-provided caption: "${userCaption}"` : 'No caption provided'}

Analyze:
1. Hook Strength (1-100): How compelling is the opening 3 seconds?
2. Hook Style: (emotional, action, text-overlay, product-focus, storytelling)
3. Energy Level: (low, medium, high, very-high)
4. Pacing Score (1-100): How well-paced is the video?
5. Visual Quality (1-100): Technical quality of the video
6. Platform Fit: Score each platform (1-100):
   - Instagram (Reels)
   - Facebook (Feed + Stories)
   - TikTok

7. Hook timestamp (seconds): When does the hook happen?
8. Hook description: Brief description of the hook
9. Hook effectiveness reasons (3-5 bullet points)
10. Pacing description: Describe the pacing
11. Scene changes: Approximate number of scene changes
12. Visual flow score (1-100): How smooth is the visual flow?

${!userCaption ? '13. Generate 3 caption variants optimized for Meta ads' : ''}

14. Best platforms: Top 2-3 platforms for this creative
15. Optimization suggestions: 3-5 actionable improvements

Return JSON with all fields.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing video creatives for social media advertising. Provide detailed, actionable analysis in JSON format.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      hook_strength: result.hook_strength || 50,
      hook_style: result.hook_style || 'unknown',
      energy_level: result.energy_level || 'medium',
      platform_fit: result.platform_fit || { instagram: 70, facebook: 70, tiktok: 70 },
      pacing_score: result.pacing_score || 50,
      visual_quality: result.visual_quality || 50,
      hook_timestamp_seconds: result.hook_timestamp_seconds || 0,
      hook_description: result.hook_description || '',
      hook_effectiveness_reasons: result.hook_effectiveness_reasons || [],
      pacing_description: result.pacing_description || '',
      scene_changes: result.scene_changes || 0,
      visual_flow_score: result.visual_flow_score || 50,
      suggested_captions: result.suggested_captions || [],
      platform_scores: result.platform_scores || {},
      best_platforms: result.best_platforms || ['instagram', 'facebook'],
      optimization_suggestions: result.optimization_suggestions || [],
    };
  } catch (error) {
    console.error('[analyzeCreative] Error:', error);

    return {
      hook_strength: 50,
      hook_style: 'unknown',
      energy_level: 'medium',
      platform_fit: { instagram: 70, facebook: 70, tiktok: 70 },
      pacing_score: 50,
      visual_quality: 50,
      hook_timestamp_seconds: 0,
      hook_description: 'Unable to analyze',
      hook_effectiveness_reasons: ['Analysis failed'],
      pacing_description: 'Unknown',
      scene_changes: 0,
      visual_flow_score: 50,
      suggested_captions: [],
      platform_scores: {},
      best_platforms: ['instagram', 'facebook'],
      optimization_suggestions: [],
    };
  }
}

export async function generateCaptions(
  videoDescription: string,
  hookDescription: string,
  adGoal: string
): Promise<string[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const goalContext = {
    promote_song: 'promoting a music release',
    grow_followers: 'growing social media followers',
    capture_fans: 'capturing email/SMS signups',
  }[adGoal] || 'promoting content';

  const prompt = `Generate 3 caption variants for a video ad focused on ${goalContext}.

Video hook: ${hookDescription}
Video description: ${videoDescription}

Requirements:
- 1-2 sentences max
- Compelling hook in first 5 words
- Include clear CTA
- Conversational tone
- No hashtags
- Optimized for Meta ads

Return JSON: { "captions": ["caption1", "caption2", "caption3"] }`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert copywriter for social media ads. Write compelling, concise captions that drive action.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    return result.captions || [];
  } catch (error) {
    console.error('[generateCaptions] Error:', error);
    return [];
  }
}
