import { Handler } from '@netlify/functions'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import {
  auddRecognizeByUrl,
  mapAuddToSmartLinks,
} from './_auddClient'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const OPENAI_MODEL_NAME = 'gpt-4o-mini'

// System prompt for Ghoste AI with data tool awareness
const GHOSTE_AI_SYSTEM_PROMPT = `You are Ghoste AI ("My Manager"), the in-app assistant for Ghoste One.

You have access to several internal tools that let you READ the user data from Ghoste One, including:

- get_user_profile_snapshot:
  Use this to understand who the user is, their artist name, and basic app configuration.

- get_smart_links_overview:
  Use this to see how many smart links they have, their recent links, and click stats.

- get_ad_campaigns_overview:
  Use this to understand the user's paid campaigns (platform, status, spend, performance).

- get_fan_communication_overview:
  Use this to see their fan communication setup, lists, and recent email campaigns.

- get_wallet_and_credits_summary:
  Use this to understand their wallet balance, credits, and recent transactions.

- get_calendar_and_onboarding_events:
  Use this to see upcoming tasks and calendar events inside Ghoste One.

- get_spotify_analytics:
  Use this to see their Spotify artist stats and metrics.

- get_social_media_overview:
  Use this to see their social media posts and connected accounts.

- create_smart_link_from_primary_url:
  Use this when the user sends you streaming links (Spotify, Apple Music, YouTube, etc.)
  and asks you to "make a smart link" or "create a smart link" or similar.
  This tool will create a smart link for the current user using the app existing auto-resolve logic,
  and return the final public smart link URL.

When the user asks for anything involving their current setup, performance, or "what should I do next",
ALWAYS call the relevant data tools FIRST to ground your answer in real data.
Do not guess about their stats or configuration if you can call a tool to see it.

ACTION TOOLS:
You now have the ability to create smart links. When a user shares a Spotify, Apple Music, YouTube, or other streaming link and asks for a smart link, you MUST:

1. Call create_smart_link_from_primary_url with the URL.
2. Wait for the tool response.
3. Reply with a clickable URL using markdown, for example:
   - "Here is your smart link: https://ghoste.one/s/slug"
   Or:
   - "Here is your smart link: [Open Smart Link](https://ghoste.one/s/slug)"

Never fabricate smart link URLs. Always call the tool first.

When you share a smart link URL, always format it so it becomes clickable in the chat:
either as a bare URL (https://...) or as a markdown link [text](https://...).

Respond in a clear, direct tone, and always explain which part of their data you are basing your advice on.`.trim();

// Tools definition (data + actions)
const GHOSTE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_profile_snapshot',
      description: 'Get a snapshot of the current user profile and basic app configuration for Ghoste One.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_smart_links_overview',
      description: 'Get a high-level overview of the user\'s smart links, including counts, recent links, and click stats.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of recent smart links to return. Default is 10.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ad_campaigns_overview',
      description: 'Get a summary of the user\'s ad campaigns from the database.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of recent campaigns to return. Default is 10.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fan_communication_overview',
      description: 'Get summary metrics for fan communication, email lists, and recent campaigns.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wallet_and_credits_summary',
      description: 'Get wallet balance, credits, and recent wallet transactions for the current user.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of recent transactions. Default is 10.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_and_onboarding_events',
      description: 'Get upcoming calendar events and onboarding steps for the user.',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: {
            type: 'number',
            description: 'How many days ahead to look for events. Default is 14.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spotify_analytics',
      description: 'Get Spotify artist stats including followers, popularity, and streaming data.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_social_media_overview',
      description: 'Get overview of social media posts and connected accounts.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of recent posts. Default is 10.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_smart_link_from_primary_url',
      description:
        'Create a new smart link for the current user based on a single primary URL (Spotify, Apple Music, YouTube, etc.), using the existing auto-resolve logic to find all possible platforms. Returns the final public smart link URL.',
      parameters: {
        type: 'object',
        properties: {
          primary_url: {
            type: 'string',
            description:
              'The main streaming or store URL (Spotify, Apple Music, YouTube, etc.) that the smart link should be based on.',
          },
          title: {
            type: 'string',
            description:
              'Optional title to override the auto-detected title. If not provided, metadata will be auto-detected from the URL.',
          },
        },
        required: ['primary_url'],
        additionalProperties: false,
      },
    },
  },
] as const;

