import type { Handler } from '@netlify/functions';

const DEBUG_VERSION = 'ghoste-ai-suggestions-2025-12-15-v2-json-forced';

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    },
    body: JSON.stringify(body),
  };
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function fallbackSuggestions() {
  return [
    {
      id: 'post-idea',
      title: 'Post idea',
      why: 'Drop a 15s teaser with the hook + on-screen lyrics. CTA: "link in bio for full song."',
      category: 'social',
      priority: 'high',
    },
    {
      id: 'ad-quick-win',
      title: 'Ad quick win',
      why: 'Run a $10/day engagement campaign to your best-performing clip, then retarget video viewers.',
      category: 'ads',
      priority: 'high',
    },
    {
      id: 'smart-link-optimization',
      title: 'Smart link optimization',
      why: 'Set Spotify as primary, enable pixel + CAPI tracking, and add a pre-save for unreleased tracks.',
      category: 'links',
      priority: 'medium',
    },
    {
      id: 'email-sms',
      title: 'Email/SMS',
      why: 'Send a short fan message: new release, story behind it, and one clear CTA to the smart link.',
      category: 'content',
      priority: 'medium',
    },
    {
      id: 'calendar-planning',
      title: 'Plan your week',
      why: 'Schedule content creation sessions, promo posts, and release prep tasks in your calendar.',
      category: 'calendar',
      priority: 'medium',
    },
    {
      id: 'analytics-check',
      title: 'Check analytics',
      why: 'Review your streaming stats to identify which tracks are performing best and where your fans are.',
      category: 'analytics',
      priority: 'low',
    },
  ];
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, rej) =>
        ac.signal.addEventListener('abort', () => rej(new Error('timeout')))
      ),
    ]);
  } finally {
    clearTimeout(t);
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const request_id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
      return json(405, {
        ok: false,
        error: 'Method not allowed',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    const OPENAI_API_KEY =
      process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!OPENAI_API_KEY) {
      console.error('[ghoste-ai-suggestions] Missing OPENAI_API_KEY', {
        request_id,
        debug_version: DEBUG_VERSION,
      });
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'missing_openai_key',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    let payload: any = {};
    try {
      payload = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      console.error('[ghoste-ai-suggestions] Invalid JSON body', {
        request_id,
        debug_version: DEBUG_VERSION,
      });
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'invalid_json_body',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    const { artistName, goal, context } = payload || {};
    const prompt = `Return ONLY JSON with shape:
{"suggestions":[{"id":"unique-id","title":"...","why":"...","category":"social|ads|links|content|analytics|calendar|splits","priority":"high|medium|low"}]}

Artist: ${artistName || 'Unknown'}
Goal: ${goal || 'Growth'}
Context: ${
      typeof context === 'string' ? context : JSON.stringify(context || {})
    }
Generate 4-6 practical suggestions. Keep each "why" under 240 characters.`;

    // Use a very conservative, compatible endpoint call.
    const openaiReq = fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return ONLY valid JSON. No markdown. No commentary. Must match: {"suggestions":[{...}]}',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const resp = await withTimeout(openaiReq, 12000);
    const text = await resp.text();

    if (!resp.ok) {
      console.error('[ghoste-ai-suggestions] OpenAI non-OK', {
        status: resp.status,
        body: text?.slice(0, 1200),
        request_id,
        debug_version: DEBUG_VERSION,
      });
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'openai_non_ok',
        status: resp.status,
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('[ghoste-ai-suggestions] OpenAI returned non-JSON', {
        body: text?.slice(0, 1200),
        request_id,
        debug_version: DEBUG_VERSION,
      });
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'openai_non_json',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    const content = data?.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      const maybeJson = extractFirstJsonObject(String(content));
      parsed = JSON.parse(maybeJson || String(content));
    } catch (e) {
      console.error('[ghoste-ai-suggestions] Model content not JSON', {
        content: String(content).slice(0, 1200),
        request_id,
        debug_version: DEBUG_VERSION,
      });
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'model_content_not_json',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : null;
    if (!suggestions || suggestions.length === 0) {
      return json(200, {
        ok: true,
        suggestions: fallbackSuggestions(),
        degraded: true,
        reason: 'empty_suggestions',
        debug_version: DEBUG_VERSION,
        request_id,
      });
    }

    return json(200, {
      ok: true,
      suggestions,
      debug_version: DEBUG_VERSION,
      request_id,
    });
  } catch (err: any) {
    console.error('[ghoste-ai-suggestions] Uncaught error', {
      message: err?.message,
      stack: err?.stack,
      request_id: `${Date.now()}-uncaught`,
      debug_version: DEBUG_VERSION,
    });

    // IMPORTANT: still return 200 + fallback so UI never bricks
    return json(200, {
      ok: true,
      suggestions: fallbackSuggestions(),
      degraded: true,
      reason: 'uncaught_exception',
      debug_version: DEBUG_VERSION,
    });
  }
};
