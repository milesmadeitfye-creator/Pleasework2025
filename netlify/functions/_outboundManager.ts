import { getSupabaseAdmin } from "./_supabaseAdmin";
import { createNotification } from "../../src/server/notifications";

/**
 * Outbound Manager - Send manager messages via multiple channels
 *
 * Channels:
 * - in_app: Always enabled (writes to ghoste_agent_messages + notifications)
 * - email: Mailchimp Transactional (placeholder)
 * - sms: Twilio or Mailchimp SMS (placeholder)
 *
 * TODO: Wire Mailchimp Transactional or Marketing API
 * TODO: Wire SMS provider (Twilio or Mailchimp SMS)
 * TODO: Respect opt-in & quiet hours
 */

type SendMessageParams = {
  user_id: string;
  job_id?: string;
  channel: "in_app" | "email" | "sms";
  title: string;
  body: string;
  ctas?: Array<{ label: string; link: string; action: string }>;
  priority?: "low" | "normal" | "high";
  tokens_cost?: number;
};

export async function sendManagerMessage(params: SendMessageParams) {
  const {
    user_id,
    job_id,
    channel,
    title,
    body,
    ctas = [],
    priority = "normal",
    tokens_cost = 6,
  } = params;

  const supabase = getSupabaseAdmin();

  try {
    // Always write to in_app
    const { data: message, error: messageError } = await supabase
      .from("ghoste_agent_messages")
      .insert({
        user_id,
        job_id: job_id || null,
        channel: "in_app",
        title,
        body,
        ctas,
        priority,
        tokens_cost,
      })
      .select("id")
      .single();

    if (messageError || !message) {
      console.error("[sendManagerMessage] Failed to create message", messageError);
      throw new Error("Failed to create message");
    }

    // Create notification (triggers realtime + toast)
    await createNotification({
      userId: user_id,
      type: "system",
      title,
      message: body,
      data: { ctas, priority, source: "ghoste_manager" },
    });

    // Check user preferences for additional channels
    const { data: settings } = await supabase
      .from("manager_settings")
      .select("mailchimp_enabled, sms_enabled, quiet_hours")
      .eq("user_id", user_id)
      .maybeSingle();

    // TODO: Check quiet hours before sending
    const isQuietHours = false; // Implement quiet hours check

    if (!isQuietHours) {
      // Email via Mailchimp (placeholder)
      if (channel === "email" || settings?.mailchimp_enabled) {
        await sendMailchimpEmail({ user_id, title, body, ctas });
      }

      // SMS (placeholder)
      if (channel === "sms" || settings?.sms_enabled) {
        await sendSms({ user_id, body });
      }
    }

    return { ok: true, message_id: message.id };
  } catch (err) {
    console.error("[sendManagerMessage] error", err);
    throw err;
  }
}

/**
 * PLACEHOLDER: Send email via Mailchimp Transactional
 *
 * TODO: Implement Mailchimp Transactional API
 * - Get user email from profile
 * - Use Mailchimp template for manager messages
 * - Track delivery status
 */
async function sendMailchimpEmail(params: {
  user_id: string;
  title: string;
  body: string;
  ctas: any[];
}) {
  console.log("[sendMailchimpEmail] PLACEHOLDER - would send email", params);
  // TODO: Implement Mailchimp Transactional API
  // const mailchimp = getMailchimpClient();
  // await mailchimp.messages.send({
  //   message: {
  //     subject: params.title,
  //     html: buildEmailTemplate(params),
  //     to: [{ email: userEmail }],
  //   },
  // });
}

/**
 * PLACEHOLDER: Send SMS via Twilio or Mailchimp SMS
 *
 * TODO: Implement SMS provider
 * - Get user phone from profile (if opted in)
 * - Use SMS-friendly formatting
 * - Track delivery status
 * - Respect SMS opt-in/opt-out
 */
async function sendSms(params: { user_id: string; body: string }) {
  console.log("[sendSms] PLACEHOLDER - would send SMS", params);
  // TODO: Implement SMS provider (Twilio or Mailchimp SMS)
  // const twilio = getTwilioClient();
  // await twilio.messages.create({
  //   body: params.body,
  //   to: userPhone,
  //   from: TWILIO_NUMBER,
  // });
}