// Data tool handlers
async function handleGetUserProfileSnapshot(userId: string) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, email, artist_name, spotify_artist_url, plan, created_at')
    .eq('id', userId)
    .maybeSingle();

  return {
    profile: profile || null,
  };
}

async function handleGetSmartLinksOverview(userId: string, limit = 10) {
  const { data: links } = await supabase
    .from('oneclick_links')
    .select('id, title, slug, clicks, created_at, active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const totalClicks = (links ?? []).reduce(
    (sum, link) => sum + (link.clicks ?? 0),
    0
  );

  return {
    total_links: links?.length ?? 0,
    total_clicks: totalClicks,
    recent_links: links ?? [],
  };
}

async function handleGetAdCampaignsOverview(userId: string, limit = 10) {
  const { data: campaigns } = await supabase
    .from('meta_ad_campaigns')
    .select('id, name, status, daily_budget, lifetime_budget, impressions, clicks, spend, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const totalSpend = (campaigns ?? []).reduce(
    (sum, c) => sum + (parseFloat(c.spend as any) || 0),
    0
  );

  return {
    total_campaigns: campaigns?.length ?? 0,
    total_spend: totalSpend,
    recent_campaigns: campaigns ?? [],
  };
}

async function handleGetFanCommunicationOverview(userId: string) {
  const { data: contacts } = await supabase
    .from('fan_contacts')
    .select('id, email, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: messages } = await supabase
    .from('fan_messages')
    .select('id, subject, channel, sent_at, status')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(10);

  return {
    total_contacts: contacts?.length ?? 0,
    recent_messages: messages ?? [],
  };
}

async function handleGetWalletAndCreditsSummary(userId: string, limit = 10) {
  const { data: wallet } = await supabase
    .rpc('wallet_read', { p_user_id: userId })
    .maybeSingle();

  const { data: transactions } = await supabase
    .from('wallet_ledger')
    .select('id, credits_delta, amount_usd_cents, description, created_at, transaction_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    wallet: wallet || { credits_balance: 0, currency_balance_usd_cents: 0 },
    recent_transactions: transactions ?? [],
  };
}

async function handleGetCalendarAndOnboardingEvents(userId: string, daysAhead = 14) {
  const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, due_at, status, priority')
    .eq('user_id', userId)
    .gte('due_at', new Date().toISOString())
    .lte('due_at', futureDate)
    .order('due_at', { ascending: true });

  const { data: onboardingState } = await supabase
    .from('onboarding_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    upcoming_tasks: tasks ?? [],
    onboarding: onboardingState || null,
  };
}

async function handleGetSpotifyAnalytics(userId: string) {
  const { data: stats } = await supabase
    .from('spotify_artist_stats')
    .select('*')
    .eq('user_id', userId)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: dailyStats } = await supabase
    .from('daily_streaming_stats')
    .select('date, streams, followers, monthly_listeners')
    .eq('user_id', userId)
    .eq('platform', 'spotify')
    .order('date', { ascending: false })
    .limit(30);

  return {
    current_stats: stats || null,
    daily_history: dailyStats ?? [],
  };
}

async function handleGetSocialMediaOverview(userId: string, limit = 10) {
  const { data: posts } = await supabase
    .from('social_posts')
    .select('id, content, platform, status, scheduled_for, posted_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, platform, account_name, is_active')
    .eq('user_id', userId);

  return {
    total_posts: posts?.length ?? 0,
    recent_posts: posts ?? [],
    connected_accounts: accounts ?? [],
  };
}

