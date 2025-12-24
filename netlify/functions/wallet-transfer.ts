import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { isDevWalletOverrideEmail } from "./_devWalletOverride";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Get user from auth token
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Missing authorization header" }),
      };
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { direction, amount: rawAmount } = body;

    // Validate direction
    if (!direction || !["manager_to_tools", "tools_to_manager"].includes(direction)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "INVALID_DIRECTION",
          message: 'Direction must be "manager_to_tools" or "tools_to_manager"',
        }),
      };
    }

    // Validate and coerce amount to number
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "INVALID_AMOUNT",
          message: "Amount must be a positive number",
        }),
      };
    }

    console.log(`[wallet-transfer] User ${user.id} (${user.email}) transferring ${amount} credits`);
    console.log(`[wallet-transfer] Direction: ${direction}`);

    // Check if user is in dev override list
    const devWalletOverride = isDevWalletOverrideEmail(user.email);
    if (devWalletOverride) {
      console.log(`[wallet-transfer] DEV OVERRIDE: Bypassing credit checks for ${user.email}`);
    }

    // Import the shared helper (since we can't import at the top without build changes, inline it)
    const ensureUserWallet = async (userId: string) => {
      const { data, error } = await supabase
        .from("user_wallets")
        .select("user_id, manager_budget_balance, tools_budget_balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      let manager = data?.manager_budget_balance ?? 0;
      let tools = data?.tools_budget_balance ?? 0;

      if (!data) {
        // Default plan values
        manager = 2598;
        tools = 402;

        const { error: insertError } = await supabase
          .from("user_wallets")
          .insert({
            user_id: userId,
            manager_budget_balance: manager,
            tools_budget_balance: tools,
          });

        if (insertError) throw insertError;
        console.log(`[wallet-transfer] Created wallet for user ${userId} with defaults:`, { manager, tools });
      }

      // TEMP: for test user, force 10M + 10M
      const TEST_USER_ID = "1d4c87f7-9044-4815-97d4-71b3e70ed8e0";
      if (userId === TEST_USER_ID) {
        manager = 10000000;
        tools = 10000000;

        const { error: updateError } = await supabase
          .from("user_wallets")
          .upsert(
            {
              user_id: userId,
              manager_budget_balance: manager,
              tools_budget_balance: tools,
            },
            { onConflict: "user_id" }
          );

        if (updateError) throw updateError;
        console.log(`[wallet-transfer] Updated test user ${userId} with 10M + 10M credits`);
      }

      return { manager_budget_balance: manager, tools_budget_balance: tools };
    };

    // Use shared helper to ensure wallet exists and get balances
    const wallet = await ensureUserWallet(user.id);
    let manager = wallet.manager_budget_balance;
    let tools = wallet.tools_budget_balance;

    console.log("wallet-transfer before", { userId: user.id, manager, tools, direction, amount });

    // Determine new balances based on direction
    let newManagerBalance: number;
    let newToolsBalance: number;
    let sourceBudget: string;

    if (direction === "tools_to_manager") {
      // Transfer from Tools to Manager
      // Check balance unless user is in dev override list
      if (!devWalletOverride && amount > tools) {
        console.error(`[wallet-transfer] Insufficient funds - Tools balance ${tools} < required ${amount}`);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "INSUFFICIENT_FUNDS",
            message: `Not enough credits in TOOLS budget (Available: ${tools}, Required: ${amount})`,
          }),
        };
      }

      sourceBudget = "TOOLS";
      newToolsBalance = tools - amount;
      newManagerBalance = manager + amount;
    } else {
      // direction === "manager_to_tools"
      // Transfer from Manager to Tools
      // Check balance unless user is in dev override list
      if (!devWalletOverride && amount > manager) {
        console.error(`[wallet-transfer] Insufficient funds - Manager balance ${manager} < required ${amount}`);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "INSUFFICIENT_FUNDS",
            message: `Not enough credits in MANAGER budget (Available: ${manager}, Required: ${amount})`,
          }),
        };
      }

      sourceBudget = "MANAGER";
      newManagerBalance = manager - amount;
      newToolsBalance = tools + amount;
    }

    console.log("wallet-transfer after", { userId: user.id, newManager: newManagerBalance, newTools: newToolsBalance });

    // Update wallet balances (use user_id since it's the primary key)
    const { data: updatedWallet, error: updateError } = await supabase
      .from("user_wallets")
      .update({
        manager_budget_balance: newManagerBalance,
        tools_budget_balance: newToolsBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError || !updatedWallet) {
      console.error("[wallet-transfer] Failed to update wallet:", updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "UPDATE_FAILED",
          message: "Failed to update wallet balances",
        }),
      };
    }

    console.log(`[wallet-transfer] Transfer successful`);

    // CRITICAL: Also update user_profiles table to keep frontend in sync
    // The frontend currently reads from user_profiles (via useUserProfile hook)
    // so we need to sync both tables until full migration to user_wallets
    const { error: profileUpdateError } = await supabase
      .from("user_profiles")
      .update({
        credits_manager: newManagerBalance,
        credits_tools: newToolsBalance,
      })
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error("[wallet-transfer] Failed to sync user_profiles:", profileUpdateError);
      // Don't fail the request - the main wallet is updated, just log the sync error
    } else {
      console.log(`[wallet-transfer] Synced user_profiles with new balances`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        success: true,
        manager_budget_balance: newManagerBalance,
        tools_budget_balance: newToolsBalance,
        manager_credits: newManagerBalance,
        tools_credits: newToolsBalance,
        total_credits: newManagerBalance + newToolsBalance,
      }),
    };
  } catch (err: any) {
    console.error("[wallet-transfer] Unexpected error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "INTERNAL_ERROR",
        message: err.message || "Internal server error",
      }),
    };
  }
};
