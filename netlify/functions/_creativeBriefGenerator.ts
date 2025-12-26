import OpenAI from 'openai';
import { getSupabaseAdmin } from './_supabaseAdmin';

export interface CreativeBrief {
  title: string;
  description: string;
  vibe_constraints: string[];
  hook_suggestions: string[];
  inspo_references: Array<{
    type: 'past_creative' | 'vibe_match' | 'performance_winner';
    description: string;
    url?: string;
    why_it_worked?: string;
  }>;
  filming_suggestions: {
    time_of_day: string;
    duration_minutes: number;
    locations: string[];
    props_needed: string[];
  };
}

export async function generateCreativeBrief(
  campaign_id: string,
  vibe_constraints: string[],
  reason: string
): Promise<CreativeBrief> {
  const supabase = getSupabaseAdmin();

  const { data: campaign } = await supabase
    .from('ghoste_campaigns')
    .select('*, ad_creatives(*)')
    .eq('id', campaign_id)
    .single();

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const campaignType = campaign?.campaign_type || 'unknown';
  const vibes = vibe_constraints.join(', ');

  const pastCreatives = campaign?.config?.creative_ids || [];
  let topCreativeContext = '';

  if (pastCreatives.length > 0) {
    const { data: creatives } = await supabase
      .from('ad_creatives')
      .select('hook_style, energy_level, hook_strength, platform_fit')
      .in('id', pastCreatives)
      .order('hook_strength', { ascending: false })
      .limit(3);

    if (creatives && creatives.length > 0) {
      topCreativeContext = `\n\nTop performing creatives from this campaign:\n${creatives.map((c, i) =>
        `${i + 1}. Hook: ${c.hook_style}, Energy: ${c.energy_level}, Strength: ${c.hook_strength}/100`
      ).join('\n')}`;
    }
  }

  const prompt = `Generate a creative brief for new ad content.

Campaign Type: ${campaignType}
Vibe Preferences: ${vibes}
Reason for request: ${reason}
${topCreativeContext}

Generate:
1. Brief title (catchy, 3-5 words)
2. Description (2-3 sentences, what to film)
3. 5 hook suggestions (first 3 seconds ideas)
4. Filming suggestions:
   - Best time of day
   - Duration (15-60 seconds)
   - Location ideas (3)
   - Props needed
5. 3 inspo references based on vibes and past winners

Keep it simple, actionable, and focused on the vibe.

Return JSON: {
  "title": "...",
  "description": "...",
  "hook_suggestions": [...],
  "inspo_references": [
    {"type": "past_creative", "description": "...", "why_it_worked": "..."},
    ...
  ],
  "filming_suggestions": {
    "time_of_day": "...",
    "duration_minutes": 30,
    "locations": [...],
    "props_needed": [...]
  }
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a creative director helping artists make compelling video content for ads. Be specific, actionable, and inspiring.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    return {
      title: result.title || 'New Content Brief',
      description: result.description || 'Create fresh video content',
      vibe_constraints,
      hook_suggestions: result.hook_suggestions || [],
      inspo_references: result.inspo_references || [],
      filming_suggestions: result.filming_suggestions || {
        time_of_day: 'golden hour',
        duration_minutes: 30,
        locations: ['studio', 'outdoor'],
        props_needed: [],
      },
    };
  } catch (error) {
    console.error('[generateCreativeBrief] Error:', error);

    return {
      title: 'New Video Content Needed',
      description: 'Create 2-3 fresh video clips showcasing your music.',
      vibe_constraints,
      hook_suggestions: [
        'Start with you performing the hook',
        'Show authentic behind-the-scenes moments',
        'Capture energy and vibe of the track',
      ],
      inspo_references: [],
      filming_suggestions: {
        time_of_day: 'flexible',
        duration_minutes: 30,
        locations: ['anywhere comfortable'],
        props_needed: [],
      },
    };
  }
}

export async function createCreativeRequest(
  user_id: string,
  campaign_id: string,
  brief: CreativeBrief,
  reason: string,
  urgency: 'low' | 'normal' | 'high'
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const suggestedDate = new Date();
  suggestedDate.setDate(suggestedDate.getDate() + (urgency === 'high' ? 1 : 3));

  const { data: request, error } = await supabase
    .from('creative_requests')
    .insert([{
      owner_user_id: user_id,
      campaign_id,
      request_reason: reason,
      urgency,
      brief_title: brief.title,
      brief_description: brief.description,
      brief_vibe_constraints: brief.vibe_constraints,
      brief_hook_suggestions: brief.hook_suggestions,
      brief_inspo_references: brief.inspo_references,
      filming_suggested_date: suggestedDate.toISOString().split('T')[0],
      filming_time_of_day: brief.filming_suggestions.time_of_day,
      filming_duration_minutes: brief.filming_suggestions.duration_minutes,
      status: 'pending',
    }])
    .select()
    .single();

  if (error) {
    console.error('[createCreativeRequest] Error:', error);
    throw error;
  }

  console.log('[createCreativeRequest] ✅ Created:', request.id);

  return request.id;
}
