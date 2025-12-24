/**
 * Verify 2FA SMS Code
 * Checks submitted code against stored code
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { userId, code } = JSON.parse(event.body || "{}");

    if (!userId || !code) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing userId or code" }),
      };
    }

    // Get user profile with stored code
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("two_factor_code, two_factor_code_expires_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    // Check if code exists and hasn't expired
    if (!profile.two_factor_code || !profile.two_factor_code_expires_at) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No code found or code expired" }),
      };
    }

    const expiresAt = new Date(profile.two_factor_code_expires_at);
    const now = new Date();

    if (now > expiresAt) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Code expired" }),
      };
    }

    // Verify code
    if (code !== profile.two_factor_code) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid code" }),
      };
    }

    // Clear the code
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        two_factor_code: null,
        two_factor_code_expires_at: null,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("[verify-2fa-code] DB update error:", updateError);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("[verify-2fa-code] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};
