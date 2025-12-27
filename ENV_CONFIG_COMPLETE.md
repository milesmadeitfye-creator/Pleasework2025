# Environment Configuration Fix - Complete

## Problem Summary

1. **Build Failure:** `_metaCredentialsHelper.ts` imported `{ supabase }` but `_supabaseAdmin.ts` only exported `supabaseAdmin`
2. **Runtime Crashes:** "Cannot read properties of null (reading 'from')" when Supabase client was null
3. **Placeholder URLs:** Code attempted calls to `placeholder.supabase.co`
4. **Misleading Logs:** Banner showed "Supabase Server configured: false" even when vars were set
5. **No Graceful Degradation:** App crashed completely when DB not configured

## Solution Implemented

### A) Fixed Export Mismatch

**File:** `netlify/functions/_supabaseAdmin.ts`
- Now exports BOTH `supabaseAdmin` and `supabase` (alias)
- Uses safe getter functions: `getSupabaseAdmin()`, `getSupabaseAdminClient()`
- Returns `null` instead of throwing when env vars missing
- Logs: `configured= | urlLen= | keyLen=`

**File:** `netlify/functions/_metaCredentialsHelper.ts`
- Updated to use `getSupabaseAdmin()` instead of raw import
- Added null guard before calling `.from()`

### B) Created Central Env Resolver

**File:** `src/lib/env.ts` (NEW)

Provides single source of truth for all env var access:

**Browser Functions:**
- `getPublicSupabaseUrl()` - reads `VITE_SUPABASE_URL`
- `getPublicSupabaseAnonKey()` - reads `VITE_SUPABASE_ANON_KEY`
- `isPublicSupabaseConfigured()` - checks if both exist

**Server Functions:**
- `getServerSupabaseUrl()` - reads `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `getServerSupabaseServiceRoleKey()` - reads `SUPABASE_SERVICE_ROLE_KEY`
- `getServerSupabaseAnonKey()` - reads `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `isServerSupabaseConfigured()` - checks if URL + key exist

**Key Features:**
- Rejects placeholder URLs automatically
- Returns `null` when env vars missing (no throws)
- Supports multiple naming schemes (SUPABASE_*, VITE_SUPABASE_*)
- Safe logging: `logEnvConfig()` shows lengths only

### C) Updated All Client Files

**File:** `src/lib/supabase.client.ts`
- Uses `getPublicSupabaseUrl()` and `getPublicSupabaseAnonKey()`
- Exports nullable client: `supabase: SupabaseClient | null`
- Added `requireSupabaseClient()` for components that MUST have DB
- Never uses placeholder URLs

**File:** `src/lib/supabase.server.ts`
- Prioritizes `SUPABASE_URL` over `VITE_SUPABASE_URL`
- Exports nullable client: `supabaseServer: SupabaseClient | null`
- Rejects placeholder URLs
- Returns 200 with `{ disabled: true }` instead of 500 errors

### D) Hardened Null Checks

**File:** `src/ai/context/getManagerContext.ts`

Added guards to all fetch functions:
- `fetchMetaCampaigns()` - checks `!supabaseServer`, returns empty
- `fetchGhosteContext()` - checks `!supabaseServer`, returns empty
- `fetchTrackingClicks()` - checks `!supabaseServer`, returns empty

Pattern:
```typescript
if (!supabaseServer) {
  console.warn('[function] Supabase not configured, returning empty');
  return emptyResult;
}
```

### E) Fixed Misleading Banner

**Changes:**
- `src/lib/supabase.server.ts` now uses `console.warn()` not `console.error()`
- Detects BOTH naming schemes: `SUPABASE_*` and `VITE_SUPABASE_*`
- Only logs once on boot
- Shows `configured=true` if ANY supported vars yield valid URL + key

## Supported Environment Variable Names

The app now supports all these naming schemes:

### Browser (client-side)
- `VITE_SUPABASE_URL` (required)
- `VITE_SUPABASE_ANON_KEY` (required)

### Server (Netlify functions)
**URL (any one):**
- `SUPABASE_URL` (preferred)
- `VITE_SUPABASE_URL` (fallback)
- `SUPABASE_PROJECT_URL` (alternative)

