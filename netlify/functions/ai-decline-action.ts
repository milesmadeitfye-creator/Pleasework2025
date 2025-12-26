import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  const decision_id = event.queryStringParameters?.decision_id;

  if (!decision_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: "decision_id required" }),
    };
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: approval, error } = await supabase
      .from('ai_manager_approvals')
      .select('*')
      .eq('id', decision_id)
      .single();

    if (error || !approval) {
      return {
        statusCode: 404,
        body: JSON.stringify({ ok: false, error: "Approval not found" }),
      };
    }

    if (approval.response !== 'pending') {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Already responded", response: approval.response }),
      };
    }

    await supabase
      .from('ai_manager_approvals')
      .update({
        response: 'no',
        response_received_at: new Date().toISOString(),
        approved_via: 'web_link',
      })
      .eq('id', decision_id);

    console.log('[ai-decline-action] ✅ Declined:', decision_id);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Declined</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0A0F29; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .card { background: linear-gradient(135deg, #1a1f3a 0%, #0d1124 100%); border: 1px solid #2a3f5f; border-radius: 16px; padding: 40px; text-align: center; max-width: 500px; }
            h1 { margin: 0 0 16px 0; font-size: 32px; }
            p { color: #9ca3af; margin: 0 0 24px 0; line-height: 1.6; }
            .icon { font-size: 64px; margin-bottom: 16px; }
            a { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
            a:hover { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🚫</div>
            <h1>No Thanks</h1>
            <p>Action declined. Your campaign will continue running as-is.</p>
            <a href="/dashboard">Go to Dashboard</a>
          </div>
        </body>
        </html>
      `,
    };
  } catch (e: any) {
    console.error("[ai-decline-action] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "decline_error" }),
    };
  }
};