async function handleCreateSmartLinkFromPrimaryUrl(
  userId: string,
  args: { primary_url: string; title?: string }
) {
  const { primary_url, title: titleOverride } = args;

  if (!primary_url || typeof primary_url !== 'string') {
    throw new Error('primary_url is required and must be a string');
  }

  const trimmedUrl = primary_url.trim();
  const SITE_URL = 'https://ghoste.one';

  // Step 1: Auto-resolve all platforms using AUDD
  let resolvedData = {
    artist: null,
    title: null,
    isrc: null,
    cover: null,
    links: {
      spotify: null,
      appleMusic: null,
      youtubeMusic: null,
      tidal: null,
      soundcloud: null,
    },
  };

  try {
    const auddResult = await auddRecognizeByUrl(trimmedUrl);
    resolvedData = mapAuddToSmartLinks(auddResult);
  } catch (error) {
    console.warn('[ghoste-ai] AUDD resolution failed (non-fatal):', error);
    // Continue with just the primary URL
  }

  // Step 2: Detect platform from primary URL as fallback
  function detectPlatformFromUrl(url: string): { field: string; url: string } | null {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('spotify.com') || urlLower.includes('open.spotify')) {
      return { field: 'spotify_url', url };
    }
    if (urlLower.includes('music.apple.com') || urlLower.includes('itunes.apple.com')) {
      return { field: 'apple_music_url', url };
    }
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return { field: 'youtube_url', url };
    }
    if (urlLower.includes('tidal.com')) {
      return { field: 'tidal_url', url };
    }
    if (urlLower.includes('soundcloud.com')) {
      return { field: 'soundcloud_url', url };
    }
    return { field: 'spotify_url', url };
  }

  const detectedPlatform = detectPlatformFromUrl(trimmedUrl);

  // Step 3: Build smart link data
  const finalTitle = titleOverride || resolvedData.title || 'Smart Link';
  let slug = finalTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Check for slug collision
  const { data: existingLink } = await supabase
    .from('smart_links')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingLink) {
    slug = `${slug}-${Date.now()}`;
  }

  const linkData: any = {
    user_id: userId,
    title: finalTitle,
    slug,
    cover_image_url: resolvedData.cover || '',
    spotify_url: resolvedData.links.spotify || (detectedPlatform?.field === 'spotify_url' ? detectedPlatform.url : ''),
    apple_music_url: resolvedData.links.appleMusic || (detectedPlatform?.field === 'apple_music_url' ? detectedPlatform.url : ''),
    youtube_url: resolvedData.links.youtubeMusic || (detectedPlatform?.field === 'youtube_url' ? detectedPlatform.url : ''),
    tidal_url: resolvedData.links.tidal || (detectedPlatform?.field === 'tidal_url' ? detectedPlatform.url : ''),
    soundcloud_url: resolvedData.links.soundcloud || (detectedPlatform?.field === 'soundcloud_url' ? detectedPlatform.url : ''),
    template: 'modern',
    color_scheme: {
      primary: '#3B82F6',
      secondary: '#1E40AF',
      background: '#000000',
      text: '#FFFFFF',
    },
    is_active: true,
    total_clicks: 0,
  };

  // Step 4: Insert into database
  const { data: newLink, error: insertError } = await supabase
    .from('smart_links')
    .insert([linkData])
    .select()
    .single();

  if (insertError) {
    console.error('[ghoste-ai] Smart link insert error:', insertError);
    throw new Error(`Failed to create smart link: ${insertError.message}`);
  }

  // Step 5: Return public URL and metadata
  const publicUrl = `${SITE_URL}/s/${slug}`;

  return {
    id: newLink.id,
    slug,
    public_url: publicUrl,
    title: finalTitle,
    platforms: {
      spotify: !!newLink.spotify_url,
      apple_music: !!newLink.apple_music_url,
      youtube: !!newLink.youtube_url,
      tidal: !!newLink.tidal_url,
      soundcloud: !!newLink.soundcloud_url,
    },
  };
}

type EmailDesignGoal =
  | "new_release"
  | "tour"
  | "newsletter"
  | "announcement"
  | "winback"
  | "generic";

type EmailTone = "hype" | "chill" | "emotional" | "informative" | "urgent";

