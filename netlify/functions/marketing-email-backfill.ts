import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function json(statusCode: number, body: any) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const handler: Handler = async () => {
  try {
    // Pull recent users from profiles table
    const { data: users, error: uErr } = await supabase
      .from("profiles")
      .select("id,email,created_at")
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (uErr) return json(500, { error: `profiles query failed: ${uErr.message}` });

    let enrolled = 0;
    let skipped = 0;

    for (const u of users || []) {
      // Check if already enrolled
      const { data: existing } = await supabase
        .from("marketing_email_enrollments")
        .select("id")
        .eq("user_id", u.id)
        .eq("sequence_key", "marketing_onboarding")
        .maybeSingle();

      if (existing?.id) {
        skipped++;
        continue;
      }

      // Create enrollment and set due immediately
      const { error: insErr } = await supabase
        .from("marketing_email_enrollments")
        .insert({
          user_id: u.id,
          email: u.email,
          sequence_key: "marketing_onboarding",
          status: "active",
          current_step: 0,
          next_run_at: new Date().toISOString(),
          context: {}
        });

      if (!insErr) enrolled++;
    }

    return json(200, { ok: true, enrolled, skipped });
  } catch (e: any) {
    return json(500, { error: e?.message || "Unknown error" });
  }
};
