import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * Self-Prompting Scheduler - Enqueue Agent Jobs
 *
 * Runs every 15 minutes
 *
 * For each active user:
 * - Check manager mode (light/moderate/full)
 * - Check quiet hours
 * - Check last message time (throttle)
 * - Check manager budget tokens
 * - Create jobs if due
 *
 * Job types:
 * - checkin: Regular manager check-in
 * - daily_plan: Morning planning session
 * - alert: Urgent notifications
 * - campaign_watch: Monitor ad performance
 * - tasks_nudge: Remind about overdue tasks
 */

const handler: Handler = async (event) => {
  try {
    const supabase = getSupabaseAdmin();

    // Get all users with manager settings (or default moderate)
    const { data: users } = await supabase
      .from("user_profiles")
      .select("user_id")
      .limit(1000);

    if (!users || users.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, enqueued: 0, message: "No users found" }),
      };
    }

    let enqueued = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const shouldEnqueue = await checkAndEnqueue(user.user_id);
        if (shouldEnqueue) enqueued++;
        else skipped++;
      } catch (err) {
        console.error(`[agent-enqueue] Failed for user ${user.user_id}`, err);
        skipped++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, enqueued, skipped }),
    };
  } catch (err: any) {
    console.error("[agent-enqueue] error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

async function checkAndEnqueue(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  // 1. Get manager settings (or defaults)
  const { data: settings } = await supabase
    .from("manager_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const mode = settings?.mode || "moderate";
  const messagesPerDay = settings?.messages_per_day || 2;
  const tokensPerMessage = settings?.tokens_per_message || 6;
  const quietHours = settings?.quiet_hours || {};

  // 2. Check wallet budget
  const { data: wallet } = await supabase
    .from("wallets")
    .select("manager_budget_tokens")
    .eq("user_id", userId)
    .maybeSingle();

  const budgetTokens = wallet?.manager_budget_tokens || 0;

  if (budgetTokens < tokensPerMessage) {
    console.log(`[agent-enqueue] User ${userId} has insufficient tokens`);
    return false;
  }

  // 3. Check quiet hours
  const now = new Date();
  const hour = now.getHours();

  if (quietHours.start && quietHours.end) {
    if (hour >= quietHours.start && hour < quietHours.end) {
      console.log(`[agent-enqueue] User ${userId} in quiet hours`);
      return false;
    }
  }

  // 4. Check last job time (throttle)
  const { data: lastJob } = await supabase
    .from("ghoste_agent_jobs")
    .select("created_at, job_type")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastJobTime = lastJob ? new Date(lastJob.created_at) : null;
  const hoursSinceLastJob = lastJobTime
    ? (now.getTime() - lastJobTime.getTime()) / (1000 * 60 * 60)
    : 999;

  // 5. Determine if job should be enqueued based on mode
  let shouldEnqueue = false;
  let jobType = "checkin";

  switch (mode) {
    case "light":
      // 1 check-in per day (morning)
      if (hoursSinceLastJob >= 24 && hour >= 8 && hour <= 10) {
        shouldEnqueue = true;
        jobType = "daily_plan";
      }
      break;

    case "moderate":
      // 2 check-ins per day (morning + afternoon)
      if (hoursSinceLastJob >= 12) {
        shouldEnqueue = true;
        jobType = hour < 13 ? "daily_plan" : "checkin";
      }
      break;

    case "full":
      // Every 2-4 hours
      if (hoursSinceLastJob >= 2) {
        shouldEnqueue = true;
        jobType = hour < 10 ? "daily_plan" : "checkin";
      }
      break;
  }

  // 6. Enqueue job if needed
  if (shouldEnqueue) {
    const { error } = await supabase.from("ghoste_agent_jobs").insert({
      user_id: userId,
      job_type: jobType,
      status: "queued",
      run_at: new Date().toISOString(),
      context: { mode, enqueued_at: new Date().toISOString() },
    });

    if (error) {
      console.error(`[agent-enqueue] Failed to enqueue for ${userId}`, error);
      return false;
    }

    console.log(`[agent-enqueue] Enqueued ${jobType} for user ${userId}`);
    return true;
  }

  // 7. Check if campaign_watch should be enqueued (for users with active campaigns)
  const { data: activeCampaigns } = await supabase
    .from("ad_campaigns")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "ACTIVE"])
    .limit(1);

  if (activeCampaigns && activeCampaigns.length > 0) {
    const lastCampaignWatch = lastJob?.job_type === "campaign_watch" ? lastJobTime : null;
    const hoursSinceCampaignWatch = lastCampaignWatch
      ? (now.getTime() - lastCampaignWatch.getTime()) / (1000 * 60 * 60)
      : 999;

    let shouldWatchCampaigns = false;
    switch (mode) {
      case "light":
        shouldWatchCampaigns = hoursSinceCampaignWatch >= 24;
        break;
      case "moderate":
        shouldWatchCampaigns = hoursSinceCampaignWatch >= 24;
        break;
      case "full":
        shouldWatchCampaigns = hoursSinceCampaignWatch >= 4;
        break;
    }

    if (shouldWatchCampaigns) {
      const { error } = await supabase.from("ghoste_agent_jobs").insert({
        user_id: userId,
        job_type: "campaign_watch",
        status: "queued",
        run_at: new Date().toISOString(),
        context: { mode, has_active_campaigns: true },
      });

      if (!error) {
        console.log(`[agent-enqueue] Enqueued campaign_watch for user ${userId}`);
        return true;
      }
    }
  }

  return false;
}

export { handler };
