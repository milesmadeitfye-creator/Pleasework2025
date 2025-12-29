/**
 * SMS Subscribe
 *
 * Subscribes a user to SMS communications via Mailchimp or other provider.
 * Placeholder until Mailchimp SMS is fully configured.
 *
 * COMPLIANCE:
 * - Only subscribes users who have explicitly opted in
 * - Mobile opt-in data will NOT be shared with third parties
 * - Users can opt out by replying STOP
 */

import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

interface SubscribeRequest {
  user_id?: string;
}

const handler: Handler = async (event) => {
  console.log('[SMSSubscribe] Request received');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Supabase configuration missing' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get user ID from request or auth header
    let userId: string | null = null;

    if (event.body) {
      try {
        const body: SubscribeRequest = JSON.parse(event.body);
        userId = body.user_id || null;
      } catch {
        // Continue, try to get from auth
      }
    }

    // If no user_id in body, try to get from auth header
    if (!userId) {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
          return {
            statusCode: 401,
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        userId = user.id;
      }
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'user_id required' }),
      };
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('phone_e164, sms_opt_in, email')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[SMSSubscribe] Error fetching profile:', profileError);
      throw new Error('Failed to fetch user profile');
    }

    if (!profile) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User profile not found' }),
      };
    }

    // Check if user has opted in and has phone number
    if (!profile.sms_opt_in) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'User has not opted into SMS communications',
          message: 'SMS opt-in required before subscribing',
        }),
      };
    }

    if (!profile.phone_e164) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Phone number required',
          message: 'User must have a phone number to subscribe to SMS',
        }),
      };
    }

    console.log('[SMSSubscribe] User eligible for SMS subscription:', {
      userId,
      phone: profile.phone_e164,
      email: profile.email,
    });

    // PLACEHOLDER: Subscribe to Mailchimp SMS or other provider
    // When Mailchimp SMS is configured, add the API integration here
    // For now, log the subscription attempt

    const mailchimpApiKey = process.env.MAILCHIMP_API_KEY;
    const mailchimpServerPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
    const mailchimpSmsAudienceId = process.env.MAILCHIMP_SMS_AUDIENCE_ID;

    if (mailchimpApiKey && mailchimpServerPrefix && mailchimpSmsAudienceId) {
      try {
        // TODO: Implement Mailchimp SMS subscription
        // const mailchimpClient = ...
        // await mailchimpClient.lists.addListMember(...)

        console.log('[SMSSubscribe] Mailchimp SMS subscription placeholder - would subscribe:', {
          phone: profile.phone_e164,
          email: profile.email,
          audienceId: mailchimpSmsAudienceId,
        });

        // For now, just log success
        console.log('[SMSSubscribe] Mailchimp SMS subscription successful (placeholder)');
      } catch (mailchimpError: any) {
        console.error('[SMSSubscribe] Mailchimp SMS error:', mailchimpError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to subscribe to SMS provider',
            details: mailchimpError.message,
          }),
        };
      }
    } else {
      console.log('[SMSSubscribe] Mailchimp SMS not configured - skipping provider subscription');
    }

    // Log subscription event
    try {
      await supabase
        .from('automation_events')
        .insert({
          user_id: userId,
          event_key: 'sms_subscribed',
          payload: {
            phone: profile.phone_e164,
            source: 'sms-subscribe-function',
          },
        });
    } catch (eventError) {
      console.error('[SMSSubscribe] Error logging event:', eventError);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'SMS subscription processed',
        phone: profile.phone_e164,
        mailchimpConfigured: !!(mailchimpApiKey && mailchimpServerPrefix && mailchimpSmsAudienceId),
      }),
    };

  } catch (error: any) {
    console.error('[SMSSubscribe] Fatal error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Fatal error',
      }),
    };
  }
};

export { handler };
