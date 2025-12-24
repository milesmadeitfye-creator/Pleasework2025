import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getMetaContextForUser } from "./_metaContext";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[meta-connected-assets] Request received");

  // Handle OPTIONS for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, {
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    // Get user from auth header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[meta-connected-assets] Missing or invalid authorization header");
      return jsonResponse(401, {
        success: false,
        error: "UNAUTHORIZED",
        message: "Could not resolve user from token"
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify the JWT and get the user
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error("[meta-connected-assets] Auth verification failed", authError);
      return jsonResponse(401, {
        success: false,
        error: "UNAUTHORIZED",
        message: "Could not resolve user from token"
      });
    }

    console.log("[meta-connected-assets] User verified:", user.id.substring(0, 8) + "...");

    // Use unified helper to get Meta context
    const metaContext = await getMetaContextForUser(user.id, supabaseAdmin);

    if (!metaContext) {
      console.log("[meta-connected-assets] No Meta context found");
      return jsonResponse(200, {
        success: false,
        error: "NO_META_CREDENTIALS",
        message: "No Meta credentials found. Please reconnect your account in Profile → Connected Accounts.",
        adAccounts: [],
        pages: [],
        instagramAccounts: [],
        pixels: [],
        defaults: {},
      });
    }

    // Map assets to expected format
    const adAccounts = metaContext.assets.adAccounts.map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      currency: acc.currency ?? null,
      status: acc.account_status ?? null,
    }));

    const pages = metaContext.assets.pages.map((page: any) => ({
      id: page.id,
      name: page.name,
      instagram_business_account_id: page.instagram_business_account?.id ?? null,
    }));

    const instagramAccounts = metaContext.assets.instagramAccounts.map((ig: any) => ({
      id: ig.id,
      username: ig.username || "",
      profile_picture_url: ig.profile_picture_url || null,
      linked_page_id: ig.page_id || ig.linked_page_id || null,
    }));

    const pixels = metaContext.assets.pixels.map((pixel: any) => ({
      id: pixel.id,
      name: pixel.name,
    }));

    // Build defaults from primary selections
    const defaults = {
      adAccountId: metaContext.primaryAdAccountId || adAccounts[0]?.id || null,
      pageId: metaContext.primaryPageId || pages[0]?.id || null,
      instagramId: metaContext.primaryInstagramId || instagramAccounts[0]?.id || null,
      pixelId: metaContext.primaryPixelId || pixels[0]?.id || null,
    };

    console.log("[meta-connected-assets] Returning assets:", {
      adAccounts: adAccounts.length,
      pages: pages.length,
      instagramAccounts: instagramAccounts.length,
      pixels: pixels.length,
      defaults,
    });

    return jsonResponse(200, {
      success: true,
      adAccounts,
      pages,
      instagramAccounts,
      pixels,
      defaults,
    });
  } catch (err: any) {
    console.error("[meta-connected-assets] Unexpected error:", err);
    return jsonResponse(500, {
      success: false,
      error: "META_ASSETS_FAILED",
      message: "Unexpected error loading Meta assets.",
      details: err?.message || String(err),
    });
  }
};
