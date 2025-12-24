import type { Handler } from "@netlify/functions";
import OpenAI from "openai";
import { sb, jsonHeaders } from "./_sb";
import { supabaseAdmin } from "./_supabaseAdmin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEBUG_VERSION = "ghoste-ai-analytics-v1.0.0";

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function buildAnalyticsDecisionPrompt(analytics: any, goal?: string, budget?: number) {
  const goalText = goal ? `\n\nUSER'S GOAL: ${goal}` : "";
  const budgetText = budget ? `\n\nBUDGET: $${budget}` : "";

  return `You are Ghoste AI — a music marketing strategist analyzing streaming analytics.

====================================================
YOUR TASK
====================================================
Analyze the streaming analytics data and produce:
1. A brief summary (2-3 sentences)
2. Key decisions (1-3 actionable decisions with confidence levels)
3. Insights (5-10 metric observations with meaning)
4. Next actions (prioritized action steps with CTAs)

====================================================
DECISION RULES
====================================================

Stream Growth Patterns:
- If streams ↑ but saves/listener ratio ↓ → recommend better hooks + save CTA + content adjustments
- If streams flat for 28d → recommend 7-day sprint plan (content + small ads + outreach)
- If one track spikes significantly → double down (UGC + smart link push + retargeting ads)

Geographic Insights:
- If top cities cluster in specific regions → recommend geo-targeted content/ads for those cities
- If international growth detected → recommend localized content strategy

Platform Mix:
- If Spotify strong but TikTok/IG weak → recommend short-form content strategy
- If saves high relative to streams → audience is engaged, recommend doubling content frequency

Data Quality:
- If data missing or incomplete → say "insufficient data" and recommend what to track next
- Never guess numbers or make up metrics

Safety Guardrails:
- NEVER automatically spend money; recommendations only
- Always include "why" for each decision
- Be realistic about effort and timeline
- Match recommendations to apparent artist level (emerging/mid/established)

====================================================
OUTPUT FORMAT (JSON ONLY)
====================================================
{
  "summary": "string (2-3 sentences about overall health)",
  "decisions": [
    {
      "title": "string (decision headline)",
      "why": "string (data-driven reason)",
      "confidence": "low" | "med" | "high"
    }
  ],
  "insights": [
    {
      "metric": "string (metric name)",
      "change": "string (trend description)",
      "meaning": "string (what it means for growth)"
    }
  ],
  "next_actions": [
    {
      "title": "string (action title)",
      "why": "string (reason to do this)",
      "priority": "high" | "med" | "low",
      "cta_label": "string (button text)",
      "cta_route": "string (app route like /ads or /smart-links)"
    }
  ],
  "what_to_do_today": [
    "string (immediate action 1)",
    "string (immediate action 2)",
    "string (immediate action 3)"
  ]
}

====================================================
ANALYTICS DATA
====================================================
${JSON.stringify(analytics, null, 2)}${goalText}${budgetText}

====================================================
INSTRUCTIONS
====================================================
1. Analyze only the provided data (no guessing)
2. Produce 1-3 decisions with clear reasoning
3. Provide 5-10 insights about metrics
4. Give 3-5 next actions with priority levels
5. Include 3 "what to do today" bullets
6. Return ONLY valid JSON matching the format above
7. Be specific and actionable
8. If data is insufficient, say so explicitly`;
}

/**
 * ghoste-ai-analytics
 *
 * Fetches streaming analytics and produces AI-driven decisions + recommendations
 */
