import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

/**
 * One-time seeding function to create starter notification sequences
 * Call this manually after deployment to populate sequences
 */

const STARTER_SEQUENCES = [
  {
    name: "Daily Tasks",
    description: "Nudge users about their daily tasks",
    steps: [
      {
        step_order: 1,
        delay_minutes: 0,
        type: "ai_calendar",
        title_template: "New daily tasks are ready",
        body_template: "{{artist_name}}, your AI-powered daily tasks are waiting for you.",
        link_template: "/calendar",
      },
      {
        step_order: 2,
        delay_minutes: 240, // 4 hours later
        type: "ai_calendar",
        title_template: "Need a push?",
        body_template: "Don't forget to check off today's tasks!",
        link_template: "/calendar",
      },
    ],
  },
  {
    name: "Stats Ready",
    description: "Notify users when new stats are imported",
    steps: [
      {
        step_order: 1,
        delay_minutes: 0,
        type: "stats_update",
        title_template: "New {{platform}} stats are in",
        body_template: "{{artist_name}}, fresh data from {{platform}} just landed. Check out your latest numbers!",
        link_template: "/analytics",
      },
      {
        step_order: 2,
        delay_minutes: 60, // 1 hour later
        type: "stats_update",
        title_template: "Want Ghoste AI to recommend next move?",
        body_template: "Ask Ghoste AI what to do with your latest {{platform}} stats.",
        link_template: "/ghoste-ai",
      },
    ],
  },
  {
    name: "Product Updates",
    description: "Announce new features and updates",
    steps: [
      {
        step_order: 1,
        delay_minutes: 0,
        type: "system",
        title_template: "What's new in Ghoste One",
        body_template: "Version {{version}} is here! {{highlights}}",
        link_template: "/updates",
      },
    ],
  },
];

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    let created = 0;
    let skipped = 0;

    for (const seq of STARTER_SEQUENCES) {
      // Check if sequence already exists
      const { data: existing } = await supabase
        .from("notification_sequences")
        .select("id")
        .eq("name", seq.name)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Create sequence
      const { data: newSeq, error: seqError } = await supabase
        .from("notification_sequences")
        .insert({
          name: seq.name,
          description: seq.description,
          is_enabled: true,
        })
        .select("id")
        .single();

      if (seqError || !newSeq) {
        console.error(`[seed] Failed to create sequence ${seq.name}`, seqError);
        continue;
      }

      // Create steps
      const steps = seq.steps.map((step) => ({
        sequence_id: newSeq.id,
        ...step,
      }));

      const { error: stepsError } = await supabase
        .from("notification_sequence_steps")
        .insert(steps);

      if (stepsError) {
        console.error(`[seed] Failed to create steps for ${seq.name}`, stepsError);
        continue;
      }

      created++;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        created,
        skipped,
        message: `Created ${created} sequences, skipped ${skipped} existing`,
      }),
    };
  } catch (err: any) {
    console.error("[notifications-seed-sequences] error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
