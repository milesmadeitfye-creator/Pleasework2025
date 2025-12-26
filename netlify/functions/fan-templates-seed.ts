import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_TEMPLATES = [
  {
    name: "Welcome DM – New Fan",
    category: "welcome",
    body: "Hey {{first_name}}! 🎵 Thanks for connecting. I'm {{artist_name}} and I'm excited to have you here. Drop me a message anytime – I actually read these!",
    variables: { first_name: true, artist_name: true },
  },
  {
    name: "Thanks for the Follow",
    category: "welcome",
    body: "Appreciate the follow {{first_name}}! 🙏 Got new music dropping soon. Want me to send you early access when it's ready?",
    variables: { first_name: true },
  },
  {
    name: "New Release Announcement",
    category: "announcement",
    body: "🚨 NEW MUSIC ALERT 🚨\n\nMy new {{release_type}} \"{{release_name}}\" is out now! {{smart_link}}\n\nLet me know what you think {{first_name}}!",
    variables: { first_name: true, release_type: true, release_name: true, smart_link: true },
  },
  {
    name: "Link Drop (Smart Link)",
    category: "promo",
    body: "Hey {{first_name}}! Here's that link you asked for: {{smart_link}}\n\nAvailable on all platforms. Let me know your favorite track! 🎧",
    variables: { first_name: true, smart_link: true },
  },
  {
    name: "Reply to Story Reaction",
    category: "quick_reply",
    body: "Thanks for the reaction {{first_name}}! 🔥 Means a lot. Got something special coming your way soon...",
    variables: { first_name: true },
  },
  {
    name: "Reply to Comment (Short)",
    category: "comment_reply",
    body: "Appreciate you {{first_name}}! 🙌",
    variables: { first_name: true },
  },
  {
    name: "VIP / Early Access",
    category: "promo",
    body: "{{first_name}} – you're on the VIP list 👑\n\nHere's early access to my new release before it drops everywhere else: {{smart_link}}\n\nYou're one of the first to hear this. What do you think?",
    variables: { first_name: true, smart_link: true },
  },
  {
    name: "Merch Drop",
    category: "promo",
    body: "🛍️ NEW MERCH ALERT\n\nJust dropped new gear {{first_name}}. Limited quantities available: {{merch_link}}\n\nFirst come first serve!",
    variables: { first_name: true, merch_link: true },
  },
  {
    name: "Show Announcement",
    category: "announcement",
    body: "📍 {{city}} SHOW ANNOUNCEMENT\n\nI'm performing in {{city}} on {{date}}! Tickets here: {{ticket_link}}\n\nWho's coming? Tag a friend you're bringing! 🎤",
    variables: { first_name: true, city: true, date: true, ticket_link: true },
  },
  {
    name: "Re-Engagement",
    category: "follow_up",
    body: "Hey {{first_name}}! Been a minute. Just wanted to check in and see how you're doing. I've got some exciting stuff coming up that I think you'll love 👀",
    variables: { first_name: true },
  },
];

/**
 * Seed default templates for a user if they have none
 *
 * POST /fan-templates-seed
 */

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: RESPONSE_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const userId = user.id;

    // Check if user already has templates
    const { count } = await supabase
      .from("fan_templates")
      .select("*", { count: "exact", head: true })
      .eq("owner_user_id", userId);

    if (count && count > 0) {
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          message: "Templates already exist",
          seeded: false,
        }),
      };
    }

    // Seed default templates
    const templates = DEFAULT_TEMPLATES.map((template) => ({
      ...template,
      owner_user_id: userId,
    }));

    const { data, error } = await supabase
      .from("fan_templates")
      .insert(templates)
      .select();

    if (error) {
      console.error("[fan-templates-seed] Error seeding templates:", error);
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        message: "Default templates seeded successfully",
        seeded: true,
        count: data?.length || 0,
      }),
    };
  } catch (error: any) {
    console.error("[fan-templates-seed] Error:", error);
    return {
      statusCode: 500,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

export { handler };
