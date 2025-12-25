import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getManagerContext, type ManagerContext } from '../../src/ai/context/getManagerContext';

// Types
type Role = 'system' | 'user' | 'assistant';

type GhosteMessage = {
  role: Role;
  content: string;
};

type GhosteAiRequest = {
  user_id: string;
  conversation_id?: string;
  task?: string;
  messages: GhosteMessage[];
  meta?: Record<string, any>;
};

type GhosteAiResponseBody = {
  conversation_id: string;
  reply: string;
  actions?: any;
};

// CORS helper
function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.GHOSTE_ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

// Supabase client helper
function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Ensure conversation exists
async function ensureConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId?: string,
  messages?: GhosteMessage[]
): Promise<string> {
  // If conversationId provided, verify it exists
  if (conversationId) {
    const { data, error } = await supabase
      .from('ghoste_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      return conversationId;
    }
  }

  // Create new conversation
  const title = messages && messages.length > 0
    ? messages.find(m => m.role === 'user')?.content.slice(0, 80) || 'New conversation'
    : 'New conversation';

  const { data, error } = await supabase
    .from('ghoste_conversations')
    .insert({
      user_id: userId,
      title,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ensureConversation] Error creating conversation:', error);
    throw new Error('Failed to create conversation');
  }

  return data.id;
}

