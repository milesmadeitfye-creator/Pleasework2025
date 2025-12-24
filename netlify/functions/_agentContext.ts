import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * Agent Context Builder - Gathers everything the AI manager needs to know
 *
 * Returns a compact JSON context for the LLM prompt including:
 * - User settings
 * - Wallet/budget
 * - Tasks (today + overdue)
 * - Stats snapshot
 * - Ad campaigns
 * - Smart links performance
 * - Recent activity
 */

export async function buildAgentContext(userId: string) {
  const supabase = getSupabaseAdmin();
  const context: any = {
    user_id: userId,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. User profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("artist_name, email, plan, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    context.profile = profile || { artist_name: "Artist", plan: "free" };

    // 2. Manager settings
    const { data: settings } = await supabase
      .from("manager_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    context.manager_settings = settings || { mode: "moderate", messages_per_day: 2 };

    // 3. Wallet/budget
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, manager_budget_tokens, tools_budget_tokens")
      .eq("user_id", userId)
      .maybeSingle();

    context.wallet = wallet || { balance: 0, manager_budget_tokens: 0, tools_budget_tokens: 0 };

    // 4. Tasks (today + overdue)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, priority, status, due_at")
      .eq("user_id", userId)
      .eq("completed", false)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(10);

    context.tasks = tasks || [];

    // 5. Stats snapshot (Songstats placeholder)
    // TODO: When Songstats is integrated, pull from artist_stats_daily
    const { data: stats } = await supabase
      .from("artist_stats_daily")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(7);

    context.stats = {
      source: stats && stats.length > 0 ? "artist_stats_daily" : "pending_songstats",
      snapshots: stats || [],
    };

    // 6. Ad campaigns (active + recent) - NEW unified table
    const { data: campaigns } = await supabase
      .from("ad_campaigns")
      .select("id, name, platform, status, objective, daily_budget_cents, total_budget_cents, targeting, creatives, tracking, external_ids, last_error, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    context.ad_campaigns = campaigns || [];

    // 6b. Campaign performance (last 30 snapshots)
    const { data: performance } = await supabase
      .from("ad_campaign_performance")
      .select("campaign_id, ts, impressions, clicks, spend_cents, conversions, ctr, cpc_cents, cpm_cents, roas")
      .eq("user_id", userId)
      .order("ts", { ascending: false })
      .limit(30);

    context.ad_performance = performance || [];

    // 6c. Pending AI actions (so AI doesn't duplicate proposals)
    const { data: pendingActions } = await supabase
      .from("ai_actions")
      .select("id, domain, action_type, title, status, created_at")
      .eq("user_id", userId)
      .in("status", ["proposed", "approved"])
      .order("created_at", { ascending: false })
      .limit(10);

    context.pending_actions = pendingActions || [];

    // 7. Smart links performance
    const { data: links } = await supabase
      .from("smart_links")
      .select("id, title, slug, clicks, conversions")
      .eq("user_id", userId)
      .order("clicks", { ascending: false })
      .limit(5);

    context.smart_links = links || [];

    // 8. Social posts (recent failures)
    const { data: posts } = await supabase
      .from("social_posts")
      .select("id, content, scheduled_at, status, error")
      .eq("user_id", userId)
      .eq("status", "failed")
      .order("scheduled_at", { ascending: false })
      .limit(3);

    context.failed_posts = posts || [];

    // 9. Listening parties (recent/live)
    const { data: parties } = await supabase
      .from("listening_parties")
      .select("id, title, scheduled_at, status")
      .eq("created_by", userId)
      .in("status", ["scheduled", "live"])
      .order("scheduled_at", { ascending: false })
      .limit(3);

    context.listening_parties = parties || [];

    // 10. Last activity (from agent jobs)
    const { data: lastJob } = await supabase
      .from("ghoste_agent_jobs")
      .select("created_at, job_type")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    context.last_activity = lastJob
      ? {
          last_checkin: lastJob.created_at,
          job_type: lastJob.job_type,
        }
      : { last_checkin: null };

    return context;
  } catch (err) {
    console.error("[buildAgentContext] error", err);
    // Return minimal context on error
    return {
      user_id: userId,
      timestamp: new Date().toISOString(),
      error: "Failed to build full context",
      profile: { artist_name: "Artist" },
      tasks: [],
      stats: { source: "pending_songstats", snapshots: [] },
      ad_campaigns: [],
      smart_links: [],
    };
  }
}
