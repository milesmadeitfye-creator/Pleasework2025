import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Handler, HandlerEvent } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "crypto";

export function createServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getUserIdFromRequest(
  event: HandlerEvent
): Promise<string | null> {
  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return null;
    }

    const supabase = createServiceSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return null;
    }

    return user.id;
  } catch (err) {
    console.error("getUserIdFromRequest error:", err);
    return null;
  }
}

export type MailchimpState = {
  userId: string;
  provider: "mailchimp";
  ts: number;
};

export function signMailchimpState(payload: MailchimpState): string {
  const secret = process.env.MAILCHIMP_SESSION_SECRET;
  if (!secret) {
    throw new Error("MAILCHIMP_SESSION_SECRET is missing");
  }

  const jsonStr = JSON.stringify(payload);
  const base64 = Buffer.from(jsonStr, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const hmac = createHmac("sha256", secret);
  hmac.update(base64);
  const signature = hmac.digest("hex");

  return `${base64}.${signature}`;
}

export function verifyMailchimpState(raw: string | null): MailchimpState | null {
  if (!raw) {
    return null;
  }

  const secret = process.env.MAILCHIMP_SESSION_SECRET;
  if (!secret) {
    throw new Error("MAILCHIMP_SESSION_SECRET is missing");
  }

  try {
    const parts = raw.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [base64, receivedSig] = parts;

    const hmac = createHmac("sha256", secret);
    hmac.update(base64);
    const expectedSig = hmac.digest("hex");

    const receivedBuf = Buffer.from(receivedSig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");

    if (receivedBuf.length !== expectedBuf.length) {
      return null;
    }

    if (!timingSafeEqual(receivedBuf, expectedBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(
      base64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");

    const payload = JSON.parse(jsonStr) as MailchimpState;

    if (
      typeof payload.userId !== "string" ||
      payload.provider !== "mailchimp" ||
      typeof payload.ts !== "number"
    ) {
      return null;
    }

    return payload;
  } catch (err) {
    console.error("verifyMailchimpState error:", err);
    return null;
  }
}
