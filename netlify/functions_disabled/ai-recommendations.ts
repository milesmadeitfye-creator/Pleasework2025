import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const mockRecommendations = {
      topCountries: ['US', 'GB', 'CA', 'AU', 'DE'],
      topPlatforms: ['Spotify', 'Apple Music', 'YouTube'],
      recommendedInterests: [
        'Alternative Rock',
        'Indie Music',
        'Live Music',
        'Music Festivals',
        'New Music'
      ],
      audienceInsights: {
        avgAge: '18-34',
        gender: 'All',
        peakActivity: 'Evening (6-10 PM)'
      },
      suggestedBudget: {
        daily: 50,
        monthly: 1500
      }
    };

    console.log('[ai-recommendations] Generated mock recommendations for user:', user.id);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        recommendations: mockRecommendations
      })
    };

  } catch (err: any) {
    console.error('[ai-recommendations] Error:', err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err?.message || "Internal server error"
      })
    };
  }
};
