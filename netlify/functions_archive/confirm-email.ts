import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * Confirm Email - Mark Supabase Auth User as Confirmed
 *
 * Updates auth.users.email_confirmed_at when user clicks Mailgun confirmation link.
 *
 * Environment variables required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[confirm-email] Missing Supabase configuration');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Supabase not configured' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const email = (body.email || '').trim();

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email required' }),
      };
    }

    console.log(`[confirm-email] Confirming email for: ${email}`);

    // Create Supabase admin client with service role key
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // First, get the user by email from auth.users
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('[confirm-email] Error listing users:', listError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to list users' }),
      };
    }

    // Find user by email
    const user = authUsers.users.find(u => u.email === email);

    if (!user) {
      console.log(`[confirm-email] User not found with email: ${email}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // Update user to mark email as confirmed
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        email_confirm: true,
      }
    );

    if (updateError) {
      console.error('[confirm-email] Update error:', updateError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to confirm email' }),
      };
    }

    console.log(`[confirm-email] ✅ Email confirmed for user: ${user.id} (${email})`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('[confirm-email] Unexpected error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
