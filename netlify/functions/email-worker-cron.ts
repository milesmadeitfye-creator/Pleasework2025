/**
 * Email Worker Cron
 *
 * Scheduled function that runs every 2 minutes to process email_jobs queue.
 * Calls the email-worker function to send pending emails.
 */

import { schedule } from '@netlify/functions';

const handler = schedule('*/2 * * * *', async () => {
  console.log('[EmailWorkerCron] Running scheduled email worker');

  try {
    // Call the email-worker function
    const response = await fetch('/.netlify/functions/email-worker', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    console.log('[EmailWorkerCron] Worker completed:', result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        worker_result: result,
      }),
    };
  } catch (error: any) {
    console.error('[EmailWorkerCron] Error calling worker:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
});

export { handler };
