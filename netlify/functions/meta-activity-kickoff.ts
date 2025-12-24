import type { Handler } from "@netlify/functions";

/**
 * One-time kickoff function to immediately start Meta API activity tracking.
 *
 * This function calls the real scheduled pinger so activity starts immediately
 * after deploy instead of waiting for the first 30-minute cron run.
 *
 * IMPORTANT: Remove the scheduled cron for this function from netlify.toml
 * after confirming the tracker shows activity.
 */
export const handler: Handler = async () => {
  try {
    const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://ghoste.one";

    const res = await fetch(
      `${baseUrl}/.netlify/functions/meta-activity-pinger`,
      { method: "GET" }
    );

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    console.log("[meta-activity-kickoff] Successfully called pinger:", json);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        kicked: true,
        timestamp: new Date().toISOString(),
        metaResponse: json,
        message: "Meta activity pinger called successfully. Check Overview page for results.",
      }),
    };
  } catch (e: any) {
    console.error("[meta-activity-kickoff] Error:", e);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: e?.message || "Kickoff failed",
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
