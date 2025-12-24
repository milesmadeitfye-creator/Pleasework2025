/**
 * Ghoste AI Agent - Upgraded Version with Full App Integration
 *
 * Features:
 * - Conversation persistence in Supabase (ai_conversations, ai_messages)
 * - Comprehensive tool registry covering all app features
 * - Proper error handling with JSON responses
 * - Support for both Netlify function calls and frontend navigation
 *
 * Endpoint: /.netlify/functions/ghoste-ai-agent-v2
 */

import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createSplitNegotiation, listOpenSplitNegotiationsForUser } from "../../src/server/splitNegotiations";
import { createAndSendFanCampaign, listRecentFanCampaigns } from "../../src/server/fanCommunication";
import { createSmartLinkFromSpotifyForUser, createSmartLink, listSmartLinksForUser } from "../../src/server/smartLinks";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Import tool registry from frontend
// NOTE: In production, tools would be defined here to avoid frontend imports
// For now, we define tools inline based on the registry

type GhosteToolId = string;

interface GhosteTool {
  id: GhosteToolId;
  description: string;
  netlifyFunction?: string;
  frontendRoute?: string;
  parameters?: Record<string, { type: string; description: string; required?: boolean }>;
}

const GHOSTE_TOOLS: GhosteTool[] = [
  {
    id: "show_help",
    description: "Explain what Ghoste can do: smart links, AI calendar with email/SMS reminders, tasks, wallet, split negotiations, unreleased music, fan communication, ad campaigns, cover art, social media, marketing university, integrations, billing",
  },
  { id: "navigate_dashboard", description: "Navigate to analytics dashboard", frontendRoute: "/dashboard" },
  {
    id: "create_smart_link",
    description: "Create a smart link for a release with platform URLs",
    netlifyFunction: "link-create",
    parameters: {
      title: { type: "string", description: "Song/album title", required: true },
      slug: { type: "string", description: "URL slug", required: true },
      spotify_url: { type: "string", description: "Spotify URL" },
    },
  },
  { id: "list_smart_links", description: "List all smart links", netlifyFunction: "list-user-links" },
  { id: "refresh_spotify_stats", description: "Refresh Spotify artist stats", netlifyFunction: "spotify-refresh-stats" },
  {
    id: "create_calendar_task",
    description: "Create a calendar/to-do task",
    netlifyFunction: "tasks-create",
    parameters: {
      title: { type: "string", description: "Task title", required: true },
      due_at: { type: "string", description: "ISO datetime" },
    },
  },
  { id: "list_calendar_tasks", description: "List upcoming tasks", netlifyFunction: "tasks-list" },
  {
    id: "create_calendar_event",
    description: "Create a calendar reminder/event for the user inside Ghoste. Use this when the user asks to be reminded of something or to put something on their calendar. For example: 'remind me tomorrow at 3pm to upload my single' or 'put studio session on Friday at 7pm on my calendar'. The AI must convert natural language times to precise UTC ISO timestamps.",
    netlifyFunction: "ai-calendar-create",
    parameters: {
      userId: { type: "string", description: "User ID (from current session)", required: true },
      title: { type: "string", description: "Event title, e.g. 'Upload new single' or 'Studio session with Miles'", required: true },
      description: { type: "string", description: "Optional longer description or notes for the event" },
      start_at_iso: { type: "string", description: "ISO 8601 timestamp (UTC) when the event starts, e.g. '2025-12-08T20:00:00Z'. Convert from user's local time to UTC.", required: true },
      end_at_iso: { type: "string", description: "Optional ISO 8601 timestamp (UTC) when the event ends" },
      reminder_minutes_before: { type: "number", description: "How many minutes before the event to send reminder. Default 60." },
      channel: { type: "string", description: "Where to send reminders: 'email', 'sms', or 'both'. Default 'email'." },
    },
  },
  {
    id: "list_calendar_events",
    description: "List upcoming calendar events and reminders. Shows scheduled events with times and reminder settings.",
    netlifyFunction: "ai-calendar-list",
    parameters: {
      userId: { type: "string", description: "User ID (from current session)", required: true },
    },
  },
  { id: "open_split_negotiations", description: "Go to Split Negotiations", frontendRoute: "/dashboard?tab=split-negotiations" },
  {
    id: "create_split_negotiation",
    description: "Create a split negotiation/contract",
    netlifyFunction: "create-split-negotiation",
  },
  { id: "open_unreleased_music", description: "Go to Unreleased Music", frontendRoute: "/dashboard?tab=unreleased-music" },
  { id: "open_fan_communication", description: "Go to Fan Communication", frontendRoute: "/dashboard?tab=fan-communication" },
  { id: "open_ad_campaigns", description: "Go to Ad Campaigns", frontendRoute: "/dashboard?tab=ad-campaigns" },
  {
    id: "create_meta_campaign",
    description: "Create a Meta ad campaign",
    netlifyFunction: "meta-create-campaign",
    parameters: {
      name: { type: "string", description: "Campaign name", required: true },
      budget: { type: "number", description: "Daily budget USD", required: true },
    },
  },
  { id: "sync_mailchimp_contacts", description: "Sync contacts to Mailchimp", netlifyFunction: "mailchimp-sync-contacts" },
  { id: "get_mailchimp_lists", description: "Get Mailchimp audiences", netlifyFunction: "mailchimp-get-lists" },
  { id: "open_cover_art_generator", description: "Go to Cover Art Generator", frontendRoute: "/dashboard?tab=cover-art" },
  {
    id: "generate_cover_art",
    description: "Generate AI cover art",
    netlifyFunction: "generate-cover-art",
    parameters: {
      prompt: { type: "string", description: "Artwork description", required: true },
    },
  },
  { id: "open_connected_accounts", description: "Go to Connected Accounts", frontendRoute: "/dashboard?tab=connected-accounts" },
  { id: "open_billing", description: "Go to Billing", frontendRoute: "/dashboard?tab=billing" },
  {
    id: "add_fan_contact",
    description: "Add a fan contact",
    netlifyFunction: "add-fan-contact",
    parameters: {
      email: { type: "string", description: "Fan email", required: true },
      name: { type: "string", description: "Fan name" },
    },
  },
  {
    id: "fan_email_blast",
    description: "Send an email blast to a Mailchimp audience",
    netlifyFunction: "mailchimp-fan-email-blast",
    parameters: {
      listId: { type: "string", description: "Mailchimp list ID", required: true },
      subject: { type: "string", description: "Email subject", required: true },
      html: { type: "string", description: "Email HTML content", required: true },
    },
  },
  {
    id: "fan_sms_blast",
    description: "Send SMS messages to fans. Use E.164 format for phone numbers (+1234567890)",
    netlifyFunction: "twilio-send-sms",
    parameters: {
      toNumbers: { type: "array", description: "Array of phone numbers in E.164 format", required: true },
      message: { type: "string", description: "SMS message text (under 160 chars recommended)", required: true },
    },
  },
  {
    id: "create_split_sheet",
    description: "Create and send a new split negotiation to a collaborator. Use when the user wants to send or draft a split sheet.",
    parameters: {
      song_title: { type: "string", description: "Title of the song", required: true },
      primary_artist: { type: "string", description: "Primary artist name", required: true },
      recipient_email: { type: "string", description: "Email of the collaborator to send the split to", required: true },
      recipient_name: { type: "string", description: "Optional name of the collaborator" },
      proposed_split: { type: "number", description: "Percentage split for this collaborator (0-100)" },
      role: { type: "string", description: "Role/credit (e.g., writer, producer, artist)" },
      notes: { type: "string", description: "Optional notes or comments for the collaborator" },
    },
  },
  {
    id: "list_split_negotiations",
    description: "List all open split negotiations for the user",
    parameters: {},
  },
  {
    id: "send_fan_email",
    description: "Draft and queue a fan communication email campaign to fans. Use for 'email my fans about X' or similar.",
    parameters: {
      subject: { type: "string", description: "Email subject line", required: true },
      body_html: { type: "string", description: "HTML body of the email. The AI will usually generate this before calling the tool.", required: true },
    },
  },
  {
    id: "create_smart_link_spotify",
    description: "Create a smart link record from a Spotify URL for the current user. Use when the user sends a Spotify link and wants a smart link.",
    parameters: {
      spotify_url: { type: "string", description: "The full Spotify URL (track/album/artist). The AI must validate it looks like a Spotify URL.", required: true },
      title: { type: "string", description: "Optional title for the smart link. If not provided, will default to 'New Smart Link'" },
    },
  },
];

