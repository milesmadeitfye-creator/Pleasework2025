import type { Handler } from '@netlify/functions';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { createClient } from '@supabase/supabase-js';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_LIST_ADDRESS = process.env.MAILGUN_LIST_ADDRESS || 'onboarding@mg.ghostemedia.com';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

/**
 * Logs sync attempt to database
 */
async function logSync({
  email,
  name,
  status,
  errorMessage,
  responseJson,
}: {
  email: string;
  name?: string;
  status: 'success' | 'error';
  errorMessage?: string;
  responseJson?: any;
}) {
  try {
    await supabase.from('mailgun_sync_logs').insert({
      user_id: null,
      email,
      name,
      action: 'test',
      status,
      error_message: errorMessage,
      response_json: responseJson,
    });
  } catch (logError: any) {
    console.error('[mailgun-sync-test] Failed to write log:', logError.message);
  }
}

export const handler: Handler = async (event) => {
  console.log('[mailgun-sync-test] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const email = event.queryStringParameters?.email;
    const name = event.queryStringParameters?.name;

    if (!email) {
      return jsonResponse(400, {
        success: false,
        error: 'MISSING_EMAIL',
        message: 'Email query parameter is required',
      });
    }

    console.log('[mailgun-sync-test] Testing sync for:', { email, name });

    // Check for required environment variables
    if (!MAILGUN_API_KEY) {
      const errorMsg = 'Missing MAILGUN_API_KEY environment variable';
      await logSync({ email, name, status: 'error', errorMessage: errorMsg });
      return jsonResponse(500, {
        success: false,
        error: 'MISSING_ENV_VAR',
        message: errorMsg,
        details: {
          MAILGUN_API_KEY: 'missing',
          MAILGUN_DOMAIN: MAILGUN_DOMAIN ? 'set' : 'missing',
          MAILGUN_LIST_ADDRESS: MAILGUN_LIST_ADDRESS ? 'set' : 'missing (using default)',
        },
      });
    }

    if (!MAILGUN_DOMAIN) {
      const errorMsg = 'Missing MAILGUN_DOMAIN environment variable';
      await logSync({ email, name, status: 'error', errorMessage: errorMsg });
      return jsonResponse(500, {
        success: false,
        error: 'MISSING_ENV_VAR',
        message: errorMsg,
        details: {
          MAILGUN_API_KEY: 'set',
          MAILGUN_DOMAIN: 'missing',
          MAILGUN_LIST_ADDRESS: MAILGUN_LIST_ADDRESS ? 'set' : 'missing (using default)',
        },
      });
    }

    if (!MAILGUN_LIST_ADDRESS) {
      const errorMsg = 'Missing MAILGUN_LIST_ADDRESS environment variable';
      await logSync({ email, name, status: 'error', errorMessage: errorMsg });
      return jsonResponse(500, {
        success: false,
        error: 'MISSING_ENV_VAR',
        message: errorMsg,
        details: {
          MAILGUN_API_KEY: 'set',
          MAILGUN_DOMAIN: 'set',
          MAILGUN_LIST_ADDRESS: 'missing',
        },
      });
    }

    // Try to sync to Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: MAILGUN_API_KEY });

    const memberData: any = {
      address: email,
      subscribed: true,
      upsert: true,
    };

    if (name) {
      memberData.name = name;
    }

    memberData.vars = JSON.stringify({
      user_id: 'test',
      synced_at: new Date().toISOString(),
      action: 'test',
    });

    console.log('[mailgun-sync-test] Attempting to add member to list:', MAILGUN_LIST_ADDRESS);

    const response = await mg.lists.members.createMember(MAILGUN_LIST_ADDRESS, memberData);

    console.log('[mailgun-sync-test] Success!', response);

    // Log success
    await logSync({
      email,
      name,
      status: 'success',
      responseJson: response,
    });

    return jsonResponse(200, {
      success: true,
      message: `Successfully synced ${email} to Mailgun list`,
      details: {
        list: MAILGUN_LIST_ADDRESS,
        email,
        name: name || 'not provided',
        response,
      },
    });
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    console.error('[mailgun-sync-test] Error:', errorMessage);
    console.error('[mailgun-sync-test] Stack:', error.stack);
    console.error('[mailgun-sync-test] Full error:', JSON.stringify(error, null, 2));

    const email = event.queryStringParameters?.email || 'unknown';
    const name = event.queryStringParameters?.name;

    // Log error
    await logSync({
      email,
      name,
      status: 'error',
      errorMessage,
      responseJson: {
        message: errorMessage,
        status: error.status,
        details: error.details,
        stack: error.stack,
      },
    });

    return jsonResponse(500, {
      success: false,
      error: 'MAILGUN_ERROR',
      message: errorMessage,
      details: {
        status: error.status,
        statusText: error.statusText,
        details: error.details,
      },
    });
  }
};

export default handler;
