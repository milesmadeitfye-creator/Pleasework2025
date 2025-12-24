import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const systemPrompt = `
You are Ghoste AI, an AI agent and music marketing manager for independent artists.

You have access to powerful action tools that let you:
- Create smart links, pre-save campaigns, and email capture pages
- Analyze Spotify stats and campaign performance
- Save fan contacts and sync to Mailchimp
- Generate marketing plans and cover art
- Diagnose issues with integrations

PERSONALITY:
- Fast, helpful, no fluff
- Suggest actions proactively
- Think step-by-step internally but respond concisely
- Use tools to take action when the user needs something done

AVAILABLE ACTIONS:
When a user asks you to do something, use the appropriate tool:
- "Create a smart link" → use createSmartLink
- "Make a pre-save" → use createPresave
- "Get Spotify stats" → use getSpotifyStats
- "Save this contact" → use saveArtistContact
- "Plan my release" → use generateMarketingPlan
- "Why isn't X working" → use diagnoseIssue
- "Analyze my campaigns" → use analyzeCampaigns
- "Generate cover art" → use generateCoverArt
- "Sync to Mailchimp" → use syncMailchimp

IMPORTANT:
- When you use a tool, explain what you did clearly
- If a tool fails, explain the error and suggest alternatives
- Always suggest logical next steps after completing an action
`;

interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any, context: { userId: string; supabase: any }) => Promise<any>;
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const tools: Tool[] = [
  {
    name: "createSmartLink",
    description: "Create a new smart link for a song/album with multiple platform URLs",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Song/album title" },
        slug: { type: "string", description: "URL slug (e.g. 'my-song')" },
        spotify_url: { type: "string", description: "Spotify URL" },
        apple_music_url: { type: "string", description: "Apple Music URL" },
        youtube_url: { type: "string", description: "YouTube URL" },
      },
      required: ["title", "slug"],
    },
    execute: async (params, context) => {
      const { data, error } = await context.supabase
        .from("smart_links")
        .insert({
          user_id: context.userId,
          title: params.title,
          slug: params.slug,
          spotify_url: params.spotify_url || "",
          apple_music_url: params.apple_music_url || "",
          youtube_url: params.youtube_url || "",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        success: true,
        url: `https://ghoste.one/l/${params.slug}`,
        link_id: data.id,
      };
    },
  },

  {
    name: "createPresave",
    description: "Create a pre-save campaign for an upcoming release",
    parameters: {
      type: "object",
      properties: {
        song_title: { type: "string", description: "Song title" },
        artist_name: { type: "string", description: "Artist name" },
        release_date: { type: "string", description: "Release date YYYY-MM-DD" },
        slug: { type: "string", description: "URL slug" },
      },
      required: ["song_title", "artist_name", "release_date", "slug"],
    },
    execute: async (params) => {
      return {
        success: true,
        url: `https://ghoste.one/presave/${params.slug}`,
        release_date: params.release_date,
      };
    },
  },

  {
    name: "getSpotifyStats",
    description: "Get Spotify statistics for an artist or track",
    parameters: {
      type: "object",
      properties: {
        spotify_url: {
          type: "string",
          description: "Spotify artist or track URL",
        },
      },
      required: ["spotify_url"],
    },
    execute: async (params) => {
      try {
        const response = await fetch(
          "/.netlify/functions/spotify-artist-stats",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: params.spotify_url }),
          }
        );

        if (!response.ok) throw new Error("Failed to fetch Spotify stats");
        const data = await response.json();
        return { success: true, stats: data };
      } catch (err: any) {
        throw new Error(`Spotify API error: ${err.message}`);
      }
    },
  },

  {
    name: "saveArtistContact",
    description: "Save a fan contact to the database",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "Fan email" },
        name: { type: "string", description: "Fan name" },
        source: { type: "string", description: "Contact source" },
      },
      required: ["email"],
    },
    execute: async (params, context) => {
      const { data, error } = await context.supabase
        .from("fan_contacts")
        .insert({
          user_id: context.userId,
          email: params.email,
          name: params.name || "",
          source: params.source || "ghoste-ai",
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { success: true, contact_id: data.id };
    },
  },

  {
    name: "generateMarketingPlan",
    description: "Generate a marketing plan for a release",
    parameters: {
      type: "object",
      properties: {
        release_date: { type: "string", description: "Release date YYYY-MM-DD" },
        genre: { type: "string", description: "Music genre" },
        budget: { type: "number", description: "Budget in USD" },
      },
      required: ["release_date", "genre", "budget"],
    },
    execute: async (params) => {
      const releaseDate = new Date(params.release_date);
      const today = new Date();
      const daysUntil = Math.ceil(
        (releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        success: true,
        plan: {
          release_date: params.release_date,
          days_until_release: daysUntil,
          genre: params.genre,
          budget: params.budget,
          phases: [
            {
              name: "Pre-Save Campaign",
              budget: params.budget * 0.2,
              tasks: [
                "Create pre-save links",
                "Design promo graphics",
                "Launch email capture",
              ],
            },
            {
              name: "Launch Week",
              budget: params.budget * 0.5,
              tasks: [
                "Run Meta ads",
                "Post on social media",
                "Send email blast",
                "Submit to playlists",
              ],
            },
            {
              name: "Post-Release",
              budget: params.budget * 0.3,
              tasks: [
                "Analyze metrics",
                "Retarget engaged fans",
                "Create UGC campaigns",
              ],
            },
          ],
        },
      };
    },
  },

  {
    name: "diagnoseIssue",
    description: "Diagnose common integration issues",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Issue category: mailchimp, meta, spotify, or links",
        },
      },
      required: ["category"],
    },
    execute: async (params) => {
      const diagnostics: Record<string, any> = {
        mailchimp: {
          checks: [
            "Is Mailchimp connected in Connected Accounts?",
            "Is an audience selected?",
            "Check Netlify function logs",
          ],
          fixes: [
            "Reconnect Mailchimp",
            "Verify API permissions",
            "Check audience ID",
          ],
        },
        meta: {
          checks: [
            "Is Meta account connected?",
            "Do you have ad account access?",
            "Is pixel ID configured?",
          ],
          fixes: [
            "Reconnect Meta",
            "Verify ad account permissions",
            "Add pixel ID in settings",
          ],
        },
        spotify: {
          checks: [
            "Is Spotify connected?",
            "Is artist profile verified?",
            "Using correct artist URL?",
          ],
          fixes: [
            "Connect Spotify",
            "Verify Spotify for Artists access",
            "Use full artist URL",
          ],
        },
        links: {
          checks: ["Is slug unique?", "URLs formatted correctly?", "Link active?"],
          fixes: [
            "Try different slug",
            "Verify https:// URLs",
            "Check link status",
          ],
        },
      };

      const category = params.category.toLowerCase();
      return {
        success: true,
        category,
        diagnostic: diagnostics[category] || { checks: [], fixes: [] },
      };
    },
  },

  {
    name: "analyzeCampaigns",
    description: "Analyze all advertising campaign performance",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async (params, context) => {
      const { data: campaigns } = await context.supabase
        .from("meta_ad_campaigns")
        .select("*")
        .eq("user_id", context.userId)
        .is("adset_id", null)
        .is("ad_id", null);

      if (!campaigns || campaigns.length === 0) {
        return {
          success: true,
          message: "No campaigns found",
          campaigns: [],
        };
      }

      const totalSpend = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
      const totalClicks = campaigns.reduce((s, c) => s + (c.clicks || 0), 0);
      const totalConversions = campaigns.reduce(
        (s, c) => s + (c.conversions || 0),
        0
      );

      return {
        success: true,
        analysis: {
          total_campaigns: campaigns.length,
          active_campaigns: campaigns.filter((c) => c.status === "active")
            .length,
          total_spend: totalSpend,
          total_clicks: totalClicks,
          total_conversions: totalConversions,
          avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
          conversion_rate:
            totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        },
      };
    },
  },
];

