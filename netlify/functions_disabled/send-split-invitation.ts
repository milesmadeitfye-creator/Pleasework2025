import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";

export const handler: Handler = async (event) => {
  const supabase = getSupabaseAdmin();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const { negotiationId } = JSON.parse(event.body || "{}");

    if (!negotiationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "negotiationId is required" }),
      };
    }

    // Verify ownership of negotiation
    const { data: negotiation, error: negError } = await supabase
      .from('split_negotiations')
      .select('*')
      .eq('id', negotiationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (negError || !negotiation) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Not authorized to send invites for this negotiation' }),
      };
    }

    // Fetch all participants with pending or countered status
    const { data: participants, error: participantsError } = await supabase
      .from("split_participants")
      .select("*")
      .eq('negotiation_id', negotiationId)
      .in('status', ['pending', 'countered']);

    if (participantsError) {
      console.error('[send-split-invitation] Error fetching participants:', participantsError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: participantsError.message }),
      };
    }

    if (!participants || participants.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No participants to invite',
          sent: 0,
        }),
      };
    }

    // Generate invite URLs and prepare emails
    const baseUrl = process.env.URL || "https://ghoste.one";
    const sent: any[] = [];

    for (const participant of participants) {
      const inviteUrl = `${baseUrl}/splits/respond?token=${participant.invite_token}`;

      // Update invited_at timestamp
      await supabase
        .from('split_participants')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', participant.id);

      // Generate email HTML
      const emailHtml = generateInviteEmail(
        participant,
        negotiation,
        inviteUrl
      );

      // TODO: Integrate with your existing email service
      // For now, just log and return the data
      console.log(`[send-split-invitation] Would send email to ${participant.email}`);
      console.log(`Invite URL: ${inviteUrl}`);

      sent.push({
        participantId: participant.id,
        email: participant.email,
        inviteUrl,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sent: sent.length,
        invites: sent,
      }),
    };
  } catch (err: any) {
    console.error("[send-split-invitation] error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};

function generateInviteEmail(participant: any, negotiation: any, inviteUrl: string): string {
  const projectTitle = negotiation.project_title || negotiation.project_name;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Split Sheet Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; border: 1px solid #2a2a2a; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);">

          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%); border-radius: 16px 16px 0 0;">
              <div style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #3b82f6 0%, #9333ea 100%); border-radius: 50px; margin-bottom: 24px; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);">
                <span style="font-size: 40px;">📄</span>
              </div>
              <h1 style="margin: 0 0 12px 0; font-size: 32px; font-weight: bold; background: linear-gradient(135deg, #3b82f6 0%, #9333ea 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                GHOSTE SPLIT SHEET
              </h1>
              <p style="margin: 0; font-size: 16px; color: #9ca3af;">
                ${projectTitle}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px; color: #d1d5db;">
              <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #ffffff; font-weight: 600;">
                Hi ${participant.name},
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #9ca3af;">
                You've been invited to review and respond to a split sheet for <strong style="color: #ffffff;">${projectTitle}</strong>.
              </p>

              <div style="margin: 32px 0; padding: 24px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 12px;">
                <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: bold; color: #3b82f6;">
                  Your Proposed Split
                </h2>

                <div style="display: grid; gap: 12px;">
                  <div style="padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 8px;">
                    <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">Role</div>
                    <div style="font-size: 16px; color: #ffffff; font-weight: 600;">${participant.role}</div>
                  </div>

                  <div style="padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 8px;">
                    <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">Master Rights</div>
                    <div style="font-size: 20px; color: #10b981; font-weight: bold;">${participant.master_share || participant.master_percentage || 0}%</div>
                  </div>

                  <div style="padding: 12px; background: rgba(0, 0, 0, 0.3); border-radius: 8px;">
                    <div style="font-size: 12px; color: #9ca3af; margin-bottom: 4px;">Publishing Rights</div>
                    <div style="font-size: 20px; color: #3b82f6; font-weight: bold;">${participant.publishing_share || participant.publishing_percentage || 0}%</div>
                  </div>
                </div>
              </div>

              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #9ca3af;">
                Click the button below to review the full split sheet. You can accept the terms, counter with different percentages, or decline.
              </p>

              <table role="presentation" style="margin: 40px 0 30px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 18px 48px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);">
                      Review & Respond
                    </a>
                  </td>
                </tr>
              </table>

              <div style="margin: 30px 0 0 0; padding: 24px; background: rgba(168, 85, 247, 0.05); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 8px;">
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #a855f7; font-weight: 600;">
                  📋 Important Notes
                </p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                  <li>No login required - use the secure link above</li>
                  <li>Review all participants and percentages carefully</li>
                  <li>You can accept, counter, or decline</li>
                  <li>Once everyone accepts, a final PDF will be generated</li>
                </ul>
              </div>

              <p style="margin: 30px 0 0 0; font-size: 14px; color: #9ca3af; line-height: 1.6;">
                This invitation was sent via Ghoste, the all-in-one platform for music creators.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #2a2a2a;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                © ${new Date().getFullYear()} Ghoste. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #4b5563;">
                Smart tools for musicians and creators
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
