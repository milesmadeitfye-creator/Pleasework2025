import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { createNotification } from "../../src/server/notifications";

function renderTemplate(template: string, context: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, "g"), String(value ?? ""));
  }
  return result;
}

const handler: Handler = async (event) => {
  try {
    const supabase = getSupabaseAdmin();

    // Fetch all due enrollments
    const { data: enrollments, error: fetchError } = await supabase
      .from("notification_enrollments")
      .select("*")
      .eq("is_active", true)
      .lte("next_run_at", new Date().toISOString())
      .limit(100);

    if (fetchError) {
      console.error("[notifications-scheduler] fetch error", fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to fetch enrollments" }),
      };
    }

    if (!enrollments || enrollments.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, processed: 0 }),
      };
    }

    let processed = 0;
    let errors = 0;

    for (const enrollment of enrollments) {
      try {
        // Load next step
        const nextStepOrder = enrollment.current_step + 1;

        const { data: step } = await supabase
          .from("notification_sequence_steps")
          .select("*")
          .eq("sequence_id", enrollment.sequence_id)
          .eq("step_order", nextStepOrder)
          .maybeSingle();

        if (!step) {
          // No more steps, deactivate enrollment
          await supabase
            .from("notification_enrollments")
            .update({ is_active: false })
            .eq("id", enrollment.id);

          processed++;
          continue;
        }

        // Render templates
        const context = enrollment.context || {};
        const title = renderTemplate(step.title_template, context);
        const body = step.body_template ? renderTemplate(step.body_template, context) : "";
        const link = step.link_template ? renderTemplate(step.link_template, context) : null;

        // Create notification
        await createNotification({
          userId: enrollment.user_id,
          type: step.type as any,
          title,
          message: body,
          data: { ...context, ...(step.data_template || {}) },
        });

        // Calculate next run time
        const nextRunAt = new Date();
        nextRunAt.setMinutes(nextRunAt.getMinutes() + (step.delay_minutes || 0));

        // Update enrollment
        await supabase
          .from("notification_enrollments")
          .update({
            current_step: nextStepOrder,
            next_run_at: nextRunAt.toISOString(),
          })
          .eq("id", enrollment.id);

        processed++;
      } catch (err) {
        console.error("[notifications-scheduler] process error", err);
        errors++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, processed, errors }),
    };
  } catch (err: any) {
    console.error("[notifications-scheduler] error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