const systemPrompt = `You are Ghoste AI, an AI assistant for independent artists built into Ghoste.one.

You help artists with:
- Smart links & pre-save campaigns (including creating smart links from Spotify URLs)
- Spotify stats & analytics
- Calendar & task management (including Google Calendar events)
- Split negotiations & contracts (creating and sending split sheets)
- Unreleased music sharing
- Fan communication (email campaigns & SMS broadcasts)
- Meta ad campaigns
- Mailchimp audience sync
- Cover art generation
- Social media scheduling
- Marketing education

PERSONALITY: Fast, helpful, proactive. Suggest actions. Use tools when users need something done.

TOOL USAGE:
- Navigation tools: Open the right page when users want to "see", "view", or "go to" something
- Action tools: Execute when users want to "create", "make", "sync", "send", or "generate" something
- Info tools: Fetch when users ask "show me", "list", or "what are my..."

SPLIT NEGOTIATIONS:
- Use create_split_sheet when users want to send a split, draft a split sheet, or negotiate splits
- Use list_split_negotiations to show open split negotiations

FAN COMMUNICATION:
- Use send_fan_email when users want to email their fans
- Generate HTML email content before calling the tool

SMART LINKS FROM SPOTIFY:
- Use create_smart_link_spotify when users send you a Spotify link and want a smart link
- Validate that URLs contain 'spotify.com' before calling the tool

SMS CAPABILITIES:
You can send SMS messages using fan_sms_blast. Phone numbers MUST be in E.164 format (+1234567890).
Keep messages under 160 characters for best delivery.

CALENDAR CAPABILITIES:
You can create internal calendar events with email/SMS reminders using create_calendar_event.
Use this when users ask to "remind me", "schedule", "put on my calendar", or need reminders for releases, uploads, meetings, or deadlines.
Examples: "remind me tomorrow at 3pm to upload my single" → create event with title "Upload my single"
You MUST convert natural language times (like "tomorrow at 3pm") to precise UTC ISO 8601 timestamps (e.g., "2025-12-09T20:00:00Z").
Assume US Central Time (UTC-6) if timezone not specified. The system will send email reminders 60 minutes before (or custom time if specified).
Use list_calendar_events to show upcoming reminders when users ask "what reminders do I have" or "show my calendar".

Always explain what you did clearly and suggest next steps.`;

