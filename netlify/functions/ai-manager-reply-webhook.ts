import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  const supabase = getSupabaseAdmin();

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { From, Body } = body;

    if (!From || !Body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "missing_from_or_body" }),
      };
    }

    const replyText = Body.trim().toLowerCase();

    const isYes = ['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'do it'].some(
      keyword => replyText.includes(keyword)
    );
    const isNo = ['no', 'n', 'nope', 'nah', 'stop', 'cancel'].some(
      keyword => replyText.includes(keyword)
    );

    if (!isYes && !isNo) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: 'Reply not recognized as YES or NO' }),
      };
    }

    const { data: pendingApprovals } = await supabase
      .from('ai_manager_approvals')
      .select('*')
      .eq('notification_phone', From)
      .eq('response', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (!pendingApprovals || pendingApprovals.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, message: 'No pending approval found' }),
      };
    }

    const approval = pendingApprovals[0];
    const response = isYes ? 'yes' : 'no';

    await supabase
      .from('ai_manager_approvals')
      .update({
        response,
        response_received_at: new Date().toISOString(),
        response_raw: Body,
      })
      .eq('id', approval.id);

    console.log('[ai-manager-reply-webhook] ✅ Response recorded:', approval.id, response);

    if (isYes) {
      const { action_requested, action_context, campaign_id, owner_user_id } = approval;

      if (action_requested === 'spend_more') {
        const newBudget = action_context.recommended_budget;

        if (newBudget) {
          await supabase
            .from('ghoste_campaigns')
            .update({ daily_budget_cents: Math.round(newBudget * 100) })
            .eq('id', campaign_id);

          await supabase
            .from('ai_manager_approvals')
            .update({
              action_executed: true,
              action_executed_at: new Date().toISOString(),
              execution_details: { new_budget_cents: Math.round(newBudget * 100) },
            })
            .eq('id', approval.id);

          console.log('[ai-manager-reply-webhook] ✅ Budget increased:', campaign_id, newBudget);
        }
      } else if (action_requested === 'spend_less') {
        const newBudget = action_context.recommended_budget;

        if (newBudget) {
          await supabase
            .from('ghoste_campaigns')
            .update({ daily_budget_cents: Math.round(newBudget * 100) })
            .eq('id', campaign_id);

          await supabase
            .from('ai_manager_approvals')
            .update({
              action_executed: true,
              action_executed_at: new Date().toISOString(),
              execution_details: { new_budget_cents: Math.round(newBudget * 100) },
            })
            .eq('id', approval.id);

          console.log('[ai-manager-reply-webhook] ✅ Budget decreased:', campaign_id, newBudget);
        }
      }
    } else {
      console.log('[ai-manager-reply-webhook] ℹ️ User declined:', approval.id);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, response_recorded: response }),
    };
  } catch (e: any) {
    console.error("[ai-manager-reply-webhook] Error:", e.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message || "webhook_error" }),
    };
  }
};
