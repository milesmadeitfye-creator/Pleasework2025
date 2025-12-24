import type { Handler } from "@netlify/functions";
import { supabaseAdmin } from "./_supabaseAdmin";

const KEY_FROM_BOLT_PROMPT = "bfd91f88-9ef8-4b10-b93e-64ee43140ab2";
const IS_TEST_KEY = true;

const ADMIN_EMAILS = new Set<string>([
  "test@ghostemedia.com",
  "milesdorre5@gmail.com",
]);

async function getUserEmailFromAuthHeader(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const jwt = authHeader.slice("Bearer ".length);

  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error) return null;
  return data.user?.email ?? null;
}

export const handler: Handler = async (event) => {
  try {
    const email = await getUserEmailFromAuthHeader(event.headers.authorization);
    if (!email || !ADMIN_EMAILS.has(email)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Not authorized" })
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const apiKey = (body.apiKey && String(body.apiKey)) || KEY_FROM_BOLT_PROMPT;

    if (!apiKey || apiKey === "PASTE_SONGSTATS_KEY_HERE") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing Songstats key" })
      };
    }

    const isTest = typeof body.isTest === "boolean" ? body.isTest : IS_TEST_KEY;

    const { error } = await supabaseAdmin
      .from("integration_keys")
      .upsert(
        { provider: "songstats", api_key: apiKey, is_test: isTest },
        { onConflict: "provider" }
      );

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        provider: "songstats",
        is_test: isTest
      }),
    };
  } catch (e: any) {
    console.error("[songstats-set-key] Error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e?.message || "Server error" })
    };
  }
};