function getToolsForOpenAI() {
  return GHOSTE_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.id,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.parameters || {},
        required: Object.entries(tool.parameters || {})
          .filter(([_, param]) => param.required)
          .map(([name]) => name),
      },
    },
  }));
}

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const apiKey = process.env.GHOSTE_AI_OPENAI_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(500, { error: "OPENAI_KEY_NOT_CONFIGURED" });
    }

    const body = JSON.parse(event.body || "{}");
    const { userId, conversationId, messages } = body;

    if (!userId || !Array.isArray(messages) || messages.length === 0) {
      return jsonResponse(400, { error: "MISSING_REQUIRED_FIELDS" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const openai = new OpenAI({ apiKey });

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          title: messages[messages.length - 1].content.substring(0, 50),
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create conversation: ${error.message}`);
      convId = conv.id;
    }

    // Save user message
    const latestUserMsg = messages[messages.length - 1];
    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      user_id: userId,
      role: latestUserMsg.role,
      content: latestUserMsg.content,
    });

    // Call OpenAI
    const openAiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ];

    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openAiMessages,
      tools: getToolsForOpenAI(),
      tool_choice: "auto",
      temperature: 0.7,
    });

    const choice = response.choices[0];
    let finalMessage = choice?.message;

    // Handle tool calls
    if (finalMessage?.tool_calls && finalMessage.tool_calls.length > 0) {
      const toolCall = finalMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

      console.log(`[Ghoste AI] Tool called: ${toolName}`, toolArgs);

      const tool = GHOSTE_TOOLS.find((t) => t.id === toolName);
      if (!tool) {
        return jsonResponse(200, {
          conversationId: convId,
          reply: `I tried to use ${toolName} but it's not available.`,
        });
      }

      let toolResult: any = null;
      let assistantReply = "";

      // Handle server-side tools with direct function calls
      if (toolName === "create_split_sheet") {
        try {
          const negotiation = await createSplitNegotiation({
            userId,
            songTitle: toolArgs.song_title,
            primaryArtist: toolArgs.primary_artist,
            recipientEmail: toolArgs.recipient_email,
            recipientName: toolArgs.recipient_name,
            proposedSplit: toolArgs.proposed_split,
            role: toolArgs.role,
            notes: toolArgs.notes,
          });

          toolResult = {
            ok: true,
            id: negotiation.id,
            status: negotiation.status,
            song_title: negotiation.song_title,
            primary_artist: negotiation.primary_artist,
            recipient_email: negotiation.recipient_email,
            public_token: negotiation.public_token,
          };

          assistantReply = `✅ Split negotiation created for "${negotiation.song_title}"! I've sent it to ${negotiation.recipient_email}. They'll receive a link to review and sign. You can track the status in your Split Negotiations tab.`;
        } catch (err: any) {
          assistantReply = `❌ Failed to create split negotiation: ${err.message}`;
          toolResult = { ok: false, error: err.message };
        }
      } else if (toolName === "list_split_negotiations") {
        try {
          const negotiations = await listOpenSplitNegotiationsForUser({ userId });

          toolResult = {
            ok: true,
            count: negotiations.length,
            negotiations: negotiations.map(n => ({
              id: n.id,
              song_title: n.song_title,
              primary_artist: n.primary_artist,
              recipient_email: n.recipient_email,
              status: n.status,
              created_at: n.created_at,
            })),
          };

          if (negotiations.length === 0) {
            assistantReply = `You don't have any open split negotiations right now. Want to create one?`;
          } else {
            assistantReply = `📋 You have ${negotiations.length} open split negotiation${negotiations.length > 1 ? 's' : ''}:\n\n${negotiations.map(n => `• "${n.song_title}" sent to ${n.recipient_email} (${n.status})`).join('\n')}`;
          }
        } catch (err: any) {
          assistantReply = `❌ Failed to list split negotiations: ${err.message}`;
          toolResult = { ok: false, error: err.message };
        }
      } else if (toolName === "send_fan_email") {
        try {
          const campaign = await createAndSendFanCampaign({
            userId,
            subject: toolArgs.subject,
            bodyHtml: toolArgs.body_html,
          });

          toolResult = {
            ok: true,
            id: campaign.id,
            status: campaign.status,
            subject: campaign.subject,
          };

          assistantReply = `✅ Fan email campaign queued! Subject: "${campaign.subject}". Your email service will send it to your fan list shortly. You can track delivery in the Fan Communication tab.`;
        } catch (err: any) {
          assistantReply = `❌ Failed to create fan email campaign: ${err.message}`;
          toolResult = { ok: false, error: err.message };
        }
      } else if (toolName === "create_smart_link_spotify") {
        try {
          const url: string = toolArgs.spotify_url;

          if (typeof url !== 'string' || !url.includes('spotify.com')) {
            toolResult = { ok: false, error: 'Invalid Spotify URL' };
            assistantReply = `❌ That doesn't look like a valid Spotify URL. Please provide a link from Spotify (should contain 'spotify.com').`;
          } else {
            const smartLink = await createSmartLinkFromSpotifyForUser({
              userId,
              spotifyUrl: url,
              title: toolArgs.title,
            });

            toolResult = {
              ok: true,
              id: smartLink.id,
              slug: smartLink.slug,
              title: smartLink.title,
              public_url: `https://ghoste.one/s/${smartLink.slug}`,
            };

            assistantReply = `✅ Smart link created! "${smartLink.title}" is live at https://ghoste.one/s/${smartLink.slug}. Share this link and fans can listen on any platform!`;
          }
        } catch (err: any) {
          assistantReply = `❌ Failed to create smart link: ${err.message}`;
          toolResult = { ok: false, error: err.message };
        }
      }
      // Execute Netlify function
      else if (tool.netlifyFunction) {
        try {
          const fnUrl = `${process.env.URL || ""}/.netlify/functions/${tool.netlifyFunction}`;
          const res = await fetch(fnUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, ...toolArgs }),
          });

          const text = await res.text();
          try {
            toolResult = text ? JSON.parse(text) : {};
          } catch {
            toolResult = { raw: text };
          }

          if (res.ok && toolResult.success !== false) {
            assistantReply = `✅ I ran ${tool.id} successfully! ${JSON.stringify(toolResult).substring(0, 200)}`;
          } else {
            assistantReply = `⚠️ ${tool.id} had an issue: ${toolResult.error || "Unknown error"}`;
          }
        } catch (err: any) {
          assistantReply = `❌ Failed to execute ${tool.id}: ${err.message}`;
        }
      }
      // Handle navigation
      else if (tool.frontendRoute) {
        toolResult = { navigateTo: tool.frontendRoute };
        assistantReply = `📍 Go to ${tool.frontendRoute} to continue.`;
      }
      // Generic
      else {
        assistantReply = `I processed ${tool.id} for you.`;
      }

      // Save assistant reply
      await supabase.from("ai_messages").insert({
        conversation_id: convId,
        user_id: userId,
        role: "assistant",
        content: assistantReply,
        metadata: { tool: tool.id, args: toolArgs, result: toolResult },
      });

      return jsonResponse(200, {
        conversationId: convId,
        reply: assistantReply,
        toolCall: {
          name: tool.id,
          args: toolArgs,
          result: toolResult,
        },
      });
    }

    // No tool call - just text response
    const assistantReply = finalMessage?.content?.trim() || "I'm here to help!";

    await supabase.from("ai_messages").insert({
      conversation_id: convId,
      user_id: userId,
      role: "assistant",
      content: assistantReply,
    });

    return jsonResponse(200, {
      conversationId: convId,
      reply: assistantReply,
    });
  } catch (err: any) {
    console.error("[Ghoste AI Agent] Error:", err);
    return jsonResponse(500, {
      error: "GHOSTE_AI_ERROR",
      details: err.message || String(err),
    });
  }
};
