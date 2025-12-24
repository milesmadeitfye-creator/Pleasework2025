import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  const isProd = process.env.NODE_ENV === "production";

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      env: {
        NODE_ENV: process.env.NODE_ENV || null,
        SUPABASE_URL_present: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        OPENAI_API_KEY_present: !!process.env.OPENAI_API_KEY,
        STRIPE_SECRET_KEY_present: !!process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET_present: !!process.env.STRIPE_WEBHOOK_SECRET,
      },
      runtime: {
        node_version: process.version,
      },
      meta: {
        message: "deploy-debug function is live",
        isProd,
      }
    })
  };
};
