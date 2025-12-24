import type { Handler } from "@netlify/functions";

/**
 * Test function to manually trigger notifications for testing
 * Access: POST /.netlify/functions/notifications-test
 */

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { user_id, test_type = "daily_tasks" } = body;

    if (!user_id) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "user_id required",
          usage: {
            method: "POST",
            body: {
              user_id: "your-user-id",
              test_type: "daily_tasks | stats_ready | product_updates | immediate",
            },
          },
        }),
      };
    }

    const baseUrl =
      process.env.VITE_FUNCTIONS_ORIGIN ||
      process.env.URL ||
      "https://ghoste.one";

    let triggerPayload: any;

    switch (test_type) {
      case "daily_tasks":
        triggerPayload = {
          user_id,
          trigger_key: "daily_tasks",
          context: {
            artist_name: "Test Artist",
          },
        };
        break;

      case "stats_ready":
        triggerPayload = {
          user_id,
          trigger_key: "stats_ready",
          context: {
            artist_name: "Test Artist",
            platform: "Spotify",
            date: new Date().toLocaleDateString(),
          },
        };
        break;

      case "product_updates":
        triggerPayload = {
          user_id,
          trigger_key: "product_updates",
          context: {
            version: "2.5.0-test",
            highlights: "Testing notification sequences",
          },
        };
        break;

      case "immediate":
        triggerPayload = {
          user_id,
          trigger_key: "test",
          immediate: true,
          title: "Test Notification",
          message: "This is a test notification sent immediately",
          type: "system",
        };
        break;

      default:
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: `Unknown test_type: ${test_type}`,
            valid_types: [
              "daily_tasks",
              "stats_ready",
              "product_updates",
              "immediate",
            ],
          }),
        };
    }

    // Call trigger function
    const triggerRes = await fetch(
      `${baseUrl}/.netlify/functions/notifications-trigger`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(triggerPayload),
      }
    );

    const triggerData = await triggerRes.json();

    if (!triggerRes.ok) {
      return {
        statusCode: triggerRes.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Trigger failed",
          details: triggerData,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        test_type,
        trigger_result: triggerData,
        message:
          test_type === "immediate"
            ? "Notification sent immediately"
            : "User enrolled in sequence. Check notifications now and again in 5+ minutes for next step.",
      }),
    };
  } catch (err: any) {
    console.error("[notifications-test] error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || "Internal error" }),
    };
  }
};

export { handler };
