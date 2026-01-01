# fetchMetaCredentials Export Fix - COMPLETE

## Problem

Netlify build was failing with error:
```
Module not found: fetchMetaCredentials is not exported from _metaCredentialsHelper.ts
```

Functions like `meta-audiences-ensure.ts` were trying to import `fetchMetaCredentials`, but it didn't exist.

## Solution

Added the missing `fetchMetaCredentials` export to:
**File:** `netlify/functions/_metaCredentialsHelper.ts`

## Implementation

**New Export:**
```typescript
export async function fetchMetaCredentials(
  userId: string
): Promise<{
  access_token: string | null;
  ad_account_id?: string | null;
  page_id?: string | null;
  pixel_id?: string | null;
  instagram_actor_id?: string | null;
  user_id?: string | null;
}>
```

**Key Features:**
1. Returns snake_case fields (not camelCase like existing functions)
2. Uses existing `getSupabaseAdmin()` helper
3. Tries `meta_credentials_safe` view first (if exists)
4. Falls back to `meta_credentials` table (service role)
5. Throws error if not connected or token missing

**Dual Strategy:**
```typescript
// Try safe view first
const safe = await supabase
  .from('meta_credentials_safe')
  .select('access_token, ad_account_id, ...')
  .eq('user_id', userId)
  .maybeSingle();

if (!safe.error && safe.data?.access_token) {
  return safe.data;
}

// Fallback to raw table
const raw = await supabase
  .from('meta_credentials')
  .select('access_token, ad_account_id, ...')
  .eq('user_id', userId)
  .maybeSingle();

if (raw.error || !raw.data?.access_token) {
  throw new Error('Meta not connected');
}

return raw.data;
```

## Why Two Functions?

The file now has TWO Meta credential functions:

### 1. `getMetaCredentials()` (existing)
- Returns `MetaCredentials` interface with **camelCase** fields
- Fields: `accessToken`, `adAccountId`, `pageId`, `pixelId`, `instagramAccountId`
- Used by most internal functions
- Has safe wrapper: `getMetaCredentialsSafe()`

### 2. `fetchMetaCredentials()` (new)
- Returns object with **snake_case** fields
- Fields: `access_token`, `ad_account_id`, `page_id`, `pixel_id`, `instagram_actor_id`
- Used by functions that expect database field names directly
- Used by: `meta-audiences-ensure.ts`, possibly others

**Why Different?**
- TypeScript naming conventions vs. database column names
- Some functions work directly with DB rows (snake_case)
- Some functions use TypeScript interfaces (camelCase)
- Both are valid, serving different use cases

## Constraints Followed

✅ Did NOT remove or rename any existing exports
✅ Did NOT change any existing function behavior
✅ ONLY added what was missing
✅ Works in Netlify serverless (Node, esbuild)
✅ Uses SUPABASE_SERVICE_ROLE_KEY (via getSupabaseAdmin)
✅ Compiles even if meta_credentials_safe does not exist (graceful fallback)

## Build Verification

✅ **Build Successful** - 39.52s, zero errors

All Netlify functions now compile correctly with the new export.

## Files Modified

1. ✅ `netlify/functions/_metaCredentialsHelper.ts` - Added `fetchMetaCredentials` export

## Next Steps

The `meta-audiences-ensure` and other functions can now successfully import and use `fetchMetaCredentials`.

## Status

🟢 **COMPLETE** - Missing export added, build passing, no breaking changes.