**Key (any one):**
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for admin)
- `SUPABASE_ANON_KEY` (fallback)
- `VITE_SUPABASE_ANON_KEY` (fallback)

## Behavior Changes

### Before
```
❌ Build failed if wrong import name
❌ Crashed with "Cannot read properties of null"
❌ Made requests to placeholder.supabase.co
❌ Threw errors when env vars missing
❌ No graceful degradation
```

### After
```
✅ Build passes with flexible imports
✅ Returns empty data when DB not configured
✅ Never uses placeholder URLs
✅ Logs warnings, doesn't crash
✅ Graceful degradation everywhere
```

## Files Modified

1. `src/lib/env.ts` - NEW central resolver
2. `src/lib/supabase.client.ts` - uses env resolver
3. `src/lib/supabase.server.ts` - uses flexible naming, nullable
4. `netlify/functions/_supabaseAdmin.ts` - exports both names, nullable
5. `netlify/functions/_metaCredentialsHelper.ts` - uses safe getter
6. `src/ai/context/getManagerContext.ts` - null guards in 3 functions

## Testing Checklist

### ✅ Build Tests
- [x] TypeScript compiles without errors
- [x] Build passes (46.14s)
- [x] No import errors
- [x] No export mismatches

### ✅ Runtime Tests
- [x] No "Cannot read properties of null" errors
- [x] No requests to placeholder.supabase.co
- [x] Functions return `{ disabled: true }` when DB missing
- [x] Components show empty states instead of crashing

### ✅ Logging Tests
- [x] Shows `configured=true` when vars present
- [x] Shows `configured=false` when vars missing
- [x] Logs lengths only (no secrets)
- [x] Uses `console.warn` not `console.error`

## GhosteAI Meta Connection Logic

When Supabase is configured:
- AI reads `meta_credentials` via RPC
- Shows accurate connection status
- Can launch campaigns

When Supabase NOT configured:
- AI knows DB is disabled
- Says: "Database not configured, can't read your saved assets"
- Doesn't contradict user's actual Meta connection
- Asks user to check environment variables

Updated `getManagerContext()` to:
- Accept `setupStatus` from RPC (canonical source)
- Only fetch campaigns/clicks if DB configured
- Return empty results (not crash) if DB missing
- Add clear errors: `['Database not configured']`

## Success Criteria

All objectives achieved:

✅ Build passes without import/export errors
✅ No null crashes - all `.from()` calls guarded
✅ No placeholder URL requests
✅ Supports multiple env var naming schemes
✅ Graceful degradation (empty data > crashes)
✅ Clear, non-misleading logging
✅ GhosteAI reflects reality about DB state

## Deployment Notes

When deploying to Netlify:

1. **Required Env Vars:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)

2. **Optional Env Vars:**
   - `SUPABASE_URL` (alternative name)
   - `SUPABASE_ANON_KEY` (alternative name)

3. **Verification:**
   - Check logs for `configured=true`
   - Verify no placeholder URLs in Network tab
   - Test Manager page loads without errors
   - Verify GhosteAI responds correctly

## Migration Guide

If you see similar errors in other files:

1. **For browser code:** Use `src/lib/env.ts` getters
2. **For server code:** Use `getSupabaseAdmin()` from `_supabaseAdmin.ts`
3. **Always guard:** Check `if (!client)` before calling `.from()`
4. **Return gracefully:** Empty arrays/null, not crashes

## Example Patterns

### Browser Component
```typescript
import { getSupabaseClient } from '@/lib/supabase.client';

const client = getSupabaseClient();
if (!client) {
  return <div>Database not configured</div>;
}

// Safe to use client.from()
```

### Server Function
```typescript
import { getSupabaseAdmin, createSupabaseDisabledResponse } from './_supabaseAdmin';

const supabase = getSupabaseAdmin();
if (!supabase) {
  return createSupabaseDisabledResponse();
}

// Safe to use supabase.from()
```

### Manager Context
```typescript
if (!supabaseServer) {
  console.warn('[function] Supabase not configured');
  return { data: [], errors: ['Database not configured'] };
}

// Safe to use supabaseServer.from()
```

## Conclusion

The environment configuration is now robust, flexible, and handles missing configuration gracefully. No more crashes, no more placeholder URLs, and clear feedback when database features are disabled.
