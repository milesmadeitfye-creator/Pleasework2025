/**
 * SUPABASE NULL GUARD TEMPLATE
 *
 * Use this template when adding null guards to Netlify functions
 * that use Supabase admin client.
 */

import { getSupabaseAdmin, createSupabaseDisabledResponse } from './_supabaseAdmin';

// ============================================================================
// PATTERN 1: Read Operation (return empty data)
// ============================================================================
export async function exampleListFunction(userId: string): Promise<any[]> {
  console.log('[example] Listing items for user:', userId);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[example] Supabase not configured, returning empty list');
    return [];
  }

  // Safe to call supabase.from() here
  const { data, error } = await supabase
    .from('my_table')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[example] List error:', error);
    throw error;
  }

  return data ?? [];
}

// ============================================================================
// PATTERN 2: Get Single Item (return null)
// ============================================================================
export async function exampleGetFunction(userId: string, id: string): Promise<any | null> {
  console.log('[example] Getting item:', { userId, id });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[example] Supabase not configured, returning null');
    return null;
  }

  const { data, error } = await supabase
    .from('my_table')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[example] Get error:', error);
    throw error;
  }

  return data ?? null;
}

// ============================================================================
// PATTERN 3: Write Operation (throw error)
// ============================================================================
export async function exampleCreateFunction(userId: string, payload: any): Promise<any> {
  console.log('[example] Creating item:', { userId, payload });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot create item');
  }

  const { data, error } = await supabase
    .from('my_table')
    .insert({ user_id: userId, ...payload })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[example] Create error:', error);
    throw error;
  }

  return data!;
}

// ============================================================================
// PATTERN 4: Update Operation (throw error)
// ============================================================================
export async function exampleUpdateFunction(userId: string, id: string, updates: any): Promise<any> {
  console.log('[example] Updating item:', { userId, id, updates });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot update item');
  }

  const { data, error } = await supabase
    .from('my_table')
    .update(updates)
    .match({ id, user_id: userId })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[example] Update error:', error);
    throw error;
  }

  return data!;
}

// ============================================================================
// PATTERN 5: Delete Operation (silent failure)
// ============================================================================
export async function exampleDeleteFunction(userId: string, id: string): Promise<void> {
  console.log('[example] Deleting item:', { userId, id });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[example] Supabase not configured, cannot delete');
    return; // Silent failure for deletes
  }

  const { error } = await supabase
    .from('my_table')
    .delete()
    .match({ id, user_id: userId });

  if (error) {
    console.error('[example] Delete error:', error);
    throw error;
  }

  console.log('[example] Item deleted:', id);
}

// ============================================================================
// PATTERN 6: RPC Call (throw error if critical)
// ============================================================================
export async function exampleRPCFunction(userId: string, params: any): Promise<any> {
  console.log('[example] Calling RPC:', { userId, params });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase not configured - cannot call RPC');
  }

  const { data, error } = await supabase.rpc('my_rpc_function', {
    p_user_id: userId,
    ...params,
  });

  if (error) {
    console.error('[example] RPC error:', error);
    throw error;
  }

  return data;
}

// ============================================================================
// PATTERN 7: Netlify Function Handler
// ============================================================================
export async function handler(event: any, context: any) {
  // CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return createSupabaseDisabledResponse();
  }

  try {
    // Parse request
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;

    // Call your function
    const result = await exampleListFunction(userId);

    // Return success
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: true,
        data: result,
      }),
    };
  } catch (error: any) {
    console.error('[example] Handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: false,
        error: error.message,
      }),
    };
  }
}

// ============================================================================
// DECISION TREE: Which pattern to use?
// ============================================================================
/*

1. READ operations (list, get, query)
   → Return empty data: [], null, {}
   → User sees "no data" instead of crash

2. WRITE operations (create, update)
   → Throw error with message
   → User sees clear error in UI
   → Prevents silent data loss

3. DELETE operations
   → Silent failure (return early)
   → Nothing to delete if DB not configured

4. RPC calls (critical business logic)
   → Throw error
   → These are usually critical, should fail loudly

5. Netlify function handlers
   → Use createSupabaseDisabledResponse()
   → Returns { ok: false, disabled: true }
   → Client can handle gracefully

*/

// ============================================================================
// TESTING CHECKLIST
// ============================================================================
/*

To test your guards:

1. Comment out SUPABASE_URL in .env
2. Run your function
3. Verify:
   ✅ No "Cannot read properties of null" error
   ✅ Function returns expected fallback ([], null, etc)
   ✅ Logs show "Supabase not configured"
   ✅ No crashes

4. Restore SUPABASE_URL
5. Run function again
6. Verify:
   ✅ Normal behavior resumes
   ✅ Data operations work correctly

*/
