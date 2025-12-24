import type { Handler } from "@netlify/functions";
import { getMetaContextForUser } from "./_metaContext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface ResolveGenresRequest {
  adAccountId: string;
  genres: string[];
}

interface ResolvedInterest {
  id: string;
  name: string;
  audience_size?: number;
}

interface ResolveGenresResponse {
  resolved: ResolvedInterest[];
  unresolved: string[];
}

/**
 * Helper: Resolve a single genre to Meta interest using targetingsearch
 */
async function resolveGenre(
  genre: string,
  adAccountId: string,
  accessToken: string
): Promise<ResolvedInterest | null> {
  try {
    const url = new URL(`https://graph.facebook.com/v19.0/act_${adAccountId}/targetingsearch`);
    url.searchParams.set("type", "adinterest");
    url.searchParams.set("q", genre);
    url.searchParams.set("limit", "5");
    url.searchParams.set("fields", "id,name,audience_size");
    url.searchParams.set("access_token", accessToken);

    console.log("[meta-resolve-genres] Searching for:", genre);

    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error("[meta-resolve-genres] API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.log("[meta-resolve-genres] No matches for:", genre);
      return null;
    }

    // Best match logic:
    // 1. Prefer exact name match (case-insensitive)
    // 2. Otherwise choose highest audience_size
    const exactMatch = data.data.find(
      (item: any) => item.name.toLowerCase() === genre.toLowerCase()
    );

    if (exactMatch) {
      console.log("[meta-resolve-genres] Exact match:", genre, "→", exactMatch.name);
      return {
        id: exactMatch.id,
        name: exactMatch.name,
        audience_size: exactMatch.audience_size,
      };
    }

    // Sort by audience_size descending and take the first one
    const sorted = data.data.sort((a: any, b: any) => {
      const aSize = a.audience_size || 0;
      const bSize = b.audience_size || 0;
      return bSize - aSize;
    });

    const bestMatch = sorted[0];
    console.log("[meta-resolve-genres] Best match:", genre, "→", bestMatch.name);

    return {
      id: bestMatch.id,
      name: bestMatch.name,
      audience_size: bestMatch.audience_size,
    };
  } catch (error: any) {
    console.error("[meta-resolve-genres] Error resolving genre:", genre, error.message);
    return null;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing authorization header" }),
      };
    }

    // Parse request body
    const body: ResolveGenresRequest = JSON.parse(event.body || "{}");
    const { adAccountId, genres } = body;

    if (!adAccountId || !genres || !Array.isArray(genres)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "adAccountId and genres array required" }),
      };
    }

    if (genres.length === 0) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: [], unresolved: [] }),
      };
    }

    console.log("[meta-resolve-genres] Request:", { adAccountId, genreCount: genres.length });

    // Get Meta context (access token)
    const token = authHeader.replace("Bearer ", "");
    const context = await getMetaContextForUser({ userToken: token });

    if (!context?.accessToken) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No Meta access token found" }),
      };
    }

    // Normalize ad account ID (remove act_ prefix if present)
    const normalizedAccountId = adAccountId.replace(/^act_/, "");

    // Resolve each genre
    const resolved: ResolvedInterest[] = [];
    const unresolved: string[] = [];

    for (const genre of genres) {
      const trimmedGenre = genre.trim();
      if (!trimmedGenre) continue;

      const result = await resolveGenre(trimmedGenre, normalizedAccountId, context.accessToken);

      if (result) {
        resolved.push(result);
      } else {
        unresolved.push(trimmedGenre);
      }
    }

    console.log("[meta-resolve-genres] Results:", {
      resolved: resolved.length,
      unresolved: unresolved.length,
    });

    const response: ResolveGenresResponse = {
      resolved,
      unresolved,
    };

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error("[meta-resolve-genres] Error:", error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to resolve genres" }),
    };
  }
};
