/**
 * Email Credit Checker
 * Scheduled function that checks all users' credit levels
 * and triggers appropriate sales emails
 *
 * Runs: Every 6 hours via Netlify scheduled functions
 *
 * Checks:
 * - Credit usage percentage (50%, 90%, 100%)
 * - Only sends each email once per user
 * - Respects user email state to prevent duplicates
 */

import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const handler = schedule('0 */6 * * *', async (event) => {
  console.log('[email-credit-checker] Starting credit check at:', new Date().toISOString());

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });

    // Call the RPC function to check and send emails
    const { error } = await supabase.rpc('check_and_send_credit_emails');

    if (error) {
      console.error('[email-credit-checker] RPC error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Credit check failed' }),
      };
    }

    console.log('[email-credit-checker] Credit check complete');

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Credit check complete' }),
    };
  } catch (error: any) {
    console.error('[email-credit-checker] Fatal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Credit check failed' }),
    };
  }
});

export { handler };
