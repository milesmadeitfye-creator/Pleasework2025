import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getManagerContext, type ManagerContext } from '../../src/ai/context/getManagerContext';
import { getAISetupStatus, formatSetupStatusForAI, type AISetupStatus } from './_aiSetupStatus';
import { runAdsFromChat } from './_runAdsPipeline';
import { getAIRunAdsContext, formatRunAdsContextForAI, formatMediaForAI, formatMetaForAI } from './_aiCanonicalContext';
import { resolveAttachments, formatAttachmentsForAI } from './_ghosteAttachments';

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

// Build system prompt with setup status, ads context, run ads context, attachments, and operator insights
function buildSystemPrompt(
  task: string | undefined,
  meta?: Record<string, any>,
  setupStatus?: AISetupStatus | null,
  adsContext?: ManagerContext | null,
  operatorInsights?: any[],
  runAdsContext?: string,
  attachments?: string
): string {
  // Inject RUN ADS CONTEXT at the top (SINGLE SOURCE OF TRUTH)
  // CRITICAL: This section OVERRIDES all other Meta/smart link detection
  let runAdsSection = '';
  if (runAdsContext) {
    runAdsSection = `\n\n${runAdsContext}\n\n`;
  }

  // Inject canonical setup status at the top (bypasses RLS, most reliable)
  let setupSection = '';
  if (setupStatus) {
    setupSection = formatSetupStatusForAI(setupStatus);
  }

  // Build ads data section
  let adsDataSection = '';
  if (adsContext) {
    // Override connection status with canonical setup status if available
    const metaConnected = setupStatus ? setupStatus.meta.connected : adsContext.meta.connected;
    const metaSummary = metaConnected
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

${setupSection}

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL RULES (ZERO TOLERANCE FOR VIOLATIONS) 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SETUP STATUS IS CANONICAL
   The "CANONICAL SETUP STATUS (from RPC)" section above is THE ONLY source of truth.
   DO NOT contradict it. DO NOT second-guess it. DO NOT query anything yourself.

2. META CONNECTION
   ${setupStatus?.meta.connected
     ? `✅ Meta IS connected (verified). NEVER say "not connected" or "connect your Meta".
        Ad accounts: ${setupStatus.meta.adAccounts.length}
        Pages: ${setupStatus.meta.pages.length}
        Pixels: ${setupStatus.meta.pixels.length}`
     : `❌ Meta NOT connected. Guide user to Profile → Connected Accounts to connect.`}

3. SMART LINKS
   ${setupStatus?.smartLinks.count > 0
     ? `✅ ${setupStatus.smartLinks.count} smart links exist (verified). NEVER say "no smart links" or "create a smart link".
        Reference these by title/slug when user asks about promotion.`
     : `❌ NO smart links yet. Tell user to create a smart link before running ads.`}

4. CAMPAIGNS
   ${adsContext && adsContext.meta.campaigns.length > 0
     ? `✅ ${adsContext.meta.campaigns.length} campaigns found in DB.
        Use REAL campaign names from list above. DO NOT make up campaign names.`
     : `❌ No campaigns found yet. User hasn't created campaigns.`}

5. PIXELS & CONVERSION TRACKING
   ${setupStatus?.meta.pixels && setupStatus.meta.pixels.length > 0
     ? `✅ ${setupStatus.meta.pixels.length} pixel(s) connected: ${setupStatus.meta.pixels.map(p => p.name).join(', ')}
        If campaigns don't show pixel_id field, explain: "Your pixel is connected (${setupStatus.meta.pixels[0].name}). We attach it during ad set / conversion setup."`
     : `⚠️  No pixels connected yet. Explain: "You need a Meta Pixel for conversion tracking. Connect one in Meta Ads Manager."`}

6. IF YOU VIOLATE THESE RULES
   Your response will be rejected and regenerated. Follow the data exactly.

7. ALWAYS USE REAL DATA
   - Campaign names: from "Active Campaigns" list

8. RESPONSE LENGTH (CRITICAL)
   ⚠️  MAX 3 LINES PER RESPONSE
   - Be ultra-concise
   - No essays, no explanations
   - Example: "Bet. I got the video. I can launch ads with it. Daily budget: $10 / $20 / $50?"
   - Get to the point immediately
   - Smart link slugs: from setup status
   - Metrics: from campaign insights
   - DO NOT fabricate any data

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- If user asks "make me some ads" but has no smart links: Say "Create a smart link first so I know what to promote"
${operatorSection ? '\n- Reference AI Operator scan results when discussing optimizations' : ''}

`;
  }

  const basePrompt = `You are Ghoste AI — the user's studio copilot & music manager, inside Ghoste One.

Your job is to:
- Help artists plan and run campaigns
- Use the connected tools and data correctly
- NEVER pretend something is created or live if the system did not actually do it

${runAdsSection}

${attachments || ''}

====================================================
VOICE & VIBE (SAY LESS MANAGER MODE)
====================================================

CRITICAL: You are a MANAGER, not a chatbot. Talk like you're texting the artist.

RESPONSE STYLE:
- Short acknowledgements ONLY (1-2 sentences max)
- NO long explanations
- NO lists of IDs, account numbers, pixel IDs
- NO multi-paragraph responses
- NO contradictions (if Meta connected, NEVER say "not connected")
- If RUN ADS STATUS section says "Meta CONNECTED", NEVER say it's not connected
- If RUN ADS STATUS section says "X smart links", NEVER say there are none
- NEVER mention "platform vs artist Meta" or "binding assets" - this is internal only
- NEVER explain connection architecture - just say "connected" or "not connected"

SUCCESS RESPONSES:
- "Say less. I'm on it."
- "Bet, running this now."
- "Draft ready — approve?"
- "I'm on it. I'll tap you if I need anything."

BLOCKER RESPONSES (one blocker + one action ONLY):
- "I need the song link."
- "Upload at least 1 video or image."
- "Meta isn't connected — connect it and say 'run ads' again."

FORBIDDEN:
- ❌ "Your Meta ad account ID is act_123456789"
- ❌ "You need to bind platform assets to your artist profile"
- ❌ "Meta is connected at platform level but not artist level"
- ❌ Explaining internal asset resolution or binding logic
- ❌ "You have 3 smart links: link1, link2, link3"
- ❌ "Here's what I found: [long list]"
- ❌ Contradicting setup status (saying "not connected" when it IS connected)

ALLOWED (Analyst Mode ONLY, not Manager Mode):
- Detailed breakdowns when user asks "show me everything"
- Performance metrics when user asks "how's it doing"
- Lists when user explicitly requests them

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

    // COMMAND ROUTER: Check for deterministic intents
    // "run ads" -> runAdsFromChat pipeline (no LLM)
    const latestUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
    if (latestUserMessage) {
      const text = latestUserMessage.content.toLowerCase();

      // Run ads intent patterns
      const runAdsPatterns = [
        /\brun\s+ads\b/i,
        /\brun\s+some\s+ads\b/i,
        /\bstart\s+ads\b/i,
        /\blaunch\s+ads\b/i,
        /\bboost\s+(this|it)\b/i,
        /\bpromote\s+(this|it|my\s+song)\b/i,
        /\bpush\s+(this|it)\b/i,
      ];

      const isRunAdsIntent = runAdsPatterns.some(pattern => pattern.test(text));

      if (isRunAdsIntent) {
        console.log('[ghoste-ai] Detected run ads intent, routing to pipeline');

        // Extract attachments from meta if available
        const attachments = (meta?.attachments || []).map((a: any) => ({
          media_asset_id: a.media_asset_id,
          kind: a.kind,
        }));

        try {
          const result = await runAdsFromChat({
            user_id,
            conversation_id: finalConversationId,
            text: latestUserMessage.content,
            attachments,
          });

          // Store assistant response
          await storeMessages(supabase, finalConversationId, user_id, [
            { role: 'assistant', content: result.response },
          ]);

          return {
            statusCode: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              conversation_id: finalConversationId,
              reply: result.response,
              actions: result.ok ? {
                type: 'run_ads_pipeline',
                draft_id: result.draft_id,
                status: result.status,
              } : undefined,
            }),
          };
        } catch (err: any) {
          console.error('[ghoste-ai] Run ads pipeline error:', err);
          // Fall through to normal LLM response on error
        }
      }
    }

    // STEP 1: Fetch canonical setup status from RPC (SINGLE SOURCE OF TRUTH)
    // CRITICAL: This is the ONLY source for Meta connection and smart links status
    let setupStatus: AISetupStatus | null = null;
    try {
      setupStatus = await getAISetupStatus(user_id);
      console.log('[ghoste-ai] Canonical setup status loaded (from RPC):', {
        metaConnected: setupStatus.meta.connected,
        sourceTable: setupStatus.meta.sourceTable,
        metaAdAccounts: setupStatus.meta.adAccounts.length,
        metaPages: setupStatus.meta.pages.length,
        metaPixels: setupStatus.meta.pixels.length,
        smartLinksCount: setupStatus.smartLinks.count,
        errors: setupStatus.errors.length,
      });
    } catch (error) {
      console.error('[ghoste-ai] Failed to load setup status:', error);
      // Continue without setup status - chat still works
    }

    // STEP 2: Fetch campaign metrics (using setupStatus as input to avoid contradictions)
    // CRITICAL: Pass setupStatus so getManagerContext doesn't re-query connection status
    let adsContext: ManagerContext | null = null;
    try {
      const setupInput = setupStatus ? {
        meta: {
          connected: setupStatus.meta.connected,
          adAccounts: setupStatus.meta.adAccounts,
          pages: setupStatus.meta.pages,
          pixels: setupStatus.meta.pixels,
        },
        smartLinks: {
          count: setupStatus.smartLinks.count,
          recent: setupStatus.smartLinks.recent,
        },
      } : undefined;

      adsContext = await getManagerContext(user_id, setupInput);
      console.log('[ghoste-ai] Campaign metrics loaded:', {
        campaigns: adsContext.meta.campaigns.length,
        spend7d: adsContext.summary.totalSpend7d,
        metaConnectedViaInput: setupInput?.meta.connected,
      });
    } catch (error) {
      console.error('[ghoste-ai] Failed to load campaign metrics:', error);
      // Continue without ads context - chat still works
    }

    // STEP 3: Fetch CANONICAL RUN ADS CONTEXT (ai_media_assets + ai_meta_context)
    // CRITICAL: Single source of truth - no contradictions possible
    let aiRunAdsContext = null;
    let runAdsContextFormatted = '';
    try {
      aiRunAdsContext = await getAIRunAdsContext(user_id);
      runAdsContextFormatted = formatRunAdsContextForAI(aiRunAdsContext);
      console.log('[ghoste-ai] AI canonical context loaded:', {
        hasMedia: aiRunAdsContext.hasMedia,
        metaConnected: aiRunAdsContext.metaConnected,
        canRunAds: aiRunAdsContext.canRunAds,
        blocker: aiRunAdsContext.blocker,
      });
    } catch (error) {
      console.error('[ghoste-ai] Failed to load AI canonical context:', error);
      // Continue without context - chat still works
    }

    // STEP 4: Resolve attachments from media_assets (CANONICAL SOURCE)
    // CRITICAL: Uses service role to bypass RLS
    let resolvedAttachments: Awaited<ReturnType<typeof resolveAttachments>> = [];
    let attachmentsFormatted = '';
    if (meta?.attachments && meta.attachments.length > 0) {
      try {
        resolvedAttachments = await resolveAttachments(user_id, meta.attachments);
        attachmentsFormatted = formatAttachmentsForAI(resolvedAttachments);
        console.log('[ghoste-ai] Resolved', resolvedAttachments.length, 'attachments from media_assets');
      } catch (error) {
        console.error('[ghoste-ai] Failed to resolve attachments:', error);
        // Continue without attachments - chat still works
      }
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

    // Build system prompt with setup status, ads context, run ads context, attachments, and operator insights
    const systemMessage = buildSystemPrompt(
      task,
      meta,
      setupStatus,
      adsContext,
      operatorInsights,
      runAdsContextFormatted,
      attachmentsFormatted
    );

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

    // GUARDRAILS: Detect and fix contradictions
    if (setupStatus && parsed.reply) {
      const replyLower = parsed.reply.toLowerCase();
      let hadContradiction = false;
      const violations: string[] = [];

      // Check 1: If RPC says Meta connected, AI must not say disconnected
      if (setupStatus.meta.connected) {
        const disconnectPhrases = [
          'not connected',
          'isn\'t connected',
          'no meta account',
          'connect your meta',
          'no ad accounts connected',
          'no pages connected',
          'no pixels connected'
        ];

        for (const phrase of disconnectPhrases) {
          if (replyLower.includes(phrase) && replyLower.includes('meta')) {
            hadContradiction = true;
            violations.push(`Meta is connected but AI claimed: "${phrase}"`);
            break;
          }
        }
      }

      // Check 2: If RPC says smart links exist, AI must not say none
      if (setupStatus.smartLinks.count > 0) {
        const noLinksPhrases = ['no smart links', 'create a smart link', 'no links yet'];
        for (const phrase of noLinksPhrases) {
          if (replyLower.includes(phrase)) {
            hadContradiction = true;
            violations.push(`${setupStatus.smartLinks.count} smart links exist but AI claimed: "${phrase}"`);
            break;
          }
        }
      }

      // If contradiction detected, log and apply correction
      if (hadContradiction) {
        console.error('[ghoste-ai] 🚨 CONTRADICTION DETECTED:', violations);

        const facts = [
          `Meta connected: ${setupStatus.meta.connected} (source: ${setupStatus.meta.sourceTable})`,
          `Ad accounts: ${setupStatus.meta.adAccounts.length}`,
          `Pages: ${setupStatus.meta.pages.length}`,
          `Pixels: ${setupStatus.meta.pixels.length}`,
          `Smart links: ${setupStatus.smartLinks.count}`,
        ];

        parsed.reply = `[System corrected contradictory response]

I need to correct myself - I had the wrong information. Here are the facts:

${facts.join('\n')}

Based on this, ${setupStatus.meta.connected && setupStatus.smartLinks.count > 0
  ? `you're all set to run campaigns! You have ${setupStatus.smartLinks.count} smart link${setupStatus.smartLinks.count === 1 ? '' : 's'} and Meta is connected with ${setupStatus.meta.adAccounts.length} ad account${setupStatus.meta.adAccounts.length === 1 ? '' : 's'}. What would you like to promote?`
  : !setupStatus.meta.connected
  ? `you need to connect Meta first (Profile → Connected Accounts), then you can launch campaigns.`
  : setupStatus.smartLinks.count === 0
  ? `you need to create a smart link first so I know what to promote with your ads.`
  : `you're ready to rock. What do you want to do?`}`;

        console.log('[ghoste-ai] Applied automatic contradiction correction');
      }
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
