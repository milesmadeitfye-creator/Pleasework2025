import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { buildAgentContext } from "./_agentContext";
import { sendManagerMessage } from "./_outboundManager";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Self-Prompting Runner - Execute Agent Jobs
 *
 * Runs every 5 minutes
 *
 * Process:
 * 1. Pull due jobs (status=queued, run_at<=now)
 * 2. Build context via _agentContext
 * 3. Call LLM with manager system prompt
 * 4. Parse output (title, body, ctas, followups)
 * 5. Send message via _outboundManager
 * 6. Debit tokens from manager budget
 * 7. Create follow-up jobs if specified
 * 8. Mark job done/failed
 */

const MANAGER_SYSTEM_PROMPT = `You are Ghoste AI, the user's full music manager.

Your job: maximize growth, consistency, and revenue.

You must produce:
- One primary recommendation
- A 3-step plan the user can execute today
- Any alerts (broken posts, rejected ads, missing pixels, budget low, tasks overdue)
- CTAs with links to the right app pages
- Proposed actions (for ads, tasks, etc.) that require user approval

Keep it short, direct, "manager voice".

Output format:
{
  "title": "short title (max 50 chars)",
  "body": "main message (max 300 chars)",
  "priority": "low|normal|high",
  "ctas": [
    {"label":"Open Tasks","link":"/calendar","action":"open_tasks"}
  ],
  "actions": [
    {
      "domain": "ads",
      "action_type": "create_campaign",
      "title": "Launch $10/day Spotify growth campaign",
      "entity_id": null,
      "payload": {
        "platform": "meta",
        "objective": "traffic",
        "daily_budget_cents": 1000,
        "creative_brief": "15s vertical teaser + CTA to Smart Link",
        "targeting": {"geo":["US"],"age":[18,34]},
        "tracking": {"pixel_id":"...","event":"ViewContent"},
        "destination_url": "https://..."
      }
    }
  ],
  "followups": [
    {"job_type":"tasks_nudge","delay_minutes":240}
  ]
}

Action types:
- create_campaign: Create new ad campaign (draft only for now)
- pause_campaign: Pause underperforming campaign
- update_budget: Adjust campaign budget
- refresh_performance: Pull latest metrics

Be direct. Focus on actionable items. Use artist_name when addressing user.`;

const handler: Handler = async (event) => {
  try {
    const supabase = getSupabaseAdmin();

    // Pull due jobs
    const { data: jobs, error: jobsError } = await supabase
      .from("ghoste_agent_jobs")
      .select("*")
      .eq("status", "queued")
      .lte("run_at", new Date().toISOString())
      .limit(20);

    if (jobsError || !jobs || jobs.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, processed: 0, message: "No due jobs" }),
      };
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const job of jobs) {
      try {
        const result = await processJob(job);
        if (result === "success") processed++;
        else if (result === "skipped") skipped++;
        else failed++;
      } catch (err) {
        console.error(`[agent-runner] Job ${job.id} failed`, err);
        failed++;

        // Mark job as failed
        await supabase
          .from("ghoste_agent_jobs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, processed, failed, skipped }),
    };
  } catch (err: any) {
    console.error("[agent-runner] error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

async function processJob(job: any): Promise<"success" | "failed" | "skipped"> {
  const supabase = getSupabaseAdmin();

  // Mark as running
  await supabase
    .from("ghoste_agent_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", job.id);

  // 1. Check budget
  const { data: wallet } = await supabase
    .from("wallets")
    .select("manager_budget_tokens")
    .eq("user_id", job.user_id)
    .maybeSingle();

  const { data: settings } = await supabase
    .from("manager_settings")
    .select("tokens_per_message")
    .eq("user_id", job.user_id)
    .maybeSingle();

  const tokensPerMessage = settings?.tokens_per_message || 6;
  const budgetTokens = wallet?.manager_budget_tokens || 0;

  if (budgetTokens < tokensPerMessage) {
    console.log(`[agent-runner] Job ${job.id} skipped - insufficient budget`);
    await supabase
      .from("ghoste_agent_jobs")
      .update({
        status: "skipped",
        error: "Insufficient manager budget tokens",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return "skipped";
  }

  // 2. Build context
  const context = await buildAgentContext(job.user_id);

  // 3. Call LLM
  const contextString = JSON.stringify(context, null, 2);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: MANAGER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Context:\n${contextString}\n\nJob type: ${job.job_type}\n\nGenerate manager message.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const rawOutput = completion.choices[0]?.message?.content || "{}";

  // Parse JSON output
  let output: any;
  try {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/) || rawOutput.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawOutput;
    output = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[agent-runner] Failed to parse LLM output", rawOutput);
    throw new Error("Failed to parse LLM output");
  }

  // 4. Send message
  await sendManagerMessage({
    user_id: job.user_id,
    job_id: job.id,
    channel: "in_app",
    title: output.title || "Manager Update",
    body: output.body || "Check your dashboard for updates.",
    ctas: output.ctas || [],
    priority: output.priority || "normal",
    tokens_cost: tokensPerMessage,
  });

  // 5. Debit tokens
  await supabase.rpc("wallet_spend", {
    p_user_id: job.user_id,
    p_amount: tokensPerMessage,
    p_category: "manager_message",
    p_metadata: { job_id: job.id },
  });

  // Also update manager_budget_tokens directly
  await supabase
    .from("wallets")
    .update({
      manager_budget_tokens: budgetTokens - tokensPerMessage,
    })
    .eq("user_id", job.user_id);

  // Record in token ledger
  await supabase.from("token_ledger").insert({
    user_id: job.user_id,
    kind: "debit",
    source: "ai_message",
    amount: tokensPerMessage,
    metadata: { job_id: job.id, message_title: output.title },
  });

  // 5b. Create AI actions if proposed
  if (output.actions && Array.isArray(output.actions) && output.actions.length > 0) {
    const actionsToInsert = output.actions.map((action: any) => ({
      user_id: job.user_id,
      domain: action.domain || "ads",
      entity_id: action.entity_id || null,
      action_type: action.action_type,
      title: action.title,
      payload: action.payload || {},
      status: "proposed",
    }));

    const { error: actionsError } = await supabase
      .from("ai_actions")
      .insert(actionsToInsert);

    if (actionsError) {
      console.error("[agent-runner] Failed to insert actions", actionsError);
    } else {
      console.log(`[agent-runner] Created ${actionsToInsert.length} AI actions for user ${job.user_id}`);
    }
  }

  // 6. Create follow-up jobs
  if (output.followups && Array.isArray(output.followups)) {
    for (const followup of output.followups) {
      const runAt = new Date();
      runAt.setMinutes(runAt.getMinutes() + (followup.delay_minutes || 60));

      await supabase.from("ghoste_agent_jobs").insert({
        user_id: job.user_id,
        job_type: followup.job_type || "checkin",
        status: "queued",
        run_at: runAt.toISOString(),
        context: { parent_job_id: job.id },
      });
    }
  }

  // 7. Mark job done
  await supabase
    .from("ghoste_agent_jobs")
    .update({
      status: "done",
      result: output,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return "success";
}

export { handler };
