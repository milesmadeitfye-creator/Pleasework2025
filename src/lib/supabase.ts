/**
 * Client-only Supabase export.
 * This file MUST NOT be imported by Netlify Functions.
 *
 * DEPRECATION NOTICE:
 * Use explicit imports instead:
 * - Frontend: import from '@/lib/supabase.client'
 * - Functions: import from './_lib/supabase.server'
 */

if (typeof window === 'undefined') {
  throw new Error(
    '[CLIENT] src/lib/supabase.ts was imported in a server context. ' +
    'Use netlify/functions/_lib/supabase.server.ts instead.'
  );
}

export { supabase } from './supabase.client';