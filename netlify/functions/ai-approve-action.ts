import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import { logBudgetChange, validateBudgetSafety } from "./_aiManagerStrictEngine";

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

    const now = new Date().toISOString();
    const expired = new Date(approval.expires_at) < new Date();

    if (expired) {
      await supabase
        .from('ai_manager_approvals')
        .update({ response: 'no', response_received_at: now })
        .eq('id', decision_id);

      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Approval expired" }),
      };
    }

    await supabase
      .from('ai_manager_approvals')
      .update({
        response: 'yes',
        response_received_at: now,
        approved_via: 'web_link',
      })
      .eq('id', decision_id);

    const { action_requested, action_context, campaign_id, owner_user_id } = approval;

    if (action_requested === 'spend_more' || action_requested === 'spend_less') {
      const new_budget_cents = action_context.recommended_budget;

      if (!new_budget_cents) {
        throw new Error('No recommended budget in context');
      }

      const { data: campaign } = await supabase
        .from('ghoste_campaigns')
        .select('daily_budget_cents')
        .eq('id', campaign_id)
        .single();

      const old_budget_cents = campaign?.daily_budget_cents || 0;

      const safety = await validateBudgetSafety(campaign_id, old_budget_cents, new_budget_cents);

      if (!safety.safe) {
        console.error('[ai-approve-action] Safety check failed:', safety.warnings);
        return {
          statusCode: 400,
          body: JSON.stringify({ ok: false, error: "Safety check failed", warnings: safety.warnings }),
        };
      }

      await supabase
        .from('ghoste_campaigns')
        .update({ daily_budget_cents: new_budget_cents })
        .eq('id', campaign_id);

      await logBudgetChange(
        owner_user_id,
        campaign_id,
        action_requested,
        old_budget_cents,
        new_budget_cents,
        decision_id,
        'user_approval'
      );

      await supabase
        .from('ai_manager_approvals')
        .update({
          action_executed: true,
          action_executed_at: now,
          execution_details: { new_budget_cents, safety_warnings: safety.warnings },
        })
        .eq('id', decision_id);

      console.log('[ai-approve-action] ✅ Budget updated:', campaign_id, `${old_budget_cents} → ${new_budget_cents}`);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Approved</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; background: #0A0F29; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .card { background: linear-gradient(135deg, #1a1f3a 0%, #0d1124 100%); border: 1px solid #2a3f5f; border-radius: 16px; padding: 40px; text-align: center; max-width: 500px; }
            h1 { margin: 0 0 16px 0; font-size: 32px; }
            p { color: #9ca3af; margin: 0 0 24px 0; line-height: 1.6; }
            .check { font-size: 64px; margin-bottom: 16px; }
            a { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 16px; }
            a:hover { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="check">✅</div>
            <h1>Approved</h1>
            <p>Your action has been approved and executed. Check your dashboard for updates.</p>
            <a href="/dashboard">Go to Dashboard</a>
          </div>
        </body>
        </html>
      `,
    };
  } catch (e: any) {
    console.error("[ai-approve-action] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "approval_error" }),
    };
  }
};
