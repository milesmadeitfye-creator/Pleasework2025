/**
 * Frontend SMS Helper
 *
 * Sends SMS via Twilio Netlify function.
 * Credits should be spent BEFORE calling this.
 */

import { supabase } from '../../lib/supabase';

export type SendSmsPayload = {
  toNumbers: string[];
  message: string;
};

export type SendSmsResult = {
  success: boolean;
  count: number;
  results: Array<{ to: string; sid: string }>;
  errors?: Array<{ to: string; error: string }>;
  summary: {
    total: number;
    sent: number;
    failed: number;
  };
};

export async function sendSms({ toNumbers, message }: SendSmsPayload): Promise<SendSmsResult> {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Authentication required to send SMS");
  }

  const res = await fetch("/.netlify/functions/twilio-send-sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ toNumbers, message }),
  });

  const data = await res.json();

  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to send SMS");
  }

  return data;
}