export const handler: Handler = async (event) => {
  console.log("[ghoste-ai-analytics] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  // Validate auth
  const authHeader = event.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await sb.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  const userId = user.id;

  // Parse body
  let body: {
    range?: "7d" | "28d" | "90d";
    artist_id?: string;
    spotify_artist_id?: string;
    goal?: "growth" | "playlisting" | "touring" | "ads";
    budget?: number;
  };

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "INVALID_JSON" });
  }

  const range = body.range || "28d";
  const spotifyArtistId = body.spotify_artist_id || body.artist_id;
  const goal = body.goal;
  const budget = body.budget;

  console.log("[ghoste-ai-analytics] Analyzing:", {
    userId: userId.substring(0, 8) + "...",
    range,
    spotifyArtistId,
    goal,
    budget,
  });

  try {
    // Fetch analytics data
    const analyticsResponse = await fetch(`${process.env.URL || ""}/.netlify/functions/analytics-streaming-get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        range,
        spotify_artist_id: spotifyArtistId,
      }),
    });

    if (!analyticsResponse.ok) {
      throw new Error("Failed to fetch analytics data");
    }

    const analyticsData = await analyticsResponse.json();

    if (!analyticsData.artists || analyticsData.artists.length === 0) {
      return jsonResponse(200, {
        success: true,
        summary: "No analytics data available yet. Add and track an artist first.",
        decisions: [],
        insights: [
          {
            metric: "Data Availability",
            change: "No data",
            meaning: "Set up artist tracking to get streaming insights",
          },
        ],
        next_actions: [
          {
            title: "Track Your First Artist",
            why: "Analytics require connected artist data",
            priority: "high",
            cta_label: "Go to Analytics",
            cta_route: "/analytics",
          },
        ],
        what_to_do_today: [
          "Navigate to Analytics page",
          "Search and save your artist profile",
          "Wait for initial data sync (2-24 hours)",
        ],
        data_used: { range, artist_id: spotifyArtistId || null },
        debug_version: DEBUG_VERSION,
      });
    }

    // Truncate if data is too large (keep under 10KB for prompt)
    const analyticsStr = JSON.stringify(analyticsData);
    const truncatedAnalytics = analyticsStr.length > 10000
      ? JSON.parse(analyticsStr.substring(0, 10000) + "...")
      : analyticsData;

    // Build system prompt with analytics
    const systemPrompt = buildAnalyticsDecisionPrompt(truncatedAnalytics, goal, budget);

    console.log("[ghoste-ai-analytics] Calling OpenAI with analytics data:", {
      artistCount: analyticsData.artists.length,
      dataSize: analyticsStr.length,
      truncated: analyticsStr.length > 10000,
    });

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analyze this data and provide your recommendations." },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const reply = completion.choices[0]?.message?.content || "";

    console.log("[ghoste-ai-analytics] OpenAI response received:", {
      length: reply.length,
      hasContent: !!reply,
    });

    // Parse JSON response
    let result: any;
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = reply.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : reply;
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[ghoste-ai-analytics] Failed to parse AI response:", parseError);
      // Return a fallback structure
      result = {
        summary: reply.split("\n")[0] || "Analysis complete",
        decisions: [],
        insights: [],
        next_actions: [],
        what_to_do_today: ["Review analytics data", "Consider growth strategies", "Plan content calendar"],
      };
    }

    // Save recommendation to database
    try {
      await supabaseAdmin.from("ai_recommendations").insert({
        user_id: userId,
        range,
        artist_id: spotifyArtistId,
        payload_json: {
          ...result,
          analytics_summary: {
            artist_count: analyticsData.artists.length,
            range,
            goal,
            budget,
          },
        },
      });
    } catch (dbError) {
      console.warn("[ghoste-ai-analytics] Failed to save recommendation:", dbError);
      // Don't fail the request if DB save fails
    }

    return jsonResponse(200, {
      success: true,
      ...result,
      data_used: {
        range,
        artist_id: spotifyArtistId || null,
        goal,
        budget,
      },
      debug_version: DEBUG_VERSION,
    });
  } catch (err: any) {
    console.error("[ghoste-ai-analytics] Error:", err);
    return jsonResponse(500, {
      error: "ANALYTICS_AI_ERROR",
      message: err.message || "Failed to generate analytics insights",
      debug_version: DEBUG_VERSION,
    });
  }
};

export default handler;
