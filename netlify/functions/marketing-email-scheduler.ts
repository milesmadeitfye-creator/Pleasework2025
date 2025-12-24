import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

// IMPORTANT: import your existing automation config/step builder
import { getMarketingAutomationStep } from "./_marketingAutomationConfig";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function json(statusCode: number, body: any) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function sendMailgunEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tags?: string[];
  v?: Record<string, string>;
}) {
  const domain = process.env.MAILGUN_DOMAIN!;
  const apiKey = process.env.MAILGUN_API_KEY!;
  const from = process.env.MAILGUN_FROM || process.env.FROM_EMAIL || "Ghoste One <noreply@ghoste.one>";

  const form = new URLSearchParams();
  form.set("from", from);
  form.set("to", params.to);
  form.set("subject", params.subject);
  form.set("html", params.html);
  if (params.text) form.set("text", params.text);

  // ✅ Make sure Mailgun tracks opens/clicks
  form.set("o:tracking", "yes");
  form.set("o:tracking-clicks", "yes");
  form.set("o:tracking-opens", "yes");

  // Tags help find activity in Mailgun logs
  (params.tags || []).forEach(t => form.append("o:tag", t));

  // Variables (optional)
  if (params.v) {
    for (const [k, v] of Object.entries(params.v)) {
      form.set(`v:${k}`, v);
    }
  }

  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const txt = await res.text();
  let data: any;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!res.ok) {
    throw new Error(data?.message || data?.raw || "Mailgun send failed");
  }

  return data; // includes id like "<2025...@domain>"
}

export const handler: Handler = async () => {
  try {
    const now = new Date().toISOString();

    const { data: due, error } = await supabase
      .from("marketing_email_enrollments")
      .select("*")
      .eq("status", "active")
      .lte("next_run_at", now)
      .limit(50);

    if (error) return json(500, { error: error.message });

    let sent = 0;
    let failed = 0;

    for (const enr of due || []) {
      const nextStep = (enr.current_step || 0) + 1;

      // Pull the existing step from your flow (adapter)
      const step = getMarketingAutomationStep(enr.sequence_key, nextStep, enr.context || {});
      if (!step) {
        // No more steps: complete
        await supabase
          .from("marketing_email_enrollments")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", enr.id);
        continue;
      }

      try {
        const mg = await sendMailgunEmail({
          to: enr.email,
          subject: step.subject,
          html: step.html,
          text: step.text,
          tags: ["marketing-automation", enr.sequence_key, `step-${nextStep}`],
          v: {
            user_id: enr.user_id,
            sequence_key: enr.sequence_key,
            step: String(nextStep),
          },
        });

        sent++;

        const msgId = (mg?.id || "").replace(/[<>]/g, "");

        // Log send
        await supabase.from("marketing_email_sends").insert({
          user_id: enr.user_id,
          email: enr.email,
          sequence_key: enr.sequence_key,
          step: nextStep,
          subject: step.subject,
          mailgun_message_id: msgId || null,
          status: "sent",
          meta: { mailgun: mg }
        });

        // Advance schedule (do NOT change flow; just use step.delay_minutes)
        const delayMin = Number(step.delay_minutes || 0);
        const nextRun = new Date(Date.now() + delayMin * 60_000).toISOString();

        await supabase
          .from("marketing_email_enrollments")
          .update({
            current_step: nextStep,
            next_run_at: nextRun,
            updated_at: new Date().toISOString()
          })
          .eq("id", enr.id);
      } catch (e: any) {
        failed++;

        await supabase.from("marketing_email_sends").insert({
          user_id: enr.user_id,
          email: enr.email,
          sequence_key: enr.sequence_key,
          step: nextStep,
          subject: step?.subject || null,
          status: "failed",
          error: e?.message || "Send failed",
          meta: {}
        });

        // Backoff 60 minutes on failures to avoid spam + high error rate
        const backoff = new Date(Date.now() + 60 * 60_000).toISOString();
        await supabase
          .from("marketing_email_enrollments")
          .update({ next_run_at: backoff, updated_at: new Date().toISOString() })
          .eq("id", enr.id);
      }
    }

    return json(200, { ok: true, sent, failed });
  } catch (e: any) {
    return json(500, { error: e?.message || "Unknown error" });
  }
};
