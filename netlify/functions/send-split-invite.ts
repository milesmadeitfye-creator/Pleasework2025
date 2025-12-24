import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { mailgunClient } from './_mailgunClient';
import { renderGhosteServiceEmail } from '../../src/utils/serviceEmailTemplate';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'mg.ghostemedia.com';
const SITE_URL = process.env.URL || process.env.VITE_SITE_URL || 'https://ghoste.one';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[send-split-invite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    if (!event.body) {
      return jsonResponse(400, { error: 'Missing request body' });
    }

    const payload = JSON.parse(event.body);

    // Keep backward compatibility
    const splitId: string | undefined = payload.splitId || payload.split_id;
    const participantId: string | undefined = payload.participantId || payload.participant_id;
    const overrideEmail: string | undefined = payload.email;

    if (!participantId) {
      return jsonResponse(400, {
        success: false,
        error: 'Missing participantId',
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch participant
    const { data: participant, error: participantError } = await supabase
      .from('split_participants')
      .select('id, email, name, role, master_percent, pub_percent, invite_token, invite_status, negotiation_id')
      .eq('id', participantId)
      .maybeSingle();

    if (participantError || !participant) {
      console.error('[send-split-invite] Participant not found', participantError);
      return jsonResponse(404, {
        success: false,
        error: 'Participant not found',
      });
    }

    // Fetch split negotiation
    const { data: split, error: splitError } = await supabase
      .from('split_negotiations')
      .select(`
        id,
        title,
        project_name,
        beat_fee,
        public_token,
        user_profiles!split_negotiations_user_id_fkey(full_name)
      `)
      .eq('id', participant.negotiation_id)
      .maybeSingle();

    if (splitError || !split) {
      console.error('[send-split-invite] Split negotiation not found', splitError);
      return jsonResponse(404, {
        success: false,
        error: 'Split negotiation not found',
      });
    }

    const email = overrideEmail || participant.email;
    if (!email) {
      return jsonResponse(400, {
        success: false,
        error: 'Participant email missing',
      });
    }

    // Get public_token from split negotiation (should already exist from DB default)
    const publicToken = (split as any).public_token;
    if (!publicToken) {
      console.error('[send-split-invite] Split negotiation missing public_token');
      return jsonResponse(500, {
        success: false,
        error: 'Split negotiation missing public token',
      });
    }

    // Update participant status to pending
    await supabase
      .from('split_participants')
      .update({ invite_status: 'pending' })
      .eq('id', participant.id);

    // Use participant-specific invite token for unique invite URL
    const reviewUrl = `${SITE_URL}/splits/invite/${participant.invite_token}`;
    const ownerName = (split as any).user_profiles?.full_name || 'An artist';
    const splitTitle = split.title || split.project_name || 'Untitled Project';

    // Send email using Mailgun
    if (!mailgunClient) {
      console.error('[send-split-invite] Mailgun not configured');
      return jsonResponse(500, {
        success: false,
        error: 'Email service not configured',
      });
    }

    // Build split offer details as HTML
    const offerDetailsHtml = `
      <p style="margin-bottom:16px;">
        <strong>${ownerName}</strong> has invited you to review a split offer for
        <strong style="color:#38bdf8;">${splitTitle}</strong> on Ghoste.
      </p>
      <div style="background:#0f172a;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px 0;color:#94a3b8;font-weight:600;">Your Offer:</p>
        <p style="margin:4px 0;color:#e5e7eb;">• Role: ${participant.role || 'Participant'}</p>
        <p style="margin:4px 0;color:#e5e7eb;">• Master Rights: ${participant.master_percent ?? 0}%</p>
        <p style="margin:4px 0;color:#e5e7eb;">• Publishing Rights: ${participant.pub_percent ?? 0}%</p>
        ${split.beat_fee ? `<p style="margin:4px 0;color:#e5e7eb;">• Beat Fee: $${split.beat_fee}</p>` : ''}
      </div>
      <p style="margin-top:16px;">
        Click the button below to review and respond to your offer.
      </p>
    `;

    // Use Ghoste service email template (from splits@mg.ghostemedia.com)
    const emailHtml = renderGhosteServiceEmail({
      headline: 'You received a split offer',
      bodyHtml: offerDetailsHtml,
      ctaLabel: 'Review Offer',
      ctaUrl: reviewUrl,
      managePrefsUrl: `${SITE_URL}/account/notifications`,
      unsubscribeUrl: `${SITE_URL}/unsubscribe`,
      firstName: participant.name || null,
    });

    const emailText = `
Hi ${participant.name || 'there'},

${ownerName} has invited you to review a split offer for "${splitTitle}" on Ghoste.

Your Offer:
• Role: ${participant.role || 'Participant'}
• Master Rights: ${participant.master_percent ?? 0}%
• Publishing Rights: ${participant.pub_percent ?? 0}%
${split.beat_fee ? `• Beat Fee: $${split.beat_fee}` : ''}

Review and respond to your offer here:
${reviewUrl}

If you weren't expecting this email, you can safely ignore it.

– Ghoste
    `.trim();

    console.log('[send-split-invite] Sending email to', email);

    try {
      await mailgunClient.messages.create(MAILGUN_DOMAIN, {
        from: 'Ghoste Splits <splits@mg.ghostemedia.com>',
        to: [email],
        subject: `Ghoste Split Offer – "${splitTitle}"`,
        html: emailHtml,
        text: emailText,
      });

      console.log('[send-split-invite] Email sent successfully');
    } catch (emailError: any) {
      console.error('[send-split-invite] Failed to send email', emailError);
      return jsonResponse(502, {
        success: false,
        error: 'Failed to send email via Mailgun',
        details: emailError?.message || String(emailError),
      });
    }

    return jsonResponse(200, {
      success: true,
      message: 'Invite sent successfully',
    });
  } catch (err: any) {
    console.error('[send-split-invite] Unexpected error', err);
    return jsonResponse(500, {
      success: false,
      error: err?.message || 'Unknown error sending invite',
    });
  }
};

export default handler;
