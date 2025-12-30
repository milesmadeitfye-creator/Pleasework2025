/**
 * DEPRECATED: Use @/lib/supabase or @/lib/supabase.client instead
 *
 * This file now re-exports the singleton client to prevent
 * "multiple GoTrueClient instances" errors.
 */

export { supabase } from './supabase.client';
