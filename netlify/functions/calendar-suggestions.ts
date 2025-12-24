/**
 * Calendar Suggestions
 *
 * Uses Ghoste AI to suggest calendar events based on user context,
 * existing events, and marketing best practices.
 */

import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { getSupabaseAdminClient } from './_supabaseAdmin';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const MODEL = 'gpt-4.1-mini';

type SuggestedEvent = {
  title: string;
  description?: string;
  start_time: string;
  end_time?: string;
  category: string;
  icon?: string;
  color?: string;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}') as {
      userId?: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
      campaignType?: string;
    };

    const { userId, startDate, endDate, goal, campaignType } = body;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'missing_user_id' })
      };
    }

    const supabase = getSupabaseAdminClient();

    // Fetch existing events for context
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('title, due_at, category, status')
      .eq('user_id', userId)
      .gte('due_at', startDate || new Date().toISOString())
      .lte('due_at', endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('due_at', { ascending: true });

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('artist_name')
      .eq('user_id', userId)
      .maybeSingle();

    const artistName = (profile as any)?.artist_name || 'Unknown Artist';

    const systemPrompt = `You are Ghoste AI, a music marketing strategist.

Your task is to analyze the user's existing calendar and suggest NEW events they should add.

CONTEXT:
- Artist: ${artistName}
- Goal: ${goal || 'General marketing and content planning'}
- Campaign Type: ${campaignType || 'General'}
- Date Range: ${startDate || 'Today'} to ${endDate || '30 days from now'}

EXISTING EVENTS:
${existingTasks?.length ? existingTasks.map(t => `- ${t.due_at}: ${t.title} (${t.category || 'uncategorized'})`).join('\n') : 'No existing events'}

INSTRUCTIONS:
1. Suggest 5-10 NEW events that fill gaps in their calendar
2. Focus on practical marketing activities: content creation, posting schedules, ad check-ins, release prep
3. Suggest events at realistic times (weekdays for work, consider timezone)
4. ALWAYS assign a category: content, release, ads, tour, admin, promo, meeting
5. Make titles actionable: "Film 3 TikToks for new single", "Check Meta ads performance", etc.

OUTPUT FORMAT:
Return a JSON array ONLY (no markdown, no code blocks):
[
  {
    "title": "Event title",
    "description": "Optional description",
    "start_time": "ISO 8601 datetime with timezone",
    "end_time": "ISO 8601 datetime (optional)",
    "category": "content|release|ads|tour|admin|promo|meeting"
  }
]`;

    console.log('[calendar-suggestions] Making OpenAI call for user', userId);

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Suggest calendar events for me based on the context provided.' }
      ],
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content || '[]';
    console.log('[calendar-suggestions] OpenAI response:', responseText);

    // Parse JSON from response
    let suggestions: SuggestedEvent[] = [];
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestions = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('[calendar-suggestions] Failed to parse OpenAI response:', parseError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'failed_to_parse_suggestions',
          detail: 'AI response was not valid JSON'
        })
      };
    }

    console.log('[calendar-suggestions] Parsed', suggestions.length, 'suggestions');

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        suggested_events: suggestions,
      })
    };

  } catch (err: any) {
    console.error('[calendar-suggestions] Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'calendar_suggestions_failed',
        detail: err?.message || String(err)
      })
    };
  }
};
