import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { createNotification } from "../../src/server/notifications";

type TriggerKey = "daily_tasks" | "stats_ready" | "product_updates";

// Map trigger keys to sequence names
const TRIGGER_TO_SEQUENCE: Record<TriggerKey, string> = {
  daily_tasks: "Daily Tasks",
  stats_ready: "Stats Ready",
  product_updates: "Product Updates",
};

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { user_id, trigger_key, context = {}, immediate = false } = body;

    if (!user_id || !trigger_key) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "user_id and trigger_key required" }),
      };
    }

    const supabase = getSupabaseAdmin();

    // If immediate, just create notification directly
    if (immediate) {
      const { title, message, type = "generic", link } = body;

      if (!title) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "title required for immediate notification" }),
        };
      }

      await createNotification({
        userId: user_id,
        type: type as any,
        title,
        message: message || "",
        data: context,
      });

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ok: true, immediate: true }),
      };
    }

    // Find sequence by trigger key
    const sequenceName = TRIGGER_TO_SEQUENCE[trigger_key as TriggerKey];
    if (!sequenceName) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: `Unknown trigger_key: ${trigger_key}` }),
      };
    }

    const { data: sequence } = await supabase
      .from("notification_sequences")
      .select("id, is_enabled")
      .eq("name", sequenceName)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!sequence) {
      console.warn(`[notifications-trigger] No enabled sequence for ${sequenceName}`);
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ok: true, skipped: true, reason: "sequence_not_found" }),
      };
    }

    // Check if already enrolled
    const { data: existing } = await supabase
      .from("notification_enrollments")
      .select("id")
      .eq("user_id", user_id)
      .eq("sequence_id", sequence.id)
      .eq("trigger_key", trigger_key)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ok: true, skipped: true, reason: "already_enrolled" }),
      };
    }

    // Enroll user
    const { error: enrollError } = await supabase
      .from("notification_enrollments")
      .insert({
        user_id,
        sequence_id: sequence.id,
        trigger_key,
        context,
        current_step: 0,
        next_run_at: new Date().toISOString(),
        is_active: true,
      });

    if (enrollError) {
      console.error("[notifications-trigger] enroll error", enrollError);
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Failed to enroll in sequence" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ok: true, enrolled: true, sequence: sequenceName }),
    };
  } catch (err: any) {
    console.error("[notifications-trigger] error", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
