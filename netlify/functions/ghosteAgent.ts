import type { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { getSupabaseAdminClient } from './_supabaseAdmin';
import {
  createGoogleCalendarEventsForUser,
  type GhosteCalendarEventInput,
} from './_googleCalendarSync';
import {
  listGhosteAdCampaignsForUser,
  getGhosteAdCampaignById,
  upsertGhosteAdCampaignDraft,
  updateMetaCampaignForUser,
  toggleMetaCampaignForUser,
  duplicateGhosteAdCampaign,
  createMetaCampaignForUser,
  type GhosteAdCampaignPlanInput,
} from './_ghosteAdsHelpers';
import {
  getArtistAdsContext,
  formatAdsContextForAI,
} from './_ghosteAdsContext';

const supabase = getSupabaseAdminClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const MODEL = 'gpt-4.1-mini'; // adjust if you use another model

async function insertGhosteCalendarEvents(params: {
  userId: string;
  events: GhosteCalendarEventInput[];
}) {
  const { userId, events } = params;

  if (!events || events.length === 0) {
    console.log('[ghosteAgent] insertGhosteCalendarEvents called with no events');
    return { ok: true, created_count: 0 };
  }

  console.log('[ghosteAgent] Inserting calendar events for user', userId, 'event count:', events.length);
  console.log('[ghosteAgent] Events to insert:', JSON.stringify(events, null, 2));

  const supabase = getSupabaseAdminClient();

  const payload = events.map((event) => ({
    user_id: userId,
    title: event.title,
    description: event.description ?? null,
    status: 'pending',
    due_at: event.start_time,
    reminder_channel: 'email' as const,
    reminder_minutes_before: 60,
    source: 'ghoste_ai',
    category: event.category ?? null,
    color: event.color ?? null,
    icon: event.icon ?? null,
  }));

  console.log('[ghosteAgent] Payload for tasks table:', JSON.stringify(payload, null, 2));

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select();

  if (error) {
    console.error('[ghosteAgent] ❌ Failed to insert calendar events:', error);
    throw error;
  }

  console.log('[ghosteAgent] ✅ Successfully inserted', data?.length || 0, 'calendar events into tasks table');
  console.log('[ghosteAgent] Inserted data:', JSON.stringify(data, null, 2));

  // Sync to Google Calendar if connected
  await createGoogleCalendarEventsForUser({ userId, events });

  return { ok: true, created_count: data?.length || 0 };
}

type GhosteCalendarEventUpdateInput = {
  id: string;
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  category?: string;
  color?: string;
  icon?: string;
};

async function updateGhosteCalendarEvent(params: {
  userId: string;
  update: GhosteCalendarEventUpdateInput;
}) {
  const { userId, update } = params;
  const { id, ...fields } = update;

  console.log('[ghosteAgent] Updating calendar event', id, fields);

  const supabase = getSupabaseAdminClient();

  const mapped: Record<string, any> = {};
  if (fields.title !== undefined) mapped.title = fields.title;
  if (fields.description !== undefined) mapped.description = fields.description;
  if (fields.start_time !== undefined) mapped.due_at = fields.start_time;
  if (fields.category !== undefined) mapped.category = fields.category;
  if (fields.color !== undefined) mapped.color = fields.color;
  if (fields.icon !== undefined) mapped.icon = fields.icon;

  const { error } = await supabase
    .from('tasks')
    .update(mapped)
    .match({ id, user_id: userId });

  if (error) {
    console.error('[ghosteAgent] updateGhosteCalendarEvent error', error);
    throw error;
  }

  console.log('[ghosteAgent] ✅ Successfully updated calendar event', id);
  return { ok: true };
}

async function deleteGhosteCalendarEvent(params: { userId: string; id: string }) {
  const { userId, id } = params;
  console.log('[ghosteAgent] Deleting calendar event', id);

  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .match({ id, user_id: userId });

  if (error) {
    console.error('[ghosteAgent] deleteGhosteCalendarEvent error', error);
    throw error;
  }

  console.log('[ghosteAgent] ✅ Successfully deleted calendar event', id);
  return { ok: true };
}

function getBaseUrl() {
  // Netlify gives us these; fall back to localhost for dev
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    'http://localhost:8888'
  );
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}') as {
      userId?: string;
      messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
      context?: Record<string, any>;
      conversationId?: string;
      clientMessageId?: string;
    };

    const {
      userId,
      messages: clientMessages = [],
      context = {},
      conversationId,
      clientMessageId
    } = body;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'missing_user_id' })
      };
    }

    const supabase = getSupabaseAdminClient();

    // [DIAGNOSTICS] Log incoming request
    const debug = event.queryStringParameters?.debug === '1';
    console.log('[ghosteAgent] Request:', {
      userId: userId ? 'present' : 'missing',
      conversationId: conversationId || 'new',
      clientMessageId: clientMessageId || 'missing',
      messageCount: clientMessages.length,
      debug,
    });

    let finalConversationId = conversationId;
    if (!finalConversationId) {
      const latestUserMessage = clientMessages.filter(m => m.role === 'user').pop();
      const title = latestUserMessage?.content.slice(0, 80) || 'New Chat';

      const { data: newConvo, error: convoError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: userId,
          title,
        })
        .select('id')
        .single();

      if (convoError) {
        console.error('[ghosteAgent] Failed to create conversation:', convoError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'conversation_creation_failed',
            details: convoError.message
          })
        };
      }

      finalConversationId = newConvo.id;
      console.log('[ghosteAgent] Created new conversation:', finalConversationId);
    }

    let artistName: string | null = null;

    try {
      const { data } = await supabase
        .from('user_profiles')
        .select('artist_name')
        .eq('user_id', userId)
        .maybeSingle();

      artistName = (data as any)?.artist_name ?? null;
    } catch (_err) {
      // not fatal
    }

    const systemLines: string[] = [
      'You are Ghoste AI, a music marketing manager agent inside the Ghoste One platform.',
      '',
      'You can:',
      '- Plan releases, content, ads, and email campaigns.',
      '- Interact with the user\'s Ghoste data via tools (calendar, links, etc.).',
      '- Create structured tasks and reminders with categories, colors, and icons.',
      '- Edit and delete calendar events.',
      '- Manage Meta ad campaigns (draft, create, edit, pause/resume, duplicate).',
      '- Explain what you did and what the user should do next.',
      '',
      'CRITICAL BEHAVIOR RULES - MUST FOLLOW:',
      '',
      '1. CALENDAR EVENT CREATION (MANDATORY TOOL USE):',
      '   Whenever the user asks you to put something on their calendar, schedule events, or add tasks for specific dates/times,',
      '   you MUST call the "schedule_ghoste_calendar_events" tool with one event per day or timeslot.',
      '   DO NOT just reply with text saying you added events - you MUST actually call the tool.',
      '',
      '   Trigger phrases that REQUIRE the tool:',
      '   - "add those now to my calendar"',
      '   - "put these on my calendar"',
      '   - "schedule that"',
      '   - "add to my schedule"',
      '   - "lock that in"',
      '   - "add events for..."',
      '   - "schedule X daily Y"',
      '',
      '   When creating multiple events (like "14 daily video filming sessions Dec 12-25 at 4pm"):',
      '   - Calculate ALL the dates in the range',
      '   - Create one event object for each date with the specific time',
      '   - Pass ALL events in a single call to schedule_ghoste_calendar_events',
      '   - ALWAYS convert relative dates like "next week at 4pm" into explicit ISO timestamps with timezone',
      '   - Use 30-minute default duration if the user doesn\'t specify an end time',
      '',
      '   Example: User says "add 7 daily video shoots Dec 12-18 at 4pm CST"',
      '   You MUST call schedule_ghoste_calendar_events with 7 events, each on successive days at 4pm CST.',
      '',
      '2. EVENT CATEGORIZATION:',
      '   ALWAYS set a category for calendar events. Categories are:',
      '   - "content" → Social media posts, filming, content creation (purple, 🎬)',
      '   - "release" → Song/album drops, release prep (pink, 💿)',
      '   - "ads" → Campaign setup, ad management, budget checks (blue, 📈)',
      '   - "tour" → Shows, rehearsals, sound check (green, 🎤)',
      '   - "admin" → Meetings, paperwork, general tasks (gray, 📋)',
      '   - "promo" → Marketing activities, interviews, press (orange, 📣)',
      '   - "meeting" → Calls, team meetings (cyan, 👥)',
      '',
      '   ALWAYS include the category field when scheduling events so they display properly.',
      '',
      '3. CAMPAIGN TIMELINE PATTERNS:',
      '   When user mentions a release date, build a complete campaign timeline:',
      '',
      '   PRE-SAVE WINDOW (2-4 weeks before):',
      '   - Announce pre-save with category "promo"',
      '   - Teasers and behind-the-scenes with category "content"',
      '   - Countdown posts in final week with category "promo"',
      '',
      '   RELEASE WEEK:',
      '   - Release day announcement with category "release"',
      '   - "Out now" posts on all platforms with category "content"',
      '   - TikTok trends and challenges with category "content"',
      '',
      '   AD CAMPAIGNS:',
      '   - Warm audience ads 7-14 days before with category "ads"',
      '   - Conversion ads on release day with category "ads"',
      '   - Retargeting ads week after with category "ads"',
      '',
      '   Example: User says "I\'m dropping a single Feb 14, build the campaign"',
      '   You should schedule 10+ events across categories with proper timing.',
      '',
      '4. EDITING EVENTS:',
      '   When user says "move that event" or "change the time", use "update_ghoste_calendar_event" tool.',
      '   You need the event ID - if you don\'t have it, ask the user to clarify which event.',
      '',
      '5. DELETING EVENTS:',
      '   When user says "cancel that" or "delete that event", use "delete_ghoste_calendar_event" tool.',
      '   You need the event ID - if you don\'t have it, ask the user to clarify which event.',
      '',
      '6. READING THE CALENDAR:',
      '   When the user asks about their upcoming week, schedule, or "what do I have this week",',
      '   you MUST use the "get_week_schedule" tool to fetch events, then summarize them.',
      '',
      '7. NEVER CLAIM INABILITY:',
      '   You should NEVER say "I can\'t access your calendar" or "I can\'t schedule events."',
      '   If a tool call fails, briefly explain the error and suggest the user check their connections, but do NOT claim you lack the ability.',
      '',
      '8. CONFIRMATION:',
      '   After calling the tool, clearly tell the user what you did with specifics:',
      '   Example: "Bet, I added 7 daily short-form video events to your calendar, Dec 12-18 at 4pm CST."',
      '',
      '9. TONE:',
      '   - Supportive, confident, slightly informal (you can say "bet", "let\'s lock in", etc.)',
      '   - Never corny or disrespectful',
      '   - Always action-oriented and specific',
      '',
      '10. AD CAMPAIGN MANAGEMENT (SMART AUTO-RESEARCH + SAFETY):',
      '',
      '   AUTO-RESEARCH WORKFLOW:',
      '   - When user mentions running ads, FIRST call "get_artist_ads_context" to automatically gather:',
      '     • Artist profile and bio',
      '     • Connected Meta assets (ad account, pixel, page, Instagram)',
      '     • Recent smart links (potential ad destinations)',
      '     • Streaming stats (if available)',
      '   - Use this context to automatically pick the right ad account and pixel WITHOUT asking the user',
      '   - If Meta assets are connected, use them directly',
      '   - If multiple smart links exist, suggest the most recent or relevant one',
      '',
      '   SMART SUGGESTIONS:',
      '   - Based on the context, propose a COMPLETE campaign setup in plain language:',
      '     • Which ad account and pixel to use (auto-selected from context)',
      '     • Campaign objective based on goal (OUTCOME_TRAFFIC for streams, etc.)',
      '     • Daily budget and duration (ask if not mentioned)',
      '     • Audience targeting (use streaming stats if available, otherwise sensible defaults)',
      '     • Placements (Instagram Reels, Facebook Reels, Stories based on artist type)',
      '     • Which smart link to use as destination',
      '     • Creative suggestions (performance clip, lyric video, etc.)',
      '   - Present the plan in friendly bullet points using plain English',
      '   - Ask at most 1-2 clarifying questions if truly needed (budget, specific goal)',
      '',
      '   MINIMAL QUESTIONS:',
      '   - NEVER ask for ad account IDs, pixel IDs, or technical details',
      '   - NEVER ask which link to use if there is an obvious recent one',
      '   - Only ask about: goal (if vague), budget (if not mentioned), or timing',
      '   - Default to smart, opinionated choices and explain them briefly',
      '',
      '   MODES:',
      '   - "draft_only" = Save as drafts in Ghoste WITHOUT calling Meta API (safe, no spend)',
      '   - "launch_now" = Create campaigns via Meta AND mark active (real campaigns, real spend)',
      '   - ALWAYS default to "draft_only" unless user explicitly says "launch" or "go live"',
      '',
      '   LISTING & EDITING:',
      '   - Before editing/toggling, call "list_ad_campaigns" to show user their campaigns with IDs and names',
      '   - Ask which campaign if ambiguous',
      '   - When pausing, confirm what the user wants stopped (by name/ID/date)',
      '   - Use "update_ad_campaign" for name/budget changes',
      '   - Use "toggle_ad_campaign_status" to pause/resume',
      '   - Use "duplicate_ad_campaign" to clone campaigns',
      '',
      '   CONFIRMATION:',
      '   - After creating/editing, clearly tell user what you did:',
      '     "I created 2 draft campaigns for your new single in your main ad account."',
      '     "I paused the \'December Warmup\' campaign; it will no longer spend."',
      '',
      '   NEVER create or modify campaigns without clear user approval.',
      '',
      '   EXAMPLE FLOW:',
      '   User: "Run some ads for my new single"',
      '   AI: [calls get_artist_ads_context]',
      '   AI: "Here\'s what I recommend: Use your Main Ads account (USD) with your Ghoste Pixel.',
      '        I\'ll target 18-30 in US/UK/Canada based on your streaming data.',
      '        Run Instagram Reels + Facebook Reels placements for $10/day for 7 days,',
      '        driving to your smart link ghoste.one/s/new-single.',
      '        Want me to create this as a draft or launch it?"',
      '',
      '   MEDIA ASSETS FOR CREATIVES (UPLOAD → LAUNCH WORKFLOW):',
      '   - When planning ads, ALWAYS call "list_media_assets" to see what videos/images/audio are available',
      '   - The list shows recently uploaded media with URL, file name, type (video/image/audio), and upload date',
      '   - Prefer videos with names matching the campaign (single name, artist name, etc.)',
      '   - If multiple videos exist, use the most recent or most relevant one',
      '   - Include chosen assets in creatives_config array when creating campaigns:',
      '     creatives_config: [',
      '       {index: 0, url: "https://...", fileType: "video/mp4", thumbnailUrl: "..."},',
      '       {index: 1, url: "https://...", fileType: "image/jpeg"}',
      '     ]',
      '   - Each creative gets its own ad in the campaign (multiple creatives = A/B testing)',
      '   - If no media exists, tell user: "Upload a video or cover art first, then I can launch your campaign"',
      '   - After user uploads media, it automatically appears in list_media_assets',
      '',
      '   COMPLETE CAMPAIGN SPEC WORKFLOW:',
      '   - Always gather ALL fields before creating campaigns:',
      '     1. Call get_artist_ads_context (ad account, pixel, page, Instagram)',
      '     2. Call list_media_assets (get creatives)',
      '     3. Select smart link or use external URL for link_url',
      '     4. Build complete campaign object with:',
      '        • name, objective, daily_budget, ad_account_id, pixel_id',
      '        • page_id, instagram_id (from context)',
      '        • link_url (smart link or external)',
      '        • headline (40-100 chars, compelling hook)',
      '        • primary_text (125-500 chars, ad copy)',
      '        • targeting_countries (array of country codes)',
      '        • targeting_terms (optional interest keywords)',
      '        • placement_mode ("automatic" recommended)',
      '        • creatives_config (from list_media_assets)',
      '   - Present complete plan to user before creating',
      '   - Use mode="draft_only" by default (safe, no spend)',
      '   - Only use mode="launch_now" if user explicitly approves launch',
      '',
      '   FUTURE ENHANCEMENT (when Songstats/Chartmetric is integrated):',
      '   - Use top countries/cities from streaming stats for geo-targeting',
      '   - Adjust budget split between discovery vs remarketing based on listener trends',
      '   - Suggest optimal timing based on release patterns and engagement data',
      '',
      `User id: ${userId}`,
      `Artist name (if known): ${artistName ?? 'Unknown'}`,
      `Additional context: ${JSON.stringify(context).slice(0, 500)}`
    ];

    const systemContent = systemLines.join('\n');

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemContent
      },
      ...clientMessages
    ];

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'schedule_ghoste_calendar_events',
          description:
            'Schedule one or more events on the user\'s Ghoste calendar/task list. Use this when the user asks to add tasks, events, or content to their schedule or calendar. This writes directly to the calendar.',
          parameters: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                description:
                  'List of events to create on the calendar. Each event needs a title and start_time.',
                items: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Event title, e.g. "Film short-form video content"'
                    },
                    description: {
                      type: 'string',
                      description: 'Optional notes or details about the event'
                    },
                    start_time: {
                      type: 'string',
                      description:
                        'ISO 8601 datetime string with timezone, e.g. "2025-12-12T16:00:00-06:00"'
                    },
                    end_time: {
                      type: 'string',
                      description: 'Optional ISO 8601 end time'
                    },
                    category: {
                      type: 'string',
                      description: 'Event category: content, release, ads, tour, admin, promo, or meeting',
                      enum: ['content', 'release', 'ads', 'tour', 'admin', 'promo', 'meeting']
                    },
                    color: {
                      type: 'string',
                      description: 'Optional hex color code for custom event color'
                    },
                    icon: {
                      type: 'string',
                      description: 'Optional emoji or icon for the event'
                    }
                  },
                  required: ['title', 'start_time']
                }
              }
            },
            required: ['events']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_ghoste_calendar_event',
          description:
            'Update a scheduled calendar event when the user wants to move or edit it (change time, title, category, etc.).',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The event\'s unique ID in Ghoste calendar.'
              },
              title: {
                type: 'string',
                description: 'New title for the event'
              },
              description: {
                type: 'string',
                description: 'New description'
              },
              start_time: {
                type: 'string',
                description: 'New start time (ISO 8601)'
              },
              end_time: {
                type: 'string',
                description: 'New end time (ISO 8601)'
              },
              category: {
                type: 'string',
                description: 'New category',
                enum: ['content', 'release', 'ads', 'tour', 'admin', 'promo', 'meeting']
              },
              color: {
                type: 'string',
                description: 'New color (hex code)'
              },
              icon: {
                type: 'string',
                description: 'New icon (emoji)'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_ghoste_calendar_event',
          description:
            'Delete a scheduled calendar event when the user cancels or removes it.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The event\'s unique ID in Ghoste calendar.'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event',
          description:
            'Create a single calendar event in the user\'s connected Google Calendar via Ghoste.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description:
                  'Short title for the event, for example "Listening party for new single".'
              },
              description: {
                type: 'string',
                description: 'Optional notes or extra info for the event.'
              },
              location: {
                type: 'string',
                description: 'Physical address or meeting link (optional).'
              },
              startIso: {
                type: 'string',
                description:
                  'ISO 8601 start datetime, for example "2025-12-13T16:00:00-06:00".'
              },
              endIso: {
                type: 'string',
                description:
                  'ISO 8601 end datetime, for example "2025-12-13T17:00:00-06:00".'
              },
              timezone: {
                type: 'string',
                description:
                  'IANA timezone like "America/Chicago". Use what you infer from the user context if not given.'
              },
              allDay: {
                type: 'boolean',
                description: 'Whether the event is all day.',
                default: false
              }
            },
            required: ['title', 'startIso', 'endIso']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_week_schedule',
          description:
            'Fetch the user\'s calendar events for a given week and then summarize them.',
          parameters: {
            type: 'object',
            properties: {
              startIso: {
                type: 'string',
                description: 'ISO start of the week in the user\'s timezone.'
              },
              endIso: {
                type: 'string',
                description: 'ISO end of the week in the user\'s timezone.'
              }
            },
            required: ['startIso', 'endIso']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_ad_campaigns',
          description:
            'List the user\'s Meta ad campaigns from Ghoste. Use this before editing or toggling campaigns to show the user what campaigns exist.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_ad_campaigns',
          description:
            'Create one or more ad campaign drafts or launch them to Meta. ONLY use AFTER the user explicitly confirms to create campaigns. This saves to Ghoste ad_campaigns and can optionally push to Meta.',
          parameters: {
            type: 'object',
            properties: {
              campaigns: {
                type: 'array',
                description:
                  'List of campaigns to create. Each needs complete ad spec including creatives, targeting, and copy.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Campaign name' },
                    objective: {
                      type: 'string',
                      description: 'Campaign objective like OUTCOME_TRAFFIC, LINK_CLICKS'
                    },
                    daily_budget: {
                      type: 'number',
                      description: 'Daily budget in cents (e.g., 1000 = $10/day)'
                    },
                    ad_account_id: {
                      type: 'string',
                      description: 'Meta ad account ID (e.g., act_123456)'
                    },
                    pixel_id: { type: 'string', description: 'Meta pixel ID' },
                    page_id: { type: 'string', description: 'Meta Page ID for posting ads' },
                    instagram_id: { type: 'string', description: 'Instagram account ID (optional)' },
                    link_url: { type: 'string', description: 'Ad destination URL (smart link or external)' },
                    headline: { type: 'string', description: 'Ad headline text (40-100 chars)' },
                    primary_text: { type: 'string', description: 'Primary ad copy (125-500 chars)' },
                    description: { type: 'string', description: 'Optional description text' },
                    targeting_countries: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Array of country codes (e.g., ["US", "CA", "GB"])'
                    },
                    targeting_terms: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Optional interest targeting keywords (e.g., ["music", "hip hop"])'
                    },
                    placement_mode: {
                      type: 'string',
                      enum: ['automatic', 'manual'],
                      description: 'Placement mode (automatic = Meta optimizes, manual = specific placements)'
                    },
                    placement_config: {
                      type: 'object',
                      description: 'Manual placement config (only if placement_mode is manual)',
                      properties: {
                        publisherPlatforms: { type: 'array', items: { type: 'string' } },
                        facebookPositions: { type: 'array', items: { type: 'string' } },
                        instagramPositions: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    creatives_config: {
                      type: 'array',
                      description: 'Array of creative assets from uploaded media',
                      items: {
                        type: 'object',
                        properties: {
                          index: { type: 'number', description: 'Creative index (0, 1, 2...)' },
                          url: { type: 'string', description: 'Public URL to video/image' },
                          fileType: { type: 'string', description: 'MIME type (video/mp4, image/jpeg, etc.)' },
                          thumbnailUrl: { type: 'string', description: 'Thumbnail URL for videos' }
                        },
                        required: ['index', 'url']
                      }
                    },
                    smart_link_id: { type: 'string', description: 'UUID of smart link if using one' },
                    custom_conversion_id: { type: 'string', description: 'Optional custom conversion ID' }
                  },
                  required: ['name', 'objective', 'daily_budget', 'ad_account_id', 'pixel_id', 'link_url', 'headline', 'primary_text', 'targeting_countries']
                }
              },
              mode: {
                type: 'string',
                enum: ['draft_only', 'launch_now'],
                description:
                  'draft_only = save as drafts only (no Meta API call). launch_now = create campaigns via Meta API (real spend). Default to draft_only unless user explicitly says launch.'
              }
            },
            required: ['campaigns', 'mode']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_ad_campaign',
          description:
            'Update an existing ad campaign\'s name and/or daily budget. Use when the user asks to tweak a campaign.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Ghoste meta_ad_campaigns table ID (UUID)'
              },
              name: { type: 'string', description: 'New campaign name' },
              daily_budget: {
                type: 'number',
                description: 'New daily budget in cents'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'toggle_ad_campaign_status',
          description:
            'Pause or resume an ad campaign. Use when the user asks to pause, stop, or turn a campaign back on.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Ghoste meta_ad_campaigns table ID (UUID)'
              },
              status: {
                type: 'string',
                enum: ['ACTIVE', 'PAUSED'],
                description: 'Target status (ACTIVE = running, PAUSED = stopped)'
              }
            },
            required: ['id', 'status']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'duplicate_ad_campaign',
          description:
            'Duplicate an existing ad campaign. Use when the user asks to clone or copy a campaign.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Ghoste meta_ad_campaigns table ID to duplicate'
              },
              launch_to_meta: {
                type: 'boolean',
                description:
                  'Whether to immediately launch the duplicate to Meta (true) or save as draft (false). Default false.'
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_artist_ads_context',
          description:
            'Fetch everything needed to suggest ads: artist profile, connected Meta assets (ad accounts, pixels), smart links, and streaming stats. Call this FIRST before suggesting campaign setups so you can automatically pick the right account/pixel and ask fewer questions.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_media_assets',
          description:
            'List the latest uploaded Ghoste AI media (videos, cover art, audio) so you can choose a creative for ads or smart links. Call this when planning campaigns to see what media is available.',
          parameters: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Max number of assets to return (default 5).'
              },
              media_type: {
                type: 'string',
                description: 'Filter by type: video, image, audio, or omit for all types.',
                enum: ['video', 'image', 'audio']
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_links',
          description:
            'List all existing links (Smart Links, One-Click, Email Capture, Pre-Saves, Listening Parties) so you can show the user what they have or let them pick from a dropdown. Call this when the user asks "what links do I have?" or before creating a new link to check for duplicates.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_smart_link',
          description:
            'Create a new Smart Link that aggregates multiple streaming platforms (Spotify, Apple Music, YouTube, etc.) into one page. Use this when the user wants to create a link to a song or album.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Link title, e.g. "My New Single"'
              },
              spotify_url: {
                type: 'string',
                description: 'Spotify URL (optional)'
              },
              apple_music_url: {
                type: 'string',
                description: 'Apple Music URL (optional)'
              },
              youtube_url: {
                type: 'string',
                description: 'YouTube URL (optional)'
              },
              tidal_url: {
                type: 'string',
                description: 'Tidal URL (optional)'
              },
              soundcloud_url: {
                type: 'string',
                description: 'SoundCloud URL (optional)'
              },
              button_label: {
                type: 'string',
                description: 'Custom button label (optional)'
              },
              button_url: {
                type: 'string',
                description: 'Custom button URL (optional)'
              },
              template: {
                type: 'string',
                description: 'Template style: Modern, Minimal, Gradient, Dark (default: Modern)'
              }
            },
            required: ['title']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_one_click_link',
          description:
            'Create a simple redirect link that sends fans directly to a single destination (e.g., your website, merch store, or social profile). Use this for simple redirects.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Link title for internal reference'
              },
              target_url: {
                type: 'string',
                description: 'The destination URL to redirect to'
              },
              slug: {
                type: 'string',
                description: 'Optional custom slug for the short link'
              }
            },
            required: ['title', 'target_url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_email_capture_link',
          description:
            'Create a landing page that captures fan emails before redirecting. Use this when the artist wants to build their email list.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Link title'
              },
              description: {
                type: 'string',
                description: 'Optional description shown on the landing page'
              },
              redirect_url: {
                type: 'string',
                description: 'Where to redirect fans after they submit email (optional)'
              },
              slug: {
                type: 'string',
                description: 'Optional custom slug'
              }
            },
            required: ['title']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_presave',
          description:
            'Create a pre-save campaign for an upcoming release. Fans can pre-save the track on Spotify/Apple Music before release date.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Release title, e.g. "My New Album"'
              },
              release_date: {
                type: 'string',
                description: 'Release date in ISO format (YYYY-MM-DD)'
              },
              spotify_artist_url: {
                type: 'string',
                description: 'Spotify artist URL (optional)'
              },
              spotify_track_url: {
                type: 'string',
                description: 'Spotify track URL (optional)'
              },
              apple_music_url: {
                type: 'string',
                description: 'Apple Music URL (optional)'
              },
              cover_image_url: {
                type: 'string',
                description: 'Cover art URL (optional)'
              },
              slug: {
                type: 'string',
                description: 'Optional custom slug'
              }
            },
            required: ['title']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_listening_party',
          description:
            'Create a live listening party where fans can listen together at a scheduled time. Great for album releases or exclusive premieres.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Party title, e.g. "Album Release Listening Party"'
              },
              spotify_url: {
                type: 'string',
                description: 'Spotify URL to play (optional)'
              },
              start_time: {
                type: 'string',
                description: 'Start time in ISO format (optional)'
              },
              public_url: {
                type: 'string',
                description: 'Custom public URL (optional)'
              }
            },
            required: ['title']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_cover_art',
          description:
            'Generate AI cover art using DALL-E and save it to the user\'s uploads so it can be used in links, ads, and social posts. Call this when the user asks to create cover art or album artwork.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Detailed description of the cover art to generate, e.g. "dark moody synthwave album cover with neon city skyline"'
              },
              style: {
                type: 'string',
                description: 'Art style: album_cover, single_art, playlist_cover, profile_pic (optional)'
              },
              size: {
                type: 'string',
                description: 'Image size: 1024x1024, 1792x1024, 1024x1792 (optional, default 1024x1024)'
              },
              title: {
                type: 'string',
                description: 'Title for the artwork (optional)'
              }
            },
            required: ['prompt']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_calendar_events_tool',
          description:
            'List the user\'s calendar events from their Ghoste calendar. Use this to show what events they have scheduled or to check for scheduling conflicts.',
          parameters: {
            type: 'object',
            properties: {
              start_at: {
                type: 'string',
                description: 'Start date/time in ISO format (optional, defaults to 7 days ago)'
              },
              end_at: {
                type: 'string',
                description: 'End date/time in ISO format (optional, defaults to 60 days from now)'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_calendar_event_tool',
          description:
            'Create a new calendar event in the user\'s Ghoste calendar. Use this when the user asks to schedule something or add an event to their calendar.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Event title, e.g. "Album release party"'
              },
              start_at: {
                type: 'string',
                description: 'Start date/time in ISO format, e.g. "2025-12-13T16:00:00-06:00"'
              },
              end_at: {
                type: 'string',
                description: 'End date/time in ISO format, e.g. "2025-12-13T18:00:00-06:00"'
              },
              description: {
                type: 'string',
                description: 'Optional event description'
              },
              location: {
                type: 'string',
                description: 'Optional event location'
              },
              status: {
                type: 'string',
                description: 'Event status: scheduled, draft, completed, cancelled (default: scheduled)',
                enum: ['scheduled', 'draft', 'completed', 'cancelled']
              }
            },
            required: ['title', 'start_at', 'end_at']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'update_calendar_event_tool',
          description:
            'Update an existing calendar event. Use this when the user wants to reschedule or modify an event.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Event ID to update'
              },
              title: {
                type: 'string',
                description: 'New event title (optional)'
              },
              start_at: {
                type: 'string',
                description: 'New start date/time in ISO format (optional)'
              },
              end_at: {
                type: 'string',
                description: 'New end date/time in ISO format (optional)'
              },
              description: {
                type: 'string',
                description: 'New event description (optional)'
              },
              location: {
                type: 'string',
                description: 'New event location (optional)'
              },
              status: {
                type: 'string',
                description: 'New event status (optional)',
                enum: ['scheduled', 'draft', 'completed', 'cancelled']
              }
            },
            required: ['id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'delete_calendar_event_tool',
          description:
            'Delete a calendar event from the user\'s Ghoste calendar. Use this when the user wants to cancel or remove an event.',
          parameters: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Event ID to delete'
              }
            },
            required: ['id']
          }
        }
      }
    ];

    console.log('[ghosteAgent] Making OpenAI call with', tools.length, 'tools available');
    console.log('[ghosteAgent] Tool names:', tools.map(t => t.function.name).join(', '));

    let first: OpenAI.Chat.Completions.ChatCompletion | null = null;
    let openaiError: Error | null = null;

    try {
      first = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto'
      });
      console.log('[ghosteAgent] OpenAI response received');
    } catch (err: any) {
      openaiError = err;
      console.error('[ghosteAgent] OpenAI API error:', {
        error: err.message || String(err),
        code: err.code,
        type: err.type,
        status: err.status,
      });

      const fallbackMessage = {
        role: 'assistant' as const,
        content: "Ghoste AI is temporarily unavailable. This is usually due to high usage or API billing. Your message has been saved. Please try again in a moment."
      };

      await supabase
        .from('ai_conversations')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalConversationId);

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: fallbackMessage,
          conversation_id: finalConversationId,
          ai_unavailable: true,
        })
      };
    }

    const choice = first?.choices?.[0];
    const toolCalls = choice?.message?.tool_calls ?? [];
    console.log('[ghosteAgent] Tool calls count:', toolCalls.length);
    if (toolCalls.length > 0) {
      console.log('[ghosteAgent] Tool calls:', toolCalls.map(tc => tc.function.name).join(', '));
    } else {
      console.log('[ghosteAgent] ⚠️ No tool calls made by AI - it just responded with text');
      console.log('[ghosteAgent] AI response:', choice?.message?.content?.slice(0, 200));
    }

    const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...messages,
      choice.message as any
    ];

    const baseUrl = getBaseUrl();

    if (toolCalls.length > 0) {
      console.log('[ghosteAgent] Processing tool calls:', JSON.stringify(toolCalls, null, 2));

      for (const call of toolCalls) {
        const toolName = call.function.name;
        let args: any = {};

        console.log('[ghosteAgent] Processing tool call:', toolName);

        try {
          args =
            typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments)
              : call.function.arguments;
          console.log('[ghosteAgent] Parsed arguments for', toolName, ':', JSON.stringify(args, null, 2));
        } catch (err) {
          console.error('[ghosteAgent] ❌ Failed to parse tool args', err, call.function.arguments);
          args = {};
        }

        if (toolName === 'schedule_ghoste_calendar_events') {
          console.log('[ghosteAgent] 🎯 Handling schedule_ghoste_calendar_events');

          try {
            const result = await insertGhosteCalendarEvents({
              userId,
              events: args.events || [],
            });

            console.log('[ghosteAgent] ✅ schedule_ghoste_calendar_events completed:', result);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                created_count: result.created_count,
                message: `Successfully added ${result.created_count} events to the calendar`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ schedule_ghoste_calendar_events failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'update_ghoste_calendar_event') {
          console.log('[ghosteAgent] ✏️ Handling update_ghoste_calendar_event');

          try {
            const result = await updateGhosteCalendarEvent({
              userId,
              update: args,
            });

            console.log('[ghosteAgent] ✅ update_ghoste_calendar_event completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                message: `Successfully updated event ${args.id}`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ update_ghoste_calendar_event failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'delete_ghoste_calendar_event') {
          console.log('[ghosteAgent] 🗑️ Handling delete_ghoste_calendar_event');

          try {
            const result = await deleteGhosteCalendarEvent({
              userId,
              id: args.id,
            });

            console.log('[ghosteAgent] ✅ delete_ghoste_calendar_event completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                message: `Successfully deleted event ${args.id}`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ delete_ghoste_calendar_event failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_calendar_event') {
          console.log('[ghosteAgent] 📅 Handling create_calendar_event (forwarding to calendarCreateEvent)');
          const res = await fetch(
            `${baseUrl}/.netlify/functions/calendarCreateEvent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                ...args
              })
            }
          );

          if (!res.ok) {
            const text = await res.text();
            console.error('calendarCreateEvent HTTP error', res.status, text);
          }

          const json = await res.json().catch(() => ({}));
          console.log('calendarCreateEvent result:', json);

          allMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify(json)
          });
        }

        if (toolName === 'get_week_schedule') {
          console.log('[ghosteAgent] 📆 Handling get_week_schedule');

          const res = await fetch(
            `${baseUrl}/.netlify/functions/calendarListWeek`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                startIso: args.startIso,
                endIso: args.endIso
              })
            }
          );

          if (!res.ok) {
            const text = await res.text();
            console.error('[ghosteAgent] ❌ calendarListWeek HTTP error', res.status, text);
          }

          const json = await res.json().catch(() => ({}));
          console.log('[ghosteAgent] ✅ calendarListWeek result:', json);

          allMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: toolName,
            content: JSON.stringify(json)
          });
        }

        // === AD CAMPAIGN TOOLS ===

        if (toolName === 'list_ad_campaigns') {
          console.log('[ghosteAgent] 📊 Handling list_ad_campaigns');

          try {
            const campaigns = await listGhosteAdCampaignsForUser(userId);

            console.log('[ghosteAgent] ✅ list_ad_campaigns completed:', campaigns.length, 'campaigns');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                campaigns: campaigns.map(c => ({
                  id: c.id,
                  name: c.name,
                  objective: c.objective,
                  daily_budget: c.daily_budget,
                  status: c.status,
                  ad_account_id: c.ad_account_id,
                  pixel_id: c.pixel_id,
                  campaign_id: c.campaign_id,
                  created_at: c.created_at,
                })),
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ list_ad_campaigns failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_ad_campaigns') {
          console.log('[ghosteAgent] 🚀 Handling create_ad_campaigns');

          try {
            const { campaigns: campaignPlans, mode } = args as {
              campaigns: GhosteAdCampaignPlanInput[];
              mode: 'draft_only' | 'launch_now';
            };

            console.log('[ghosteAgent] Creating campaigns:', { mode, count: campaignPlans.length });

            const createdCampaigns: any[] = [];

            for (const plan of campaignPlans) {
              // 1) Save draft
              const draft = await upsertGhosteAdCampaignDraft(userId, plan);
              console.log('[ghosteAgent] Draft saved:', draft.id);

              let final = draft;

              // 2) Optionally launch to Meta
              if (mode === 'launch_now') {
                console.log('[ghosteAgent] Launching to Meta:', draft.id);
                final = await createMetaCampaignForUser({
                  userId,
                  plan,
                  draftId: draft.id,
                });
                console.log('[ghosteAgent] Meta campaign created:', final.campaign_id);
              }

              createdCampaigns.push(final);
            }

            console.log('[ghosteAgent] ✅ create_ad_campaigns completed:', createdCampaigns.length, 'campaigns');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                mode,
                campaigns: createdCampaigns,
                message: `Successfully created ${createdCampaigns.length} campaigns (${mode})`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_ad_campaigns failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'update_ad_campaign') {
          console.log('[ghosteAgent] ✏️ Handling update_ad_campaign');

          try {
            const { id, name, daily_budget } = args as {
              id: string;
              name?: string;
              daily_budget?: number;
            };

            const updated = await updateMetaCampaignForUser({
              userId,
              id,
              name,
              daily_budget,
            });

            console.log('[ghosteAgent] ✅ update_ad_campaign completed:', updated.id);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                campaign: updated,
                message: `Successfully updated campaign ${updated.name}`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ update_ad_campaign failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'toggle_ad_campaign_status') {
          console.log('[ghosteAgent] ⏸️ Handling toggle_ad_campaign_status');

          try {
            const { id, status } = args as {
              id: string;
              status: 'ACTIVE' | 'PAUSED';
            };

            const updated = await toggleMetaCampaignForUser({
              userId,
              id,
              status,
            });

            console.log('[ghosteAgent] ✅ toggle_ad_campaign_status completed:', updated.id, updated.status);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                campaign: updated,
                message: `Successfully ${status === 'ACTIVE' ? 'resumed' : 'paused'} campaign ${updated.name}`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ toggle_ad_campaign_status failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'duplicate_ad_campaign') {
          console.log('[ghosteAgent] 📋 Handling duplicate_ad_campaign');

          try {
            const { id, launch_to_meta } = args as {
              id: string;
              launch_to_meta?: boolean;
            };

            const duplicated = await duplicateGhosteAdCampaign({
              userId,
              id,
              launchToMeta: launch_to_meta ?? false,
            });

            console.log('[ghosteAgent] ✅ duplicate_ad_campaign completed:', duplicated.id);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                campaign: duplicated,
                message: `Successfully duplicated campaign to ${duplicated.name}`,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ duplicate_ad_campaign failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        // === ARTIST ADS CONTEXT (AUTO-RESEARCH) ===

        if (toolName === 'get_artist_ads_context') {
          console.log('[ghosteAgent] 🔍 Handling get_artist_ads_context');

          try {
            const context = await getArtistAdsContext(userId);
            const formattedContext = formatAdsContextForAI(context);

            console.log('[ghosteAgent] ✅ get_artist_ads_context completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                context,
                formatted: formattedContext,
                summary: {
                  has_profile: !!context.profile,
                  has_meta_assets: !!context.metaAssets,
                  ad_accounts_available: context.adAccounts.length,
                  smart_links_count: context.smartLinks.length,
                  has_streaming_stats: !!context.streaming,
                },
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ get_artist_ads_context failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        // === LIST MEDIA ASSETS ===

        if (toolName === 'list_media_assets') {
          console.log('[ghosteAgent] 📁 Handling list_media_assets');

          try {
            const { limit = 5, media_type } = args as {
              limit?: number;
              media_type?: string;
            };

            let query = supabase
              .from('ghoste_media_assets')
              .select('id, url, path, media_type, file_name, file_size, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });

            if (media_type) {
              query = query.eq('media_type', media_type);
            }

            query = query.limit(limit);

            const { data: assets, error } = await query;

            if (error) {
              console.error('[ghosteAgent] ❌ list_media_assets query error:', error);
              throw error;
            }

            console.log('[ghosteAgent] ✅ list_media_assets completed, found:', assets?.length || 0);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                assets: assets || [],
                count: assets?.length || 0,
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ list_media_assets failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
                assets: [],
              }),
            });
          }
        }

        // === GHOSTE TOOLS (LINKS + COVER ART) ===

        if (toolName === 'list_links') {
          console.log('[ghosteAgent] 🔗 Handling list_links');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'list_links', userId }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'list_links failed');
            }

            console.log('[ghosteAgent] ✅ list_links completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ list_links failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_smart_link') {
          console.log('[ghosteAgent] 🎵 Handling create_smart_link');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_smart_link', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_smart_link failed');
            }

            console.log('[ghosteAgent] ✅ create_smart_link completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_smart_link failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_one_click_link') {
          console.log('[ghosteAgent] 🔗 Handling create_one_click_link');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_one_click_link', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_one_click_link failed');
            }

            console.log('[ghosteAgent] ✅ create_one_click_link completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_one_click_link failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_email_capture_link') {
          console.log('[ghosteAgent] 📧 Handling create_email_capture_link');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_email_capture_link', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_email_capture_link failed');
            }

            console.log('[ghosteAgent] ✅ create_email_capture_link completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_email_capture_link failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_presave') {
          console.log('[ghosteAgent] 💿 Handling create_presave');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_presave', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_presave failed');
            }

            console.log('[ghosteAgent] ✅ create_presave completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_presave failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_listening_party') {
          console.log('[ghosteAgent] 🎉 Handling create_listening_party');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_listening_party', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_listening_party failed');
            }

            console.log('[ghosteAgent] ✅ create_listening_party completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_listening_party failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'generate_cover_art') {
          console.log('[ghosteAgent] 🎨 Handling generate_cover_art');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate_cover_art', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'generate_cover_art failed');
            }

            console.log('[ghosteAgent] ✅ generate_cover_art completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ generate_cover_art failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'list_calendar_events_tool') {
          console.log('[ghosteAgent] 📅 Handling list_calendar_events_tool');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'list_calendar_events', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'list_calendar_events failed');
            }

            console.log('[ghosteAgent] ✅ list_calendar_events completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ list_calendar_events failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'create_calendar_event_tool') {
          console.log('[ghosteAgent] 📅 Handling create_calendar_event_tool');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_calendar_event', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'create_calendar_event failed');
            }

            console.log('[ghosteAgent] ✅ create_calendar_event completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ create_calendar_event failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'update_calendar_event_tool') {
          console.log('[ghosteAgent] 📅 Handling update_calendar_event_tool');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_calendar_event', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'update_calendar_event failed');
            }

            console.log('[ghosteAgent] ✅ update_calendar_event completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ update_calendar_event failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'delete_calendar_event_tool') {
          console.log('[ghosteAgent] 📅 Handling delete_calendar_event_tool');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/ghoste-tools`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_calendar_event', userId, ...args }),
              }
            );

            const result = await res.json();

            if (!res.ok) {
              throw new Error(result?.error || 'delete_calendar_event failed');
            }

            console.log('[ghosteAgent] ✅ delete_calendar_event completed');

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ delete_calendar_event failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
              }),
            });
          }
        }

        if (toolName === 'list_uploads') {
          console.log('[ghosteAgent] 📤 Handling list_uploads');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/uploads-tool`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'list_uploads',
                  userId,
                })
              }
            );

            const json = await res.json().catch(() => ({ error: 'parse_failed' }));

            if (!res.ok || !json.ok) {
              throw new Error(json.error || 'Failed to list uploads');
            }

            console.log('[ghosteAgent] ✅ list_uploads completed, found:', json.uploads?.length || 0);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                uploads: json.uploads || [],
                count: json.uploads?.length || 0,
                message: json.uploads?.length > 0
                  ? `Found ${json.uploads.length} uploaded files. Here are the files: ${json.uploads.map((u: any) => `"${u.filename}" (${u.kind}, uploaded ${new Date(u.created_at).toLocaleDateString()})`).join(', ')}`
                  : 'No uploads found yet. The user needs to upload a file first using the file upload area.'
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ list_uploads failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
                uploads: [],
                message: 'Failed to fetch uploads. The user may need to upload files first.'
              }),
            });
          }
        }

        if (toolName === 'resolve_upload') {
          console.log('[ghosteAgent] 🔗 Handling resolve_upload');

          try {
            const res = await fetch(
              `${baseUrl}/.netlify/functions/uploads-tool`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'resolve_upload',
                  userId,
                  uploadId: args.uploadId,
                  filename: args.filename,
                })
              }
            );

            const json = await res.json().catch(() => ({ error: 'parse_failed' }));

            if (!res.ok || !json.ok) {
              throw new Error(json.error || 'Failed to resolve upload');
            }

            console.log('[ghosteAgent] ✅ resolve_upload completed, URL:', json.url?.slice(0, 50));

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: true,
                upload: json.upload,
                url: json.url,
                message: `Successfully resolved "${json.upload?.filename}". The URL is ready to use for Meta ads or other purposes.`
              }),
            });
          } catch (error: any) {
            console.error('[ghosteAgent] ❌ resolve_upload failed:', error);

            allMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({
                ok: false,
                error: error.message || String(error),
                message: 'Could not find or resolve that upload. Try using list_uploads first to see available files.'
              }),
            });
          }
        }
      }

      let second: OpenAI.Chat.Completions.ChatCompletion | null = null;
      let secondOpenaiError: Error | null = null;

      try {
        second = await openai.chat.completions.create({
          model: MODEL,
          messages: allMessages
        });
      } catch (err: any) {
        secondOpenaiError = err;
        console.error('[ghosteAgent] Second OpenAI API error:', {
          error: err.message || String(err),
          code: err.code,
          type: err.type,
          status: err.status,
        });

        const fallbackMessage = {
          role: 'assistant' as const,
          content: "Ghoste AI encountered an issue while processing your request. Your message and actions have been saved. Please try again in a moment."
        };

        await supabase
          .from('ai_conversations')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('id', finalConversationId);

        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            message: fallbackMessage,
            conversation_id: finalConversationId,
            ai_unavailable: true,
          })
        };
      }

      const finalMsg = second?.choices?.[0]?.message;

      if (finalMsg?.content) {
        await supabase
          .from('ai_conversations')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('id', finalConversationId);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: finalMsg,
          conversation_id: finalConversationId,
        })
      };
    }

    if (choice?.message?.content) {
      await supabase
        .from('ai_conversations')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', finalConversationId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: choice?.message,
        conversation_id: finalConversationId,
      })
    };
  } catch (err: any) {
    console.error('ghosteAgent error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'ghoste_agent_failed',
        detail: err?.message || String(err)
      })
    };
  }
};
