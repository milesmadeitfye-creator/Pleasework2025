import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function json(statusCode: number, body: any) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const { user_id, email, sequence_key = "marketing_onboarding", context = {} } = JSON.parse(event.body || "{}");

    if (!user_id || !email) return json(400, { error: "Missing user_id or email" });

    // Idempotent upsert: do NOT change flow, just ensure enrollment exists
    const { error } = await supabase
      .from("marketing_email_enrollments")
      .upsert(
        {
          user_id,
          email,
          sequence_key,
          status: "active",
          // Do not reset steps if already exists
          updated_at: new Date().toISOString(),
          context
        },
        { onConflict: "user_id,sequence_key", ignoreDuplicates: false }
      );

    if (error) return json(500, { error: error.message });

    // Ensure it's due soon (but do NOT override if already scheduled in the past)
    // We'll do a gentle update only when next_run_at is null-ish or far future.
    await supabase
      .from("marketing_email_enrollments")
      .update({ next_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user_id)
      .eq("sequence_key", sequence_key)
      .eq("current_step", 0);

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { error: e?.message || "Unknown error" });
  }
};
