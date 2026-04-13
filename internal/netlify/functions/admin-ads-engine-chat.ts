import type { HandlerEvent } from '@netlify/functions';
import { requireAdmin, json } from './_lib/adminAuth';
import { getServiceClient } from './_lib/supabaseAdmin';
import { logAdminAction } from './_lib/audit';

/**
 * Ghoste AI Ads Engine — Claude-powered full-funnel ad pipeline.
 *
 * Takes natural language → parses with Claude (trained on Ghoste brand) →
 * creates campaign job → generates ad copy variants → generates Sora prompts
 * for UGC video → defines Remotion composition → targets Meta (FB + IG).
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// ─── GHOSTE BRAND TRAINING PROMPT ───────────────────────────────────────────

const GHOSTE_SYSTEM_PROMPT = `You are the Ghoste AI Ads Engine — an autonomous advertising system for Ghoste, the all-in-one music business operating system for independent artists.

## ABOUT GHOSTE

Ghoste is a command center that consolidates 10+ music industry tools into one platform. It helps independent artists and managers launch smarter, track everything, and grow faster.

**Core tagline:** "Your music career, operated like a business."
**URL:** https://ghoste.one

### PLANS & PRICING
- **Free** ($0): 5 smart links, basic tools, 7,500 credits/month
- **Artist** ($9/mo): Smart links, pre-save campaigns, email capture, basic analytics, 30K credits/month
- **Growth** ($19/mo — MOST POPULAR): Everything + Ad campaigns, AI assistant, advanced analytics, video tools, 65K credits/month
- **Scale** ($49/mo): Everything + team collab, unlimited allocations, custom integrations, 500K credits/month, white-label
- **7-day free trial** on all paid plans, cancel anytime

### KEY FEATURES
1. Smart Links — one link to all platforms with pixel tracking
2. Meta Ads Manager — AI-optimized campaign builder with real-time tracking
3. Ghoste AI Assistant — autonomous digital manager (brainstorm, plan, execute)
4. Music Distribution — release to all streaming platforms
5. Email Capture & Fan Communication — lists, automations, SMS
6. Cover Art Generation — AI-powered artwork
7. Music Visuals — AI video backgrounds
8. Pre-save Campaigns — drive day-one streams
9. Advanced Analytics — cross-platform dashboards
10. Split Contracts — digital agreements with e-signatures
11. Calendar & Task Management
12. Merch Integration (Printful)
13. Live Streaming (Restream)

### PLATFORM METRICS (social proof)
- 257+ active users
- 356+ smart links created
- 11,000+ AI chat messages
- 116+ ad campaigns launched
- 19+ music releases distributed

## YOUR ROLE

You are a full-funnel ad strategist AND creative director for Ghoste. When someone describes a campaign, you:

1. **Parse** the request into structured campaign data
2. **Determine** the funnel stage and audience segment
3. **Generate** 3 ad copy variants tailored to the audience
4. **Create** a Sora 2 Pro video prompt for UGC-style creative
5. **Define** Remotion composition specs
6. **Set** Meta targeting parameters

## FUNNEL STAGES

### AWARENESS (Top of Funnel — TOF)
- **Goal**: Brand discovery, reach new artists
- **Tone**: Hype, aspirational, curiosity-driven
- **Copy style**: Short, punchy, pattern-interrupt
- **CTA**: "See how" / "Watch this" / "Check it out"
- **Targeting**: Broad — music creators, producers, independent artists, music business
- **Placements**: Reels, Stories, Feed
- **Budget split**: 40% of total

### CONSIDERATION (Middle of Funnel — MOF)
- **Goal**: Feature education, free trial signup
- **Tone**: Informative but energetic, show the product working
- **Copy style**: Feature-benefit, "here's what you get"
- **CTA**: "Try free for 7 days" / "Start for free"
- **Targeting**: Engaged — visited site, watched video, similar audiences
- **Placements**: Feed, In-stream, Stories
- **Budget split**: 35% of total

### CONVERSION (Bottom of Funnel — BOF)
- **Goal**: Free trial → paid conversion, upgrade to Pro
- **Tone**: Urgent, social proof, FOMO
- **Copy style**: Testimonials, results, limited-time
- **CTA**: "Start your free trial" / "Upgrade now" / "Join 257+ artists"
- **Targeting**: Retarget — site visitors, trial users, engaged audience
- **Placements**: Feed, Stories
- **Budget split**: 25% of total

## AUDIENCE SEGMENTS

### Young Emerging Artists (18-24)
- **Tone**: Streetwear/hype culture, slang-heavy, bold
- **Hook examples**: "Stop sleeping on your music career 💤" / "Your music deserves better. Stop playing."
- **Pain points**: No money for marketing, overwhelmed by tools, don't know where to start
- **Platforms**: IG Reels, TikTok-style content

### Serious Independent Artists (25-34)
- **Tone**: Mix of hype and professional, confident
- **Hook examples**: "What if one platform ran your entire release?" / "Artists using AI to grow are winning."
- **Pain points**: Juggling 10 apps, wasting money on bad ads, no data visibility
- **Platforms**: IG Feed + Stories, Facebook

### Managers & Teams (28-45)
- **Tone**: Professional, ROI-focused, efficiency-driven
- **Hook examples**: "Managing 3 artists from one dashboard" / "Cut your team's tool stack in half"
- **Pain points**: Client management overhead, scattered data, billing complexity
- **Platforms**: Facebook Feed, LinkedIn-style messaging

### Established/Mid-Level Artists (30-45)
- **Tone**: Clean, sophisticated, results-driven
- **Hook examples**: "The platform serious artists switch to" / "Your next release deserves a real strategy"
- **Pain points**: Plateaued growth, need better targeting, want professional tools
- **Platforms**: IG Feed, Facebook Feed

## AD COPY RULES

1. **Hook in first 3 words** — pattern interrupt or curiosity gap
2. **No generic marketing speak** — be specific to music/artists
3. **Include social proof** when possible ("257+ artists", "11K+ AI conversations")
4. **Always end with clear CTA** and mention "free" or "7-day trial"
5. **Keep primary text under 125 chars** for mobile
6. **Headline under 40 chars**
7. **Use emojis strategically** — max 2-3 per copy
8. **Never say "click here"** — use action verbs
9. **Match tone to audience segment**

## SORA VIDEO PROMPT GUIDELINES

Generate prompts for Sora 2 Pro that create UGC-style ad creatives:
- **Style**: Phone-recorded feel, authentic, not overproduced
- **Setting**: Studio, bedroom studio, on-the-go with phone, coffee shop laptop
- **Subjects**: Young diverse creators/artists looking at phone/laptop screens
- **Movement**: Subtle camera movement, natural lighting
- **Text overlays**: Will be added by Remotion, so leave clean spaces
- **Duration**: 15-30 seconds
- **Aspect ratio**: 9:16 for Reels/Stories, 1:1 for Feed

## REMOTION COMPOSITION SPECS

Define specs for Remotion to composite the final ad:
- **Resolution**: 1080x1920 (9:16) or 1080x1080 (1:1)
- **Text overlays**: Hook text (top), feature callouts (middle), CTA bar (bottom)
- **Brand elements**: Ghoste logo watermark (bottom-right), brand blue (#1a6cff) accents
- **Animation**: Text fade-in, slide-up CTA, subtle pulsing on key words
- **Audio**: Background beat (royalty-free), voiceover optional
- **End card**: "ghoste.one" + "Start Free" button overlay

## RESPONSE FORMAT

Return a JSON object with this exact structure:
{
  "artist_name": "Ghoste",
  "song_title": "Campaign title/description",
  "funnel_stage": "awareness" | "consideration" | "conversion" | "full_funnel",
  "audience_segment": "young_emerging" | "serious_independent" | "managers_teams" | "established_artists" | "broad",
  "target_audience": "Human-readable audience description",
  "budget_usd": number or null,
  "platform": "meta",
  "ad_copies": [
    {
      "variant": "A",
      "primary_text": "Main ad body text (under 125 chars)",
      "headline": "Headline (under 40 chars)",
      "description": "Link description",
      "cta_button": "Sign Up" | "Learn More" | "Get Started" | "Try Free",
      "placement": "reels" | "stories" | "feed"
    },
    { "variant": "B", ... },
    { "variant": "C", ... }
  ],
  "sora_prompt": "Full Sora 2 Pro prompt for UGC video creative",
  "sora_aspect_ratio": "9:16" | "1:1",
  "sora_duration_seconds": 15 | 30,
  "remotion_spec": {
    "resolution": "1080x1920" | "1080x1080",
    "hook_text": "Big bold text shown first",
    "feature_callouts": ["Feature 1", "Feature 2", "Feature 3"],
    "cta_text": "Start Free Today",
    "cta_url": "https://ghoste.one",
    "brand_color": "#1a6cff",
    "end_card_text": "ghoste.one — Your music, operated."
  },
  "meta_targeting": {
    "age_min": 18,
    "age_max": 45,
    "interests": ["music production", "independent music", ...],
    "excluded_interests": [],
    "locations": ["US"],
    "placements": ["instagram_reels", "instagram_stories", "facebook_feed"],
    "optimization_goal": "CONVERSIONS" | "REACH" | "LINK_CLICKS"
  },
  "should_start": true | false,
  "notes": "Any additional context"
}

If the input is a question or not a campaign request, set artist_name to "NOT_A_CAMPAIGN" and include a helpful response in notes.

Return ONLY the JSON, no markdown fences.`;

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface ParsedCampaign {
  artist_name: string;
  song_title: string;
  funnel_stage?: string;
  audience_segment?: string;
  target_audience?: string;
  budget_usd?: number;
  platform?: string;
  ad_copies?: Array<{
    variant: string;
    primary_text: string;
    headline: string;
    description?: string;
    cta_button?: string;
    placement?: string;
  }>;
  sora_prompt?: string;
  sora_aspect_ratio?: string;
  sora_duration_seconds?: number;
  remotion_spec?: {
    resolution?: string;
    hook_text?: string;
    feature_callouts?: string[];
    cta_text?: string;
    cta_url?: string;
    brand_color?: string;
    end_card_text?: string;
  };
  meta_targeting?: {
    age_min?: number;
    age_max?: number;
    interests?: string[];
    locations?: string[];
    placements?: string[];
    optimization_goal?: string;
  };
  should_start?: boolean;
  notes?: string;
}

// ─── CLAUDE API CALL ────────────────────────────────────────────────────────

async function parseWithClaude(prompt: string): Promise<ParsedCampaign> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (!apiKey) {
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
        max_tokens: 2048,
        system: GHOSTE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[ads-engine-chat] Claude API error:', response.status);
      return fallbackParse(prompt);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as ParsedCampaign;
  } catch (err) {
    console.error('[ads-engine-chat] Claude parsing failed:', err);
    return fallbackParse(prompt);
  }
}

// ─── FALLBACK PARSER (no API key) ───────────────────────────────────────────

function fallbackParse(prompt: string): ParsedCampaign {
  const lower = prompt.toLowerCase();

  const budgetMatch = prompt.match(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  const budget = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : undefined;

  // Determine funnel stage
  let funnel_stage = 'full_funnel';
  if (/\b(awareness|brand|reach|discover)\b/i.test(lower)) funnel_stage = 'awareness';
  else if (/\b(consider|educate|feature|trial|signup)\b/i.test(lower)) funnel_stage = 'consideration';
  else if (/\b(convert|upgrade|retarget|purchase|sale)\b/i.test(lower)) funnel_stage = 'conversion';

  // Determine audience
  let audience_segment = 'broad';
  if (/\b(young|gen z|18.?2[0-5]|emerging)\b/i.test(lower)) audience_segment = 'young_emerging';
  else if (/\b(serious|independent|indie|25.?3[0-5])\b/i.test(lower)) audience_segment = 'serious_independent';
  else if (/\b(manager|team|label|business)\b/i.test(lower)) audience_segment = 'managers_teams';
  else if (/\b(established|mid.?level|veteran|30.?4[0-5])\b/i.test(lower)) audience_segment = 'established_artists';

  const shouldStart = /\b(run|start|launch|go|execute|fire|begin)\b/i.test(lower);

  return {
    artist_name: 'Ghoste',
    song_title: prompt.slice(0, 80),
    funnel_stage,
    audience_segment,
    target_audience: 'Independent music artists and producers 18-45',
    budget_usd: budget,
    platform: 'meta',
    ad_copies: [
      {
        variant: 'A',
        primary_text: 'Stop juggling 10 apps for your music career. One platform. Every move. 🎵',
        headline: 'Your Music, Operated',
        description: 'Smart links, ads, AI manager, distribution — all in one.',
        cta_button: 'Sign Up',
        placement: 'reels',
      },
      {
        variant: 'B',
        primary_text: '257+ artists already running smarter releases. Your turn. 🔥',
        headline: 'Launch Smarter with Ghoste',
        description: '7-day free trial. No card required.',
        cta_button: 'Get Started',
        placement: 'feed',
      },
      {
        variant: 'C',
        primary_text: 'Your next release deserves a real strategy. Not just a prayer. 🙏',
        headline: 'Try Ghoste Free',
        description: 'AI-powered music marketing for independents.',
        cta_button: 'Try Free',
        placement: 'stories',
      },
    ],
    sora_prompt: 'A young diverse music artist in a dimly lit bedroom studio, looking at their laptop screen with excitement. The screen glows blue. They pick up their phone, scroll through analytics, and smile. Filmed on iPhone, natural lighting, subtle camera movement. 9:16 vertical, 15 seconds. UGC authentic style, not overproduced.',
    sora_aspect_ratio: '9:16',
    sora_duration_seconds: 15,
    remotion_spec: {
      resolution: '1080x1920',
      hook_text: 'Stop sleeping on your career',
      feature_callouts: ['Smart Links', 'AI Manager', 'Meta Ads'],
      cta_text: 'Start Free Today',
      cta_url: 'https://ghoste.one',
      brand_color: '#1a6cff',
      end_card_text: 'ghoste.one — Your music, operated.',
    },
    meta_targeting: {
      age_min: 18,
      age_max: 45,
      interests: ['music production', 'independent music', 'songwriting', 'music distribution', 'Spotify for Artists'],
      locations: ['US'],
      placements: ['instagram_reels', 'instagram_stories', 'facebook_feed'],
      optimization_goal: 'CONVERSIONS',
    },
    should_start: shouldStart,
  };
}

// ─── HANDLER ────────────────────────────────────────────────────────────────

export async function handler(event: HandlerEvent) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

    const auth = await requireAdmin(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });

    let body: any = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid_json' }); }

    const prompt = (body.prompt || '').trim();
    if (!prompt) return json(400, { error: 'prompt_required' });

    const autoStart = body.autoStart !== false;
    const parsed = await parseWithClaude(prompt);

    // Not a campaign request
    if (parsed.artist_name === 'NOT_A_CAMPAIGN') {
      return json(200, {
        ok: true,
        type: 'conversation',
        message: parsed.notes || "I'm the Ghoste Ads Engine. Tell me what campaign to run — I'll generate copy, video creative, and targeting for Meta. Try: \"Launch an awareness campaign for Ghoste targeting young hip hop artists, $500 budget\"",
        parsed,
      });
    }

    const sb = getServiceClient();

    // Create the job with full pipeline data
    const { data: job, error: insertErr } = await sb
      .from('ads_engine_jobs')
      .insert([{
        created_by: auth.admin.userId,
        artist_name: parsed.artist_name || 'Ghoste',
        song_title: parsed.song_title || prompt.slice(0, 80),
        target_audience: parsed.target_audience || null,
        budget_cents: parsed.budget_usd ? Math.round(parsed.budget_usd * 100) : 0,
        status: 'draft',
        current_step: 'copy',
        platform: parsed.platform || 'meta',
        copy_text: parsed.ad_copies?.[0]?.primary_text || null,
        copy_variants: parsed.ad_copies || [],
        sora_prompt: parsed.sora_prompt || null,
        pipeline: {
          prompt,
          parsed,
          created_via: 'chat',
          funnel_stage: parsed.funnel_stage,
          audience_segment: parsed.audience_segment,
          ad_copies: parsed.ad_copies,
          sora_prompt: parsed.sora_prompt,
          sora_aspect_ratio: parsed.sora_aspect_ratio,
          sora_duration_seconds: parsed.sora_duration_seconds,
          remotion_spec: parsed.remotion_spec,
          meta_targeting: parsed.meta_targeting,
        },
      }])
      .select('*')
      .single();

    if (insertErr || !job) {
      console.error('[ads-engine-chat] insert failed', insertErr);
      return json(500, { error: 'failed_to_create_job' });
    }

    // Auto-start if requested
    const shouldStart = autoStart && (parsed.should_start !== false);
    if (shouldStart) {
      await sb.from('ads_engine_jobs').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', job.id);

      const steps = ['copy', 'video', 'composite', 'publish'];
      await sb.from('ads_engine_step_logs').insert(
        steps.map((step, i) => ({
          job_id: job.id,
          step,
          status: i === 0 ? 'running' : 'pending',
          started_at: i === 0 ? new Date().toISOString() : null,
        }))
      );
      job.status = 'running';
    }

    await logAdminAction(auth.admin, {
      action: 'ads_engine_job_created',
      payload: { job_id: job.id, prompt, funnel_stage: parsed.funnel_stage, auto_started: shouldStart },
    }).catch(() => {});

    // Build rich response
    const funnelEmoji = { awareness: '📢', consideration: '🤔', conversion: '💰', full_funnel: '🎯' };
    const lines = [
      `**${parsed.artist_name}** — ${parsed.song_title}`,
      `${funnelEmoji[parsed.funnel_stage as keyof typeof funnelEmoji] || '🎯'} Funnel: ${(parsed.funnel_stage || 'full_funnel').replace('_', ' ')}`,
      `👥 Audience: ${parsed.audience_segment?.replace('_', ' ') || 'broad'}`,
    ];

    if (parsed.budget_usd) lines.push(`💵 Budget: $${parsed.budget_usd}`);
    if (parsed.meta_targeting?.placements) lines.push(`📍 Placements: ${parsed.meta_targeting.placements.join(', ')}`);

    lines.push('');
    lines.push('**Ad Copy Variants:**');
    (parsed.ad_copies || []).forEach(c => {
      lines.push(`• [${c.variant}] "${c.primary_text}"`);
    });

    lines.push('');
    if (parsed.sora_prompt) {
      lines.push(`🎬 Sora prompt ready (${parsed.sora_aspect_ratio}, ${parsed.sora_duration_seconds}s)`);
    }
    if (parsed.remotion_spec) {
      lines.push(`🎞️ Remotion spec: "${parsed.remotion_spec.hook_text}" → ${(parsed.remotion_spec.feature_callouts || []).join(' → ')} → "${parsed.remotion_spec.cta_text}"`);
    }

    lines.push('');
    if (shouldStart) {
      lines.push('⚡ Pipeline started — Step 1/4: Generating final ad copy...');
    } else {
      lines.push('📋 Status: Draft — say "start it" or click Start Pipeline.');
    }

    return json(200, {
      ok: true,
      type: 'campaign_created',
      message: lines.join('\n'),
      job: {
        id: job.id,
        artist_name: parsed.artist_name,
        song_title: parsed.song_title,
        status: job.status,
        funnel_stage: parsed.funnel_stage,
        audience_segment: parsed.audience_segment,
        target_audience: parsed.target_audience,
        budget_usd: parsed.budget_usd,
      },
      ad_copies: parsed.ad_copies,
      sora_prompt: parsed.sora_prompt,
      remotion_spec: parsed.remotion_spec,
      meta_targeting: parsed.meta_targeting,
      parsed,
      auto_started: shouldStart,
    });
  } catch (err) {
    console.error('[ads-engine-chat] unhandled error', err);
    return json(500, { error: 'internal_server_error' });
  }
}
