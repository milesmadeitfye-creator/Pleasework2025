import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { ensureUserWallet } from "./_walletHelpers";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Support both query param and auth token
  let user_id = event.queryStringParameters?.user_id;

  // If no user_id in query, try to get from auth token
  if (!user_id) {
    const authHeader = event.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (!authError && user) {
        user_id = user.id;
      }
    }
  }

  if (!user_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing user_id or authorization" }),
    };
  }

  try {
    // Use shared helper to ensure wallet exists and get balances
    const wallet = await ensureUserWallet(user_id);

    console.log("[wallet-read] Returning balances", { userId: user_id, wallet });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        wallet: {
          user_id,
          manager_budget_balance: wallet.manager_budget_balance,
          tools_budget_balance: wallet.tools_budget_balance,
          total_credits: wallet.manager_budget_balance + wallet.tools_budget_balance,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err: any) {
    console.error("[wallet-read] Error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: err.message || "Internal Server Error",
      }),
    };
  }
};
