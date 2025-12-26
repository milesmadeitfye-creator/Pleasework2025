/**
 * Email Sales Trigger
 * Triggers sales emails based on user behavior
 *
 * Triggers:
 * - credit_warning: User hit 50%, 90%, or 100% credit usage
 * - feature_locked: User attempted to use a locked feature
 * - subscription_event: Upgrade, downgrade, or payment issue
 *
 * Called by:
 * - Credit spending functions
 * - Feature gate components
 * - Stripe webhooks
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.URL || 'https://ghoste.one';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
  },
});

export const handler: Handler = async (event) => {
  console.log('[email-sales-trigger] Received trigger');

  try {
    const { userId, userEmail, triggerType, metadata } = JSON.parse(event.body || '{}');

    if (!userId || !userEmail || !triggerType) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required parameters' }),
      };
    }

    let templateKey: string;
    let triggerKey: string;

    // Map trigger type to email template
    switch (triggerType) {
      case 'credit_warning_50':
        triggerKey = 'credits_50';
        templateKey = 'credits_halfway';
        break;

      case 'credit_warning_90':
        triggerKey = 'credits_90';
        templateKey = 'credits_running_low';
        break;

      case 'credit_warning_100':
        triggerKey = 'credits_100';
        templateKey = 'credits_exhausted';
        break;

      case 'feature_locked':
        triggerKey = `feature_${metadata?.featureKey || 'unknown'}`;
        templateKey = 'feature_locked';
        break;

      default:
        console.warn('[email-sales-trigger] Unknown trigger type:', triggerType);
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Unknown trigger type' }),
        };
    }

    // Enqueue sales email (checks for duplicates internally)
    const { data, error } = await supabase.rpc('enqueue_sales_email', {
      p_user_id: userId,
      p_user_email: userEmail,
      p_trigger_key: triggerKey,
      p_template_key: templateKey,
    });

    if (error) {
      console.error('[email-sales-trigger] Failed to enqueue:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to trigger email' }),
      };
    }

    if (!data) {
      console.log('[email-sales-trigger] Email already sent for this trigger, skipping');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          sent: false,
          reason: 'Already sent',
        }),
      };
    }

    console.log(`[email-sales-trigger] Triggered ${templateKey} for ${userEmail}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        sent: true,
        jobId: data,
      }),
    };
  } catch (error: any) {
    console.error('[email-sales-trigger] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Trigger failed' }),
    };
  }
};
