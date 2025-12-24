import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { renderGhosteEmail, replaceTemplateVars } from './_emailTemplate';
import { EMAIL_AUTOMATION_STEPS, EmailTemplate } from './_emailAutomationConfig';
import { generateEmailCopy } from './_ghosteAiServerClient';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Ghoste One <noreply@ghoste.one>';

const SITE_URL = process.env.URL || process.env.VITE_SITE_URL || 'https://ghoste.one';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  plan: string | null;
  created_at: string;
  last_login_at: string | null;
}

/**
 * Check if email has already been sent to this user
 */
async function hasEmailBeenSent(
  supabase: any,
  userId: string,
  emailKey: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('email_automation_log')
      .select('id')
      .eq('user_id', userId)
      .eq('email_key', emailKey)
      .maybeSingle();

    if (error) {
      console.error('[hasEmailBeenSent] Error:', error);
      return false;
    }

    return !!data;
  } catch (err: any) {
    console.error('[hasEmailBeenSent] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Record that email was sent to this user
 */
async function recordEmailSent(
  supabase: any,
  userId: string,
  emailKey: string,
  meta?: any
): Promise<void> {
  try {
    const { error } = await supabase.from('email_automation_log').insert({
      user_id: userId,
      email_key: emailKey,
      meta: meta ?? null,
    });

    if (error) {
      console.error('[recordEmailSent] Error:', error);
    }
  } catch (err: any) {
    console.error('[recordEmailSent] Exception:', err?.message || err);
  }
}

/**
 * Check if user has created a smart link
 */
async function hasSmartLink(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('oneclick_links')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('[hasSmartLink] Error:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (err: any) {
    console.error('[hasSmartLink] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Check if user has used Ghoste AI
 */
async function hasUsedAI(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ghoste_conversations')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('[hasUsedAI] Error:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (err: any) {
    console.error('[hasUsedAI] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Check if user has connected calendar
 */
async function hasCalendarConnected(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_calendar_settings')
      .select('id')
      .eq('user_id', userId)
      .eq('calendar_connected', true)
      .limit(1);

    if (error) {
      console.error('[hasCalendarConnected] Error:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (err: any) {
    console.error('[hasCalendarConnected] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Check if user has created an ad campaign
 */
async function hasAdCampaign(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('meta_ad_campaigns')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('[hasAdCampaign] Error:', error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch (err: any) {
    console.error('[hasAdCampaign] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Check if behavior trigger is satisfied for this user
 */
async function behaviorSatisfied(
  supabase: any,
  user: UserProfile,
  step: EmailTemplate
): Promise<boolean> {
  const now = Date.now();
  const createdAt = new Date(user.created_at).getTime();
  const hoursSinceSignup = (now - createdAt) / (1000 * 60 * 60);
  const daysSinceSignup = hoursSinceSignup / 24;

  const lastLogin = user.last_login_at ? new Date(user.last_login_at).getTime() : createdAt;
  const daysSinceLogin = (now - lastLogin) / (1000 * 60 * 60 * 24);

  const isFreeUser = !user.plan || user.plan === 'free';

  try {
    // Handle new simple day-based triggers from GHOSTE_ONBOARDING_EMAILS
    if (step.behaviorTrigger.startsWith('days_since_signup_')) {
      const requiredDays = parseInt(step.behaviorTrigger.replace('days_since_signup_', ''));
      return daysSinceSignup >= requiredDays;
    }

    // Legacy behavior triggers (kept for backward compatibility)
    switch (step.behaviorTrigger) {
      case 'signup_completed':
        return true;

      case 'no_smart_link_after_24h':
        return daysSinceSignup >= 1 && !(await hasSmartLink(supabase, user.id));

      case 'no_ai_usage_after_48h':
        return daysSinceSignup >= 2 && !(await hasUsedAI(supabase, user.id));

      case 'no_calendar_after_72h':
        return daysSinceSignup >= 3 && !(await hasCalendarConnected(supabase, user.id));

      case 'no_ad_campaign_after_4d':
        return daysSinceSignup >= 4 && !(await hasAdCampaign(supabase, user.id));

      case 'user_active_6d':
        return daysSinceSignup >= 6;

      case 'free_plan_7d':
      case 'free_plan_9d':
      case 'free_plan_14d':
      case 'free_plan_15d':
      case 'free_plan_17d':
      case 'free_plan_19d':
      case 'free_plan_23d':
      case 'free_plan_25d':
      case 'free_plan_26d':
      case 'free_plan_28d':
      case 'free_plan_29d':
      case 'free_plan_30d':
        const daysRequired = parseInt(step.behaviorTrigger.match(/\d+/)?.[0] || '0');
        return isFreeUser && daysSinceSignup >= daysRequired;

      case 'has_smart_link_10d':
        return daysSinceSignup >= 10 && (await hasSmartLink(supabase, user.id));

      case 'has_ai_usage_12d':
        return daysSinceSignup >= 12 && (await hasUsedAI(supabase, user.id));

      case 'low_ai_credits_21d':
        return daysSinceSignup >= 21 && isFreeUser;

      case 'no_login_14d':
        return daysSinceLogin >= 14;

      // Legacy triggers (keep for backward compatibility)
      case 'free_user_no_upgrade_5d':
        return daysSinceSignup >= 5 && isFreeUser;

      case 'no_ad_campaign_after_7d':
        return daysSinceSignup >= 7 && !(await hasAdCampaign(supabase, user.id));

      default:
        console.warn('[behaviorSatisfied] Unknown trigger:', step.behaviorTrigger);
        return false;
    }
  } catch (err: any) {
    console.error('[behaviorSatisfied] Exception:', err?.message || err);
    return false;
  }
}

/**
 * Check if enough time has passed since trigger
 */
function delayPassed(triggerTime: number, delayMinutes: number): boolean {
  const now = Date.now();
  const delayMs = delayMinutes * 60 * 1000;
  return now - triggerTime >= delayMs;
}

/**
 * Send email via Mailgun
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<void> {
  try {
    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      console.warn('[sendEmail] Mailgun not configured, skipping email');
      return;
    }

    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    const messageData: any = {
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      text: params.body,
    };

    if (params.html) {
      messageData.html = params.html;
    }

    await mg.messages.create(MAILGUN_DOMAIN, messageData);

    console.log('[sendEmail] Email sent to:', params.to);
  } catch (error: any) {
    console.error('[sendEmail] Error:', error?.message || error);
    throw error;
  }
}

/**
 * Process automated email steps for all users
 */
async function processAutomationSteps(
  supabase: any
): Promise<{ processed: number; sent: number; skipped: number; errors: number }> {
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get all users with their profiles
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, first_name, plan, created_at, last_login_at')
      .not('email', 'is', null);

    if (usersError) {
      console.error('[processAutomationSteps] Error fetching users:', usersError);
      return { processed, sent, skipped, errors: 1 };
    }

    console.log('[processAutomationSteps] Found', users?.length || 0, 'users');

    for (const user of users || []) {
      processed++;

      try {
        const triggerTime = new Date(user.created_at).getTime();

        // Check each automation step
        for (const step of EMAIL_AUTOMATION_STEPS) {
          try {
            // 1. Check if already sent
            if (await hasEmailBeenSent(supabase, user.id, step.key)) {
              continue;
            }

            // 2. Check if behavior trigger is satisfied
            if (!(await behaviorSatisfied(supabase, user, step))) {
              continue;
            }

            // 3. Check if delay has passed
            if (!delayPassed(triggerTime, step.delayMinutes)) {
              continue;
            }

            // This user should receive this email!
            console.log(
              `[processAutomationSteps] Sending ${step.key} to ${user.email}`
            );

            const firstName = user.first_name || user.full_name?.split(' ')[0] || 'there';

            // Template variables for replacement
            const templateVars = {
              first_name: firstName,
              site_url: SITE_URL,
            };

            // Try to generate AI copy
            let subject = '';
            let bodyText = '';

            const aiCopy = await generateEmailCopy({
              userId: user.id,
              step,
              userContext: {
                first_name: firstName,
                email: user.email,
                plan: user.plan || 'free',
              },
            });

            if (aiCopy?.subject && aiCopy?.body) {
              // Use AI-generated copy
              subject = aiCopy.subject;
              bodyText = aiCopy.body;
              console.log('[processAutomationSteps] Using AI-generated copy');
            } else {
              // Use fallback copy with variable replacement
              subject = replaceTemplateVars(step.fallbackSubject, templateVars);
              bodyText = replaceTemplateVars(step.fallbackBody, templateVars);
              console.log('[processAutomationSteps] Using fallback copy');
            }

            // Build CTA URL if step has one
            const ctaUrl = step.ctaUrlPath ? `${SITE_URL}${step.ctaUrlPath}` : undefined;
            const ctaLabel = ctaUrl ? 'Open Ghoste One' : undefined;

            // Wrap in Ghoste branded email template
            const html = renderGhosteEmail({
              subject,
              bodyText,
              ctaLabel,
              ctaUrl,
            });

            // Send email
            await sendEmail({
              to: user.email,
              subject,
              body: bodyText,
              html,
            });

            // Record that we sent this email (with offer tracking for Stripe)
            await recordEmailSent(supabase, user.id, step.key, {
              phase: step.phase,
              trigger: step.behaviorTrigger,
              delay_minutes: step.delayMinutes,
              offer_tag: step.offerTag ?? null,
              stripe_coupon_code: step.stripeCouponCode ?? null,
            });

            sent++;
            console.log(`[processAutomationSteps] Sent ${step.key} to ${user.email}`);
          } catch (stepError: any) {
            console.error(
              `[processAutomationSteps] Error processing step ${step.key} for user ${user.email}:`,
              stepError
            );
            errors++;
          }
        }
      } catch (userError: any) {
        console.error(
          `[processAutomationSteps] Error processing user ${user.email}:`,
          userError
        );
        errors++;
      }
    }
  } catch (err: any) {
    console.error('[processAutomationSteps] Fatal error:', err);
    errors++;
  }

  return { processed, sent, skipped, errors };
}

/**
 * Process onboarding sequences (legacy system - kept for backward compatibility)
 */
async function processOnboardingSequences(
  supabase: any
): Promise<{ processed: number; sent: number; errors: number }> {
  let processed = 0;
  let sent = 0;
  let errors = 0;

  try {
    const now = new Date();

    const { data: dueSteps, error } = await supabase
      .from('user_email_sequences')
      .select(`
        id,
        user_id,
        sequence_id,
        current_step,
        last_sent_at,
        user_profiles!inner(email, full_name),
        email_sequences!inner(
          name,
          email_sequence_steps!inner(step_order, subject, body_html, delay_hours)
        )
      `)
      .eq('active', true)
      .is('completed_at', null);

    if (error) {
      console.error('[processOnboardingSequences] Query error:', error);
      return { processed, sent, errors: 1 };
    }

    console.log('[processOnboardingSequences] Found', dueSteps?.length || 0, 'active sequences');

    for (const userSeq of dueSteps || []) {
      processed++;

      try {
        const steps = userSeq.email_sequences?.email_sequence_steps || [];
        const nextStep = steps.find((s: any) => s.step_order === userSeq.current_step + 1);

        if (!nextStep) {
          await supabase
            .from('user_email_sequences')
            .update({ completed_at: now.toISOString(), active: false })
            .eq('id', userSeq.id);
          continue;
        }

        const lastSent = userSeq.last_sent_at ? new Date(userSeq.last_sent_at) : null;
        const delayMs = nextStep.delay_hours * 60 * 60 * 1000;

        if (lastSent && now.getTime() - lastSent.getTime() < delayMs) {
          continue;
        }

        const userEmail = userSeq.user_profiles?.email;
        const userName = userSeq.user_profiles?.full_name || 'there';

        if (!userEmail) {
          console.warn('[processOnboardingSequences] Missing email for user:', userSeq.user_id);
          errors++;
          continue;
        }

        const bodyHtml = nextStep.body_html.replace(/\{userName\}/g, userName);
        const html = renderGhosteServiceEmail({
          headline: nextStep.subject,
          bodyHtml,
          ctaLabel: 'Open Ghoste One',
          ctaUrl: `${SITE_URL}/dashboard`,
          managePrefsUrl: `${SITE_URL}/settings`,
          unsubscribeUrl: `${SITE_URL}/unsubscribe`,
          firstName: userName,
        });
        const plainText = nextStep.body_html.replace(/<[^>]*>/g, '').replace(/\{userName\}/g, userName);

        await sendEmail({
          to: userEmail,
          subject: nextStep.subject,
          body: plainText,
          html,
        });

        await supabase
          .from('user_email_sequences')
          .update({
            current_step: nextStep.step_order,
            last_sent_at: now.toISOString(),
          })
          .eq('id', userSeq.id);

        sent++;
        console.log('[processOnboardingSequences] Sent step', nextStep.step_order, 'to:', userEmail);
      } catch (stepError: any) {
        console.error('[processOnboardingSequences] Error processing sequence:', stepError);
        errors++;
      }
    }
  } catch (err: any) {
    console.error('[processOnboardingSequences] Fatal error:', err);
    errors++;
  }

  return { processed, sent, errors };
}

export const handler: Handler = async () => {
  console.log('[EMAIL_FLOW_ENGINE] Starting email flow engine');

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      console.error('[EMAIL_FLOW_ENGINE] Missing Supabase configuration');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Supabase configuration' }),
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // Process new automation steps (idempotent, behavior-based)
    const automationResults = await processAutomationSteps(supabase);
    console.log('[EMAIL_FLOW_ENGINE] Automation steps:', automationResults);

    // Process legacy onboarding sequences (for backward compatibility)
    const onboardingResults = await processOnboardingSequences(supabase);
    console.log('[EMAIL_FLOW_ENGINE] Onboarding sequences:', onboardingResults);

    const summary = {
      success: true,
      automation: automationResults,
      onboarding: onboardingResults,
      total_sent: automationResults.sent + onboardingResults.sent,
      total_errors: automationResults.errors + onboardingResults.errors,
    };

    console.log('[EMAIL_FLOW_ENGINE] Completed:', summary);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summary),
    };
  } catch (error: any) {
    console.error('[EMAIL_FLOW_ENGINE] Fatal error:', error?.message || error);
    console.error('[EMAIL_FLOW_ENGINE] Stack:', error?.stack);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Email flow engine failed' }),
    };
  }
};