type EmailDesignRequest = {
  userId: string;
  artistName?: string;
  campaignGoal: EmailDesignGoal;
  tone: EmailTone;
  audienceDescription?: string;
  campaignTitleHint?: string;
  mainMessageNotes?: string;

  links?: {
    spotify?: string;
    apple?: string;
    youtube?: string;
    presave?: string;
    website?: string;
  };

  brand?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    accentColor?: string;
    textColor?: string;
    logoUrl?: string;
  };

  heroImageUrl?: string;

  socials?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
  };
};

type EmailDesignResponse = {
  subject: string;
  previewText: string;
  html: string;
};

async function handleEmailDesignerTool(payload: EmailDesignRequest): Promise<EmailDesignResponse> {
  const goal = payload.campaignGoal ?? "generic";
  const tone = payload.tone ?? "hype";

  const systemPrompt = `You are Ghoste AI, an email designer for music campaigns.

You design:
- Subject line
- Preheader text
- FULL HTML email content

Hard rules:
- Output HTML must be email-safe:
  - Use table elements with inline styles only.
  - Max width approximately 600px, centered.
  - No external CSS, no style tags, no JavaScript.
- Background vibe: dark, modern, Ghoste-branded, unless overridden by colors.
- Use the provided colors as much as possible:
  - backgroundColor
  - primaryColor for buttons and accents
  - accentColor
  - textColor
- If a heroImageUrl is provided, show it near the top.
- If streaming links are provided, create a Listen section with buttons.
- If socials are provided, show a small Stay connected section at the bottom.

Tone mapping:
- hype: more energetic copy, short punchy lines.
- chill: relaxed, conversational.
- emotional: more storytelling and vulnerability.
- informative: clear, structured sections with headings.
- urgent: more emphasis on time sensitivity and CTAs.

Your response MUST be valid JSON with properties:
- subject: string
- previewText: string
- html: string (the full email HTML as a single string)
No extra keys, no comments. Do not wrap in markdown fences.`.trim();

  const userPrompt = `
Goal: ${goal}
Tone: ${tone}

Artist name: ${payload.artistName ?? "Unknown Artist"}
Audience: ${payload.audienceDescription ?? "music fans"}
Campaign title hint: ${payload.campaignTitleHint ?? "No specific title"}

Main message notes:
${payload.mainMessageNotes ?? "No detailed notes. Create a general but compelling campaign."}

Links:
- Spotify: ${payload.links?.spotify ?? "none"}
- Apple: ${payload.links?.apple ?? "none"}
- YouTube: ${payload.links?.youtube ?? "none"}
- Presave: ${payload.links?.presave ?? "none"}
- Website: ${payload.links?.website ?? "none"}

Brand:
- backgroundColor: ${payload.brand?.backgroundColor ?? "dark"}
- primaryColor: ${payload.brand?.primaryColor ?? "accent blue"}
- secondaryColor: ${payload.brand?.secondaryColor ?? "slate"}
- accentColor: ${payload.brand?.accentColor ?? "purple/pink"}
- textColor: ${payload.brand?.textColor ?? "light"}
- logoUrl: ${payload.brand?.logoUrl ?? "none"}

Hero image URL: ${payload.heroImageUrl ?? "none"}

Socials:
- Instagram: ${payload.socials?.instagram ?? "none"}
- TikTok: ${payload.socials?.tiktok ?? "none"}
- YouTube: ${payload.socials?.youtube ?? "none"}

Return JSON only.
`.trim();

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL_NAME,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: EmailDesignResponse;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse EmailDesignResponse JSON from Ghoste AI:", raw, err);
    throw new Error("Ghoste AI email_designer returned invalid JSON");
  }

  if (!parsed.subject || !parsed.previewText || !parsed.html) {
    throw new Error("Ghoste AI email_designer missing required fields");
  }

  return parsed;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {}

    const tool = body.tool ?? null

    // Tool-based mode (e.g., email_designer)
    if (tool === 'email_designer') {
      console.log('[GhosteAI] email_designer tool invoked')
      const payload = body.payload as EmailDesignRequest

      if (!payload || !payload.userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'email_designer requires payload with userId' })
        }
      }

      const result = await handleEmailDesignerTool(payload)

      return {
        statusCode: 200,
        body: JSON.stringify(result)
      }
    }

    // Default chat mode with function calling
    const conversation_id =
      body.conversation_id ?? body.conversationId ?? body.convoId ?? null
    const user_id = body.user_id ?? body.userId ?? null
    const messages = body.messages ?? body.history ?? []
    const input =
      body.input ?? body.message ?? body.text ?? body.prompt ?? ''

    console.log('[GhosteAI] incoming body', body)

    if (!conversation_id || !user_id || !input) {
      console.error('[GhosteAI] Missing required fields', {
        conversation_id,
        user_id,
        inputLength: input?.length
      })
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'conversation_id, user_id, and input are required',
          received: { conversation_id, user_id, hasInput: !!input }
        })
      }
    }

    // Build message history with system prompt
    const chatMessages = [
      { role: 'system' as const, content: GHOSTE_AI_SYSTEM_PROMPT },
      ...(Array.isArray(messages) ? messages : []).map((m: any) => ({
        role: m.role,
        content: m.content
      })),
      { role: 'user' as const, content: input }
    ]

    // Initial completion with tools
    let completion = await openai.chat.completions.create({
      model: OPENAI_MODEL_NAME,
      messages: chatMessages,
      tools: GHOSTE_TOOLS as any,
      tool_choice: 'auto'
    })

    let responseMessage = completion.choices[0]?.message

    // Handle tool calls if present
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      console.log('[GhosteAI] Processing', responseMessage.tool_calls.length, 'tool calls')

      // Add assistant's message with tool calls to history
      chatMessages.push(responseMessage as any)

      // Execute each tool call
      const toolOutputs = []
      for (const toolCall of responseMessage.tool_calls) {
        console.log('[GhosteAI] Executing tool:', toolCall.function.name)

        let result: any
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}

        try {
          switch (toolCall.function.name) {
            case 'get_user_profile_snapshot':
              result = await handleGetUserProfileSnapshot(user_id)
              break
            case 'get_smart_links_overview':
              result = await handleGetSmartLinksOverview(user_id, args.limit ?? 10)
              break
            case 'get_ad_campaigns_overview':
              result = await handleGetAdCampaignsOverview(user_id, args.limit ?? 10)
              break
            case 'get_fan_communication_overview':
              result = await handleGetFanCommunicationOverview(user_id)
              break
            case 'get_wallet_and_credits_summary':
              result = await handleGetWalletAndCreditsSummary(user_id, args.limit ?? 10)
              break
            case 'get_calendar_and_onboarding_events':
              result = await handleGetCalendarAndOnboardingEvents(user_id, args.days_ahead ?? 14)
              break
            case 'get_spotify_analytics':
              result = await handleGetSpotifyAnalytics(user_id)
              break
            case 'get_social_media_overview':
              result = await handleGetSocialMediaOverview(user_id, args.limit ?? 10)
              break
            case 'create_smart_link_from_primary_url':
              result = await handleCreateSmartLinkFromPrimaryUrl(user_id, args)
              break
            default:
              result = { error: 'Unknown tool' }
          }
        } catch (error: any) {
          console.error('[GhosteAI] Tool execution error:', error)
          result = { error: error.message || 'Tool execution failed' }
        }

        toolOutputs.push({
          tool_call_id: toolCall.id,
          role: 'tool' as const,
          content: JSON.stringify(result)
        })
      }

      // Add tool outputs to messages
      chatMessages.push(...toolOutputs as any)

      // Get final response from OpenAI with tool results
      completion = await openai.chat.completions.create({
        model: OPENAI_MODEL_NAME,
        messages: chatMessages
      })

      responseMessage = completion.choices[0]?.message
    }

    const assistantContent =
      responseMessage?.content ?? 'Sorry, I could not respond.'

    return {
      statusCode: 200,
      body: JSON.stringify({
        assistant_message: {
          role: 'assistant',
          content: assistantContent
        }
      })
    }
  } catch (err: any) {
    console.error('Ghoste AI error', err)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Ghoste AI failed',
        details: err?.message ?? String(err)
      })
    }
  }
}
