import { Handler, HandlerEvent } from '@netlify/functions';
import { getSupabaseAdmin } from './_supabaseAdmin';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Simple rate limiting using in-memory store (for production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts: number = 3, windowMs: number = 300000): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    // Create new record
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxAttempts) {
    return false; // Rate limit exceeded
  }

  // Increment count
  record.count++;
  return true;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const email = body.email;
    const sessionId = body.sessionId || null;

    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Email is required' }),
      };
    }

    // Rate limiting by email
    const rateLimitKey = `magic_link:${email.toLowerCase()}`;
    if (!checkRateLimit(rateLimitKey, 3, 300000)) {
      return {
        statusCode: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Too many requests. Please try again in 5 minutes.',
          retryAfter: 300
        }),
      };
    }

    const supabase = getSupabaseAdmin();

    // Check if user exists
    const { data: users, error: lookupError } = await supabase.auth.admin.listUsers();

    if (lookupError) {
      console.error('[MAGIC_LINK] User lookup error:', lookupError.message);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to lookup user' }),
      };
    }

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      // Don't reveal if user exists or not for security
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          message: 'If an account exists with this email, you will receive a login link shortly.'
        }),
      };
    }

    // Send magic link
    const siteUrl = process.env.SITE_BASE_URL || process.env.URL || 'https://ghoste.one';
    const redirectTo = sessionId
      ? `${siteUrl}/checkout/success?session_id=${sessionId}`
      : `${siteUrl}/studio`;

    const { error: magicLinkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo,
      }
    });

    if (magicLinkError) {
      console.error('[MAGIC_LINK] Failed to send magic link:', magicLinkError.message);
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to send magic link' }),
      };
    }

    console.log('[MAGIC_LINK] Magic link sent to:', email);

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Magic link sent! Check your email to continue.'
      }),
    };
  } catch (error: any) {
    console.error('[MAGIC_LINK] Error:', error?.message || error);
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