function getToolDefinitions() {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function executeTool(
  toolName: string,
  toolArgs: any,
  userId: string
): Promise<any> {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const context = { userId, supabase };

  try {
    const result = await tool.execute(toolArgs, context);
    return result;
  } catch (err: any) {
    throw new Error(`Tool execution failed: ${err.message}`);
  }
}

export const handler: Handler = async (event) => {
  try {
    const apiKey =
      process.env.GHOSTE_AI_OPENAI_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "OpenAI API key not configured",
        }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const userMessage = (body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const userId = body.userId;

    if (!userMessage) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing message" }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing userId" }),
      };
    }

    const client = new OpenAI({ apiKey });

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    let response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: getToolDefinitions(),
      tool_choice: "auto",
      temperature: 0.7,
    });

    let finalMessage = response.choices[0]?.message;

    if (finalMessage?.tool_calls && finalMessage.tool_calls.length > 0) {
      const toolResults = [];

      for (const toolCall of finalMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 Executing tool: ${toolName}`, toolArgs);

        try {
          const result = await executeTool(toolName, toolArgs, userId);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify(result),
          });
        } catch (err: any) {
          console.error(`❌ Tool execution failed:`, err);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify({ error: err.message }),
          });
        }
      }

      messages.push(finalMessage);
      messages.push(...toolResults);

      response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
      });

      finalMessage = response.choices[0]?.message;
    }

    const assistantReply =
      finalMessage?.content?.trim() ||
      "I completed the action but couldn't generate a response.";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply: assistantReply }),
    };
  } catch (err: any) {
    console.error("❌ Ghoste AI Agent error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: `Ghoste AI error: ${err.message}`,
      }),
    };
  }
};
