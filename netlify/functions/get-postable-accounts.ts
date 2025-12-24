import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

export interface PostableAccount {
  id: string;
  provider: 'meta';
  type: 'facebook_page' | 'instagram_business';
  externalId: string;
  name: string;
  avatarUrl?: string;
  canPublish: boolean;
}

export const handler: Handler = async (event) => {
  console.log("[get-postable-accounts] Request received");

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse(401, { error: "Not authenticated" });
    }

    console.log("[get-postable-accounts] User verified:", user.id.substring(0, 8) + "...");

    // Check if user has Meta connection
    const { data: metaConnection } = await supabase
      .from("user_meta_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!metaConnection || !metaConnection.access_token) {
      console.log("[get-postable-accounts] No Meta connection found");
      return jsonResponse(200, { accounts: [] });
    }

    const accounts: PostableAccount[] = [];

    // Fetch Facebook Pages
    const { data: pages, error: pagesError } = await supabase
      .from("meta_pages")
      .select("*")
      .eq("user_id", user.id);

    if (!pagesError && pages) {
      for (const page of pages) {
        accounts.push({
          id: `page_${page.page_id}`,
          provider: 'meta',
          type: 'facebook_page',
          externalId: page.page_id,
          name: page.page_name,
          avatarUrl: undefined,
          canPublish: true,
        });
      }
      console.log("[get-postable-accounts] Found", pages.length, "Facebook pages");
    }

    // Fetch Instagram Business Accounts
    const { data: instagramAccounts, error: igError } = await supabase
      .from("meta_instagram_accounts")
      .select("*")
      .eq("user_id", user.id);

    if (!igError && instagramAccounts) {
      for (const ig of instagramAccounts) {
        accounts.push({
          id: `ig_${ig.instagram_id}`,
          provider: 'meta',
          type: 'instagram_business',
          externalId: ig.instagram_id,
          name: `@${ig.username}`,
          avatarUrl: ig.profile_picture_url || undefined,
          canPublish: true,
        });
      }
      console.log("[get-postable-accounts] Found", instagramAccounts.length, "Instagram accounts");
    }

    console.log("[get-postable-accounts] Returning", accounts.length, "total accounts");

    return jsonResponse(200, { accounts });
  } catch (err: any) {
    console.error("[get-postable-accounts] Error:", err);
    return jsonResponse(500, {
      error: "Unexpected error",
      accounts: [],
    });
  }
};
