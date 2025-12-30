/**
 * Email Decider Scheduler - Hourly
 *
 * Runs every hour to call the run_email_decider() RPC function.
 * This ensures email automations beyond welcome emails get queued.
 */

import { schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface DeciderResult {
  users_processed: number;
  jobs_created: number;
}

async function runEmailDecider(): Promise<DeciderResult> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[EmailDeciderScheduler] Calling run_email_decider RPC');

    const { data, error } = await supabase.rpc('run_email_decider');

    if (error) {
      console.error('[EmailDeciderScheduler] RPC error:', error);
      return {
        users_processed: 0,
        jobs_created: 0,
      };
    }

    const result: DeciderResult = data || {
      users_processed: 0,
      jobs_created: 0,
    };

    console.log(`[EmailDeciderScheduler] Result: ${result.users_processed} users processed, ${result.jobs_created} jobs created`);

    return result;
  } catch (error: any) {
    console.error('[EmailDeciderScheduler] Unexpected error:', error);
    return {
      users_processed: 0,
      jobs_created: 0,
    };
  }
}

export const handler = schedule('0 * * * *', async () => {
  console.log('[EmailDeciderScheduler] Hourly run started');

  const result = await runEmailDecider();

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    }),
  };
});

export const config = {
  schedule: '0 * * * *', // Every hour at minute 0
};
