import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * Apple Music Developer Token Generator
 *
 * Generates JWT tokens for Apple Music API access using ES256 signing
 * Tokens are cached in memory for 30 minutes to reduce signing overhead
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function getAdminSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const handler: Handler = async (event) => {
  console.log('[apple-music-token] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now) {
      console.log('[apple-music-token] Returning cached token');
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          token: cachedToken.token,
          expiresAt: cachedToken.expiresAt,
        }),
      };
    }

    const token = await generateAppleMusicToken();
    const expiresAt = now + (30 * 24 * 60 * 60 * 1000);

    cachedToken = { token, expiresAt };

    console.log('[apple-music-token] Generated new token');

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ token, expiresAt }),
    };
  } catch (error: any) {
    console.error('[apple-music-token] Error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'TOKEN_GENERATION_FAILED',
        message: error.message || 'Failed to generate Apple Music token',
      }),
    };
  }
};

async function generateAppleMusicToken(): Promise<string> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from('app_secrets')
    .select('key, value')
    .in('key', ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY_P8']);

  if (error) {
    throw new Error(`Failed to fetch Apple credentials: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Apple Music credentials not configured');
  }

  const secrets: Record<string, string> = {};
  data.forEach(row => {
    secrets[row.key] = row.value;
  });

  const teamId = secrets.APPLE_TEAM_ID;
  const keyId = secrets.APPLE_KEY_ID;
  let privateKey = secrets.APPLE_PRIVATE_KEY_P8;

  if (!teamId || !keyId || !privateKey) {
    throw new Error('Missing required Apple Music credentials');
  }

  if (!privateKey.includes('-----BEGIN')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }

  const jwt = await signJWT(
    {
      alg: 'ES256',
      kid: keyId,
    },
    {
      iss: teamId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
    },
    privateKey
  );

  return jwt;
}

async function signJWT(
  header: { alg: string; kid: string },
  payload: { iss: string; iat: number; exp: number },
  privateKeyPEM: string
): Promise<string> {
  const crypto = await import('crypto');

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();

  const signature = sign.sign(privateKeyPEM);
  const encodedSignature = base64UrlEncode(signature);

  return `${signingInput}.${encodedSignature}`;
}

function base64UrlEncode(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
