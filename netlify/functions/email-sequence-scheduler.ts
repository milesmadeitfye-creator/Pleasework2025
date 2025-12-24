/**
 * Email Sequence Scheduler
 * Runs every hour to check and send scheduled onboarding emails
 *
 * Schedule:
 * - Welcome: Immediate (handled by post-auth trigger)
 * - Activation: 30 minutes after signup
 * - AI Intro: 24 hours after signup
 * - Reactivation: 3 days after signup (if not engaged)
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const FUNCTION_BASE_URL = process.env.URL || "https://ghoste.one";

export const handler: Handler = async () => {
  console.log("[email-sequence-scheduler] Starting email sequence check...");

  try {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Get users enrolled in email sequences
    const { data: enrollments, error } = await supabase
      .from("email_sequence_enrollments")
      .select(`
        *,
        user_profiles!inner(email)
      `)
      .eq("active", true);

    if (error) {
      console.error("[email-sequence-scheduler] Error fetching enrollments:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch enrollments" }),
      };
    }

    const results = {
      activation: 0,
      aiIntro: 0,
      reactivation: 0,
      errors: [] as string[],
    };

    for (const enrollment of enrollments || []) {
      const createdAt = new Date(enrollment.created_at);
      const userEmail = enrollment.user_profiles?.email;

      if (!userEmail) continue;

      try {
        // 30-minute activation email
        if (
          !enrollment.activation_sent &&
          createdAt <= thirtyMinutesAgo
        ) {
          await fetch(`${FUNCTION_BASE_URL}/.netlify/functions/email-activation-30min`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: userEmail,
              username: enrollment.username,
            }),
          });

          await supabase
            .from("email_sequence_enrollments")
            .update({ activation_sent: true, activation_sent_at: now.toISOString() })
            .eq("id", enrollment.id);

          results.activation++;
          console.log(`[email-sequence-scheduler] Sent activation to ${userEmail}`);
        }

        // 24-hour AI intro email
        if (
          !enrollment.ai_intro_sent &&
          createdAt <= twentyFourHoursAgo
        ) {
          await fetch(`${FUNCTION_BASE_URL}/.netlify/functions/email-ai-intro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: userEmail,
              username: enrollment.username,
            }),
          });

          await supabase
            .from("email_sequence_enrollments")
            .update({ ai_intro_sent: true, ai_intro_sent_at: now.toISOString() })
            .eq("id", enrollment.id);

          results.aiIntro++;
          console.log(`[email-sequence-scheduler] Sent AI intro to ${userEmail}`);
        }

        // 3-day reactivation email
        if (
          !enrollment.reactivation_sent &&
          createdAt <= threeDaysAgo
        ) {
          await fetch(`${FUNCTION_BASE_URL}/.netlify/functions/email-reactivation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: enrollment.user_id,
              email: userEmail,
              username: enrollment.username,
            }),
          });

          await supabase
            .from("email_sequence_enrollments")
            .update({
              reactivation_sent: true,
              reactivation_sent_at: now.toISOString(),
              active: false, // Sequence complete
              completed_at: now.toISOString(),
            })
            .eq("id", enrollment.id);

          results.reactivation++;
          console.log(`[email-sequence-scheduler] Sent reactivation to ${userEmail}`);
        }
      } catch (err: any) {
        console.error(`[email-sequence-scheduler] Error processing ${userEmail}:`, err);
        results.errors.push(`${userEmail}: ${err.message}`);
      }
    }

    console.log("[email-sequence-scheduler] Completed:", results);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        processed: enrollments?.length || 0,
        ...results,
      }),
    };
  } catch (err: any) {
    console.error("[email-sequence-scheduler] Fatal error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Scheduler failed" }),
    };
  }
};
