import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

/**
 * admin-ads-engine-chat — Claude-powered natural language interface for the Ads Engine.
 *
 * Takes a freeform prompt like "Run an ad for my new track Midnight targeting
 * 18-25 hip hop fans, $200 budget" and:
 * 1. Parses it with Claude to extract structured fields
 * 2. Creates the job in the database
 * 3. Optionally auto-starts the pipeline
 *
 * POST { prompt: string, autoStart?: boolean }
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface ParsedCampaign {
  artist_name: string;
  song_title: string;
  song_url?: string;
  cover_art_url?: string;
  target_audience?: string;
  budget_usd?: number;
  platform?: string;
  notes?: string;
  should_start?: boolean;
}

const SYSTEM_PROMPT = `You are an ad campaign parser for Ghoste, a music platform. Extract structured campaign data from natural language prompts.

Always return valid JSON with these fields:
{
  "artist_name": "string (required - the artist/musician name)",
  "song_title": "string (required - the song or track name)",
  "song_url": "string or null (Spotify/Apple Music/YouTube URL if mentioned)",
  "cover_art_url": "string or null (image URL if mentioned)",
  "target_audience": "string or null (audience description - age, genre, location, interests)",
  "budget_usd": "number or null (budget in USD if mentioned)",
  "platform": "meta (default) - which ad platform",
  "notes": "string or null (any extra context or special instructions)",
  "should_start": "boolean - true if the user wants to immediately start/run/launch the pipeline, false if they just want to create/draft it"
}

If the prompt is vague or missing required fields, make reasonable assumptions:
- If no artist name: use "Unknown Artist"
- If no song title: use "Untitled Track"
- If no audience: suggest a reasonable one based on genre clues
- If no budget: leave null
- Default platform is always "meta" (Facebook + Instagram)

If the prompt seems like a question or not a campaign request, still return the JSON but set artist_name to "NOT_A_CAMPAIGN" so the system can respond conversationally instead.

Return ONLY the JSON object, no markdown fences, no explanation.`;

async function parseWithClaude(prompt: string): Promise<ParsedCampaign> {
  // Try using Anthropic API key from environment
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    // Fallback: basic regex parsing if no API key
    return fallbackParse(prompt);
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[ads-engine-chat] Claude API error:', response.status);
      return fallbackParse(prompt);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';

    // Parse the JSON response
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed as ParsedCampaign;
  } catch (err) {
    console.error('[ads-engine-chat] Claude parsing failed, using fallback:', err);
    return fallbackParse(prompt);
  }
}

function fallbackParse(prompt: string): ParsedCampaign {
  const lower = prompt.toLowerCase();

  // Extract budget
  const budgetMatch = prompt.match(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  const budget = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : undefined;

  // Extract URL
  const urlMatch = prompt.match(/(https?:\/\/[^\s]+)/i);
  const url = urlMatch ? urlMatch[1] : undefined;

  // Try to extract "for [artist] - [song]" or "[song] by [artist]"
  let artist = 'Unknown Artist';
  let song = 'Untitled Track';

  const forMatch = prompt.match(/(?:for|by)\s+([^,\-–]+?)(?:\s*[-–]\s*|\s+called\s+|\s+titled\s+)([^,.$]+)/i);
  if (forMatch) {
    artist = forMatch[1].trim();
    song = forMatch[2].trim();
  } else {
    // Try "run ad for [song] by [artist]"
    const byMatch = prompt.match(/(?:ad|campaign|promo)\s+(?:for\s+)?["']?([^"']+?)["']?\s+by\s+["']?([^"',.$]+)/i);
    if (byMatch) {
      song = byMatch[1].trim();
      artist = byMatch[2].trim();
    } else {
      // Try quoted strings
      const quotes = prompt.match(/["']([^"']+)["']/g);
      if (quotes && quotes.length >= 2) {
        artist = quotes[0].replace(/["']/g, '');
        song = quotes[1].replace(/["']/g, '');
      } else if (quotes && quotes.length === 1) {
        song = quotes[0].replace(/["']/g, '');
      }
    }
  }

  // Extract audience hints
  let audience: string | undefined;
  const ageMatch = prompt.match(/(\d{2}\s*-\s*\d{2})/);
  const genreWords = ['hip hop', 'rap', 'r&b', 'pop', 'rock', 'indie', 'electronic', 'country', 'latin', 'afrobeats'];
  const foundGenre = genreWords.find(g => lower.includes(g));
  if (ageMatch || foundGenre) {
    const parts = [];
    if (ageMatch) parts.push(`ages ${ageMatch[1]}`);
    if (foundGenre) parts.push(`${foundGenre} fans`);
    const locationMatch = prompt.match(/\bin\s+(the\s+)?(US|USA|UK|Canada|Europe|worldwide|global)/i);
    if (locationMatch) parts.push(`in ${locationMatch[2]}`);
    audience = parts.join(', ');
  }

  const shouldStart = /\b(run|start|launch|go|execute|fire|begin|kick off)\b/i.test(lower);

  return {
    artist_name: artist,
    song_title: song,
    song_url: url?.includes('spotify') || url?.includes('apple') || url?.includes('youtube') ? url : undefined,
    cover_art_url: url && !url.includes('spotify') && !url.includes('apple') && (url.includes('.jpg') || url.includes('.png') || url.includes('.webp')) ? url : undefined,
    target_audience: audience,
    budget_usd: budget,
    platform: 'meta',
    should_start: shouldStart,
  };
}

export async function handler(event: HandlerEvent) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    let body: any = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'invalid_json' });
    }

    const prompt = (body.prompt || '').trim();
    if (!prompt) return json(400, { error: 'prompt_required' });

    const autoStart = body.autoStart !== false; // default true

    // Parse the prompt with Claude (or fallback)
    const parsed = await parseWithClaude(prompt);

    // If not a campaign request, return conversational response
    if (parsed.artist_name === 'NOT_A_CAMPAIGN') {
      return json(200, {
        ok: true,
        type: 'conversation',
        message: "I'm the Ghoste Ads Engine. Tell me about the artist, song, target audience, and budget and I'll build the full ad pipeline. Example: \"Run an ad for Drake - God's Plan targeting 18-30 hip hop fans in the US, $500 budget\"",
        parsed,
      });
    }

    const sb = getServiceClient();

    // Create the job
    const { data: job, error: insertErr } = await sb
      .from('ads_engine_jobs')
      .insert([{
        created_by: auth.admin.userId,
        artist_name: parsed.artist_name,
        song_title: parsed.song_title,
        song_url: parsed.song_url || null,
        cover_art_url: parsed.cover_art_url || null,
        target_audience: parsed.target_audience || null,
        budget_cents: parsed.budget_usd ? Math.round(parsed.budget_usd * 100) : 0,
        status: 'draft',
        current_step: 'copy',
        platform: parsed.platform || 'meta',
        pipeline: {
          prompt,
          parsed,
          created_via: 'chat',
        },
      }])
      .select('*')
      .single();

    if (insertErr || !job) {
      console.error('[ads-engine-chat] insert failed', insertErr);
      return json(500, { error: 'failed_to_create_job' });
    }

    // Auto-start pipeline if requested
    const shouldStart = autoStart && (parsed.should_start !== false);
    if (shouldStart) {
      // Update job to running
      await sb.from('ads_engine_jobs').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', job.id);

      // Create step logs
      const steps = ['copy', 'video', 'composite', 'publish'];
      const stepLogs = steps.map((step, i) => ({
        job_id: job.id,
        step,
        status: i === 0 ? 'running' : 'pending',
        started_at: i === 0 ? new Date().toISOString() : null,
      }));
      await sb.from('ads_engine_step_logs').insert(stepLogs);

      job.status = 'running';
    }

    // Audit log
    await logAdminAction(auth.admin, {
      action: 'ads_engine_job_created',
      payload: { job_id: job.id, prompt, parsed, auto_started: shouldStart },
    }).catch(() => {});

    // Build response message
    const parts = [`Created campaign for **${parsed.artist_name} — ${parsed.song_title}**`];
    if (parsed.target_audience) parts.push(`Audience: ${parsed.target_audience}`);
    if (parsed.budget_usd) parts.push(`Budget: $${parsed.budget_usd}`);
    parts.push(`Platform: Meta (FB + IG)`);
    if (shouldStart) {
      parts.push(`Pipeline started — Step 1/4: Claude is writing ad copy...`);
    } else {
      parts.push(`Status: Draft — say "start it" or click Start Pipeline to begin.`);
    }

    return json(200, {
      ok: true,
      type: 'campaign_created',
      message: parts.join('\n'),
      job: {
        id: job.id,
        artist_name: parsed.artist_name,
        song_title: parsed.song_title,
        status: job.status,
        target_audience: parsed.target_audience,
        budget_usd: parsed.budget_usd,
        platform: parsed.platform,
      },
      parsed,
      auto_started: shouldStart,
    });
  } catch (err) {
    console.error('[ads-engine-chat] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