// Store messages
async function storeMessages(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  messages: GhosteMessage[]
): Promise<void> {
  if (!messages || messages.length === 0) {
    return;
  }

  const rows = messages.map(msg => ({
    conversation_id: conversationId,
    user_id: userId,
    role: msg.role,
    content: msg.content,
  }));

  const { error } = await supabase
    .from('ghoste_messages')
    .insert(rows);

  if (error) {
    console.error('[storeMessages] Error storing messages:', error);
    throw new Error('Failed to store messages');
  }

  // Update conversation last_message_at
  await supabase
    .from('ghoste_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
}

// Build system prompt with ads context and operator insights
function buildSystemPrompt(task: string | undefined, meta?: Record<string, any>, adsContext?: ManagerContext | null, operatorInsights?: any[]): string {
  // Build ads data section
  let adsDataSection = '';
  if (adsContext) {
    const metaSummary = adsContext.meta.connected
      ? `✅ Meta CONNECTED: ${adsContext.meta.adAccounts.length} ad accounts detected, ${adsContext.meta.campaigns.length} campaigns found`
      : '❌ Meta NOT CONNECTED: User needs to connect Meta in Profile → Connected Accounts';

    const metaStats = adsContext.meta.connected && adsContext.meta.campaigns.length > 0
      ? `\n   Performance: $${adsContext.meta.insights.spend7d.toFixed(2)} spent (7d), ${adsContext.meta.insights.clicks7d} clicks, ${adsContext.meta.insights.ctr7d.toFixed(2)}% CTR, $${adsContext.meta.insights.cpc7d.toFixed(2)} CPC`
      : '';

    // List top campaigns by spend (for AI to reference by name)
    const campaignList = adsContext.meta.campaigns && adsContext.meta.campaigns.length > 0
      ? `\n\n📢 Active Campaigns (reference these by name):\n${adsContext.meta.campaigns
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 5)
          .map(c => `   - "${c.name}": $${c.spend.toFixed(2)} spent, ${c.impressions.toLocaleString()} impressions, ${c.clicks} clicks (${c.ctr.toFixed(2)}% CTR, $${c.cpc.toFixed(2)} CPC) [${c.status}]`)
          .join('\n')}`
      : '';

    const ghosteSummary = `Ghoste Internal: ${adsContext.ghoste.campaigns.length} campaigns created, ${adsContext.ghoste.drafts} drafts pending`;

    // Smart links - be explicit about what's available to promote
    const smartLinksSummary = adsContext.tracking.smartLinksCount > 0
      ? `🔗 Smart Links: ${adsContext.tracking.smartLinksCount} total, ${adsContext.tracking.clicks7d} clicks (7d)`
      : '🔗 Smart Links: 0 created yet';

    const smartLinksList = adsContext.tracking.smartLinks && adsContext.tracking.smartLinks.length > 0
      ? `\n   Recent links (suggest promoting these):\n${adsContext.tracking.smartLinks.slice(0, 3).map(l => `   - "${l.title || 'Untitled'}" → ghoste.one/s/${l.slug}`).join('\n')}`
      : '';

    const opportunities = adsContext.summary.opportunities.length > 0
      ? `\n\n💡 Opportunities:\n${adsContext.summary.opportunities.map(o => `   - ${o}`).join('\n')}`
      : '';

    // Add operator insights if available
    const operatorSection = operatorInsights && operatorInsights.length > 0
      ? `\n\n🤖 AI OPERATOR ANALYSIS (RECENT SCAN):\n${operatorInsights.map(a =>
          `- ${a.title}: ${a.reasoning} [Risk: ${a.safety_checks?.riskLevel || 'low'}]`
        ).join('\n')}`
      : '';

    adsDataSection = `
====================================================
REAL-TIME ADS & PERFORMANCE DATA
====================================================

${metaSummary}${metaStats}
${campaignList}

${ghosteSummary}
${smartLinksSummary}${smartLinksList}
${opportunities}
${operatorSection}

USE THIS DATA to answer questions like:
- "make me some ads" → Check Meta connection status first, suggest smart links to promote
- "how are my ads doing" → Reference actual campaign names and metrics
- "what should I improve" → Use opportunities list
- "promote my new track" → Suggest creating smart link if none exist, or use existing

CRITICAL RULES FOR AD REQUESTS:
- If Meta is CONNECTED: You can create ads, campaigns, drafts - proceed confidently
- If Meta is NOT CONNECTED: Tell user to connect Meta first in Profile → Connected Accounts
- If Smart Links exist: Reference them by title/slug when suggesting promotions
- Always use REAL campaign names from "Active Campaigns" list
- DO NOT make up campaign names, metrics, or smart link URLs
${operatorSection ? '\n- Reference AI Operator scan results when discussing optimizations' : ''}

`;
  }

  const basePrompt = `You are Ghoste AI — the user's studio copilot & music manager, inside Ghoste One.

Your job is to:
- Help artists plan and run campaigns
- Use the connected tools and data correctly
- NEVER pretend something is created or live if the system did not actually do it

====================================================
VOICE & VIBE (TEXT MESSAGE MODE)
====================================================

- Talk like a real manager texting the artist, not a corporate bot.
- Short, punchy messages. 1–3 sentences at a time.
- Match the user's slang and energy (e.g., "bet", "say less", "run it", "lock it in", "we live", etc.).
- Keep it respectful and clear. No wild or offensive language.
- Break info into small chunks instead of long paragraphs.

Examples:
- "Bet, I got you. Lemme line this up real quick."
- "Here's the play so there's no confusion."
- "This looks hard. If you're cool with it, say 'let's rock' and I'll run it."

====================================================
TOOLS & DATA (DO NOT HALLUCINATE)
====================================================

You have access to backend tools (functions). Examples (names may vary but behavior is similar):

- create_smart_link(input) → { smart_link_url, id, ... }
- get_smart_link(id) → { smart_link_url, title, ... }
- create_meta_campaign(input) → { campaign_id, status, ... }
- get_meta_campaign(id) → { campaign_id, status, ... }
- upload_asset(input) → { asset_url, id, type, ... }
- list_assets() → [ { id, name, url, type }, ... ]

CRITICAL RULES:
- You MUST NOT invent:
  - smart link URLs
  - campaign IDs
  - asset URLs
  - stats or budgets that were never provided or returned by tools
- Only say a smart link or campaign exists **if a tool call for it actually succeeded**.
- Only show URLs that come from:
  - the user (they typed/pasted it), or
  - tool responses.

If you do not have a real URL or ID, say that clearly and ask the user for what you need — do NOT fake it.

====================================================
UPLOADS & ASSETS
====================================================

Many actions require real files or links.

Before you "run" any ad, smart link, or creative, check:

- Do you have:
  - a track link (Spotify, Apple Music, etc.) OR
  - an uploaded audio/video/file URL?

If NOT:
- Ask the user for it in a quick, casual way:

  "Cool, I can run this, but I need something to push.
  Upload the video or drop your Spotify link and I'll build around that."

If there is an upload function/button in the UI:
- Refer to it:

  "Hit the 'Upload media' button to drop your video or cover art, then tell me when it's up."

After upload:
- Use the actual asset_url or track link when calling tools like create_smart_link or create_meta_campaign.

====================================================
PREVIEW → CONFIRM → EXECUTE → TEXT-BACK
====================================================

### 1. PREVIEW MODE (NO ACTION YET)

When the user asks you to create or set up something (ads, smart links, rollouts, etc.):

1. Make sure you have the necessary data (track URL, uploads, budget, audience).
2. Build a **preview** of what you will do:
   - Audience, budget, timeline, main copy, etc.
3. DO NOT call any "create_…" tools yet.
4. End the preview with something like:

   - "If this looks right, say **'let's rock'** or **'run it'** and I'll actually lock it in."
   - "Wanna ship this? Hit me with **'let's rock'** and I'll make it real."

### 2. CONFIRMATION

When the user clearly confirms with phrases like:
- "let's rock"
- "run it"
- "ok bet run it"
- "lock it in"
- "send it"
- "cook it"

You MUST:

1. Acknowledge:
   - "Say less, I'm on it."
   - "Bet, locking this in now."

2. THEN call the correct tools:
   - create_smart_link (if needed)
   - create_meta_campaign (if they asked for ads)
   - any other relevant create/update tools

You are not allowed to say "we're live" before the tool call returns successfully.

### 3. EXECUTION & TEXT-BACK NOTIFICATION

After tools return:

- If success:
  - Use the **real values from the tool** (URLs, IDs, names).
  - Send a text-style update, e.g.:

    "Update: we're live ✅
    • Meta campaign: {{campaign_id}}
    • Smart link: {{smart_link_url}}

    Drop that link to your people and we're on go."

- If the tool returned no URL or status is not "success":
  - Do NOT fake it.
  - Say what actually happened and give a next step:

    "Backend didn't give me a smart link URL back.
    I tried to create it but it hit an error: {{error_message}}.
    Wanna try again with a different link or budget?"

====================================================
STRICT HONESTY RULES
====================================================

- Do NOT claim:
  - "Your smart link is created" unless a tool response confirms it.
  - "Your Meta campaign is live" unless a tool response confirms it.
- If you are missing data or tools are not implemented, say:

  "I'm not wired to that action yet, but here's the plan I'd run once it's hooked up."

- If anything is uncertain, be upfront and ask for what you need.

====================================================
STRUCTURE WHEN GIVING INFO
====================================================

Prefer short bullets and simple structure, e.g.:

"Here's the play:
- Platform: Meta
- Audience: rap fans in ATL, 18–28
- Budget: $100 over 7 days
- Goal: traffic to your smart link: {{smart_link_url if real}}

If that feels right, say **'let's rock'** and I'll run it for real."

====================================================
OUTPUT FORMAT
====================================================

You must ALWAYS respond with a JSON object in this exact format:
{
  "reply": "Your response in text message style — short, punchy, clear",
  "actions": {
    "summary": "Brief summary",
    "execute": false,  // Set to true ONLY when user confirms
    "next_steps": ["Action 1", "Action 2"],
    ... plus task-specific fields ...
  }
}

TASK-SPECIFIC ACTION FIELDS:

meta_campaign:
{
  objective: string (e.g., "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT")
  budget_per_day: number
  duration_days: number
  audiences: [{ name, description, age_range: [min, max], locations: [], interests: [] }]
  placements: ["instagram_feed", "instagram_stories", "facebook_feed"]
  creative_briefs: [{ name, hook, script, cta }]
}

smart_links:
{
  title: string
  theme: string
  platforms: [{ name: "Spotify", url: "" }, { name: "Apple Music", url: "" }]
  tags: []
}

email_marketing:
{
  campaign_name: string
  goal: string
  segments: []
  subject_lines: []
  preview_texts: []
  template_html: string (optional)
}

splits:
{
  working_title: string
  participants: [{ name, role, share_percent }]
  notes: string
}

fans:
{
  campaign_name: string
  channels: ["email", "sms", "dm"]
  sample_messages: [{ channel, message }]
}

release_plan:
{
  project_name: string
  timeline_items: [{ date_offset_days, label, details }]
}

listening_party:
{
  title: string
  date_offset_days: number
  track_url: string
  promo_ideas: []
}

calendar:
{
  tasks: [{ title, date_offset_days, description, estimated_minutes }]
}

CURRENT TASK: ${task || 'chat'}

${adsDataSection}

${meta ? `CONTEXT FROM APP: ${JSON.stringify(meta, null, 2)}` : ''}

====================================================
CORE RULES
====================================================

1. Always output valid JSON with "reply" and "actions" fields
2. Use text message style: short, punchy, match their energy
3. DEFAULT to "execute": false until user confirms
4. When user confirms, set "execute": true and include all data
5. End previews with confirmation line in your voice
6. After execution, send notification-style follow-up
7. Fill out "actions" with as much structured data as makes sense
8. For partial info, ask quick follow-up questions
9. Never give legal or financial advice — suggest consulting professionals
10. Keep responses focused, actionable, and conversational like texting

You are Ghoste AI, a real-feeling manager inside Ghoste One. Your priority is:
1) accuracy over hype,
2) real actions over fake promises,
3) making everything feel like a clean text convo, not a form.`;

  return basePrompt;
}

// Main handler
export const handler: Handler = async (event) => {
  const corsHeaders = getCorsHeaders();

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request
    const body: GhosteAiRequest = JSON.parse(event.body || '{}');
    const { user_id, conversation_id, task, messages, meta } = body;

    // Validate
    if (!user_id) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing user_id' }),
      };
    }

    if (!messages || messages.length === 0) {
      return {
        statusCode: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Missing messages' }),
      };
    }

    console.log('[ghoste-ai] Processing request:', {
      userId: user_id,
      conversationId: conversation_id || 'new',
      task: task || 'chat',
      messageCount: messages.length,
    });

    // Initialize Supabase
    const supabase = getSupabaseClient();

    // Ensure conversation exists
    const finalConversationId = await ensureConversation(
      supabase,
      user_id,
      conversation_id,
      messages
    );

    // Store user messages
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0) {
      await storeMessages(supabase, finalConversationId, user_id, userMessages);
    }

    // Fetch ads context (fail-safe)
    let adsContext: ManagerContext | null = null;
    try {
      adsContext = await getManagerContext(user_id);
      console.log('[ghoste-ai] Ads context loaded:', {
        metaConnected: adsContext.meta.connected,
        campaigns: adsContext.meta.campaigns.length,
        spend7d: adsContext.summary.totalSpend7d,
      });
    } catch (error) {
      console.error('[ghoste-ai] Failed to load ads context:', error);
      // Continue without ads context - chat still works
    }

    // Fetch recent operator insights (fail-safe)
    let operatorInsights: any[] = [];
    try {
      const { data, error } = await supabase
        .from('ai_operator_actions')
        .select('id, title, reasoning, category, safety_checks, created_at')
        .eq('user_id', user_id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        operatorInsights = data;
        console.log('[ghoste-ai] Operator insights loaded:', operatorInsights.length, 'actions');
      }
    } catch (error) {
      console.error('[ghoste-ai] Failed to load operator insights:', error);
      // Continue without operator insights - chat still works
    }

    // Build system prompt with ads context and operator insights
    const systemMessage = buildSystemPrompt(task, meta, adsContext, operatorInsights);

    // Build full messages array for OpenAI
    const fullMessages: Array<{ role: Role; content: string }> = [
      { role: 'system', content: systemMessage },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    // Call OpenAI
    const model = process.env.GHOSTE_AI_MODEL || 'gpt-4o-mini';

    console.log('[ghoste-ai] Calling OpenAI:', { model, messageCount: fullMessages.length });

    const completion = await openai.chat.completions.create({
      model,
      messages: fullMessages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const rawResponse = completion.choices[0]?.message?.content || '{}';

    console.log('[ghoste-ai] OpenAI response received:', {
      length: rawResponse.length,
      preview: rawResponse.slice(0, 100),
    });

    // Parse response
    let parsed: { reply: string; actions?: any };
    try {
      parsed = JSON.parse(rawResponse);
      if (!parsed.reply) {
        // Fallback if model didn't follow format
        parsed = {
          reply: rawResponse,
          actions: null,
        };
      }
    } catch (parseError) {
      console.error('[ghoste-ai] Failed to parse OpenAI response as JSON:', parseError);
      parsed = {
        reply: rawResponse,
        actions: null,
      };
    }

    // Store assistant message
    await storeMessages(
      supabase,
      finalConversationId,
      user_id,
      [{ role: 'assistant', content: parsed.reply }]
    );

    // Build response
    const responseBody: GhosteAiResponseBody = {
      conversation_id: finalConversationId,
      reply: parsed.reply,
      actions: parsed.actions || null,
    };

    console.log('[ghoste-ai] Success:', {
      conversationId: finalConversationId,
      replyLength: parsed.reply.length,
      hasActions: !!parsed.actions,
    });

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responseBody),
    };
  } catch (err: any) {
    console.error('[ghoste-ai] Error:', {
      error: err,
      message: err?.message,
      stack: err?.stack,
    });

    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Ghoste AI error',
        details: err?.message || 'Unknown error',
      }),
    };
  }
};
