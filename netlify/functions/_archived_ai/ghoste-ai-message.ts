import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { conversation_id, user_id, new_messages } = body;

    if (!conversation_id || !user_id || !Array.isArray(new_messages)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'conversation_id, user_id, and new_messages are required',
        }),
      };
    }

    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('messages, user_id')
      .eq('id', conversation_id)
      .single();

    if (fetchError || !existing || existing.user_id !== user_id) {
      console.error('Failed to load conversation', fetchError);
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Conversation not found' }),
      };
    }

    const currentMessages = Array.isArray(existing.messages)
      ? existing.messages
      : [];
    const now = new Date().toISOString();
    const normalizedNew = new_messages.map((m: any) => ({
      id: m.id ?? randomUUID(),
      role: m.role,
      content: m.content,
      created_at: m.created_at ?? now,
    }));

    const updatedMessages = [...currentMessages, ...normalizedNew];

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        messages: updatedMessages,
        updated_at: now,
      })
      .eq('id', conversation_id);

    if (updateError) {
      console.error('Failed to update messages', updateError);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Failed to update conversation messages' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ messages: updatedMessages }),
    };
  } catch (err: any) {
    console.error('Unexpected message handler error', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'Unexpected error while updating messages',
        details: err?.message ?? String(err),
      }),
    };
  }
};
