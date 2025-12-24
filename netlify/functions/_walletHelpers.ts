import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type WalletBalances = {
  manager_budget_balance: number;
  tools_budget_balance: number;
};

// Test user ID that should get 10M + 10M credits for testing
const TEST_USER_ID = "1d4c87f7-9044-4815-97d4-71b3e70ed8e0";

/**
 * Ensures a user has a wallet row and returns their current balances
 * - If wallet exists: returns current balances
 * - If wallet doesn't exist: creates with default plan values (2598 manager, 402 tools)
 * - For TEST_USER_ID: forces 10M + 10M for testing flows
 *
 * @param userId - User ID
 * @returns Current wallet balances
 */
export async function ensureUserWallet(userId: string): Promise<WalletBalances> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1) Try to load existing row
  const { data, error } = await supabase
    .from("user_wallets")
    .select("user_id, manager_budget_balance, tools_budget_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    // Real error - bubble it up
    console.error("[ensureUserWallet] Error loading wallet:", error);
    throw error;
  }

  let manager = data?.manager_budget_balance ?? 0;
  let tools = data?.tools_budget_balance ?? 0;

  // 2) If there is no row, create it with default plan values
  if (!data) {
    manager = 2598;
    tools = 402;

    const { error: insertError } = await supabase
      .from("user_wallets")
      .insert({
        user_id: userId,
        manager_budget_balance: manager,
        tools_budget_balance: tools,
      });

    if (insertError) {
      console.error("[ensureUserWallet] Error creating wallet:", insertError);
      throw insertError;
    }

    console.log(`[ensureUserWallet] Created wallet for user ${userId} with defaults:`, { manager, tools });
  }

  // 3) TEMP: for test user, force 10M + 10M so we can test flows
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

    if (updateError) {
      console.error("[ensureUserWallet] Error updating test user wallet:", updateError);
      throw updateError;
    }

    console.log(`[ensureUserWallet] Updated test user ${userId} with 10M + 10M credits`);
  }

  return { manager_budget_balance: manager, tools_budget_balance: tools };
}
