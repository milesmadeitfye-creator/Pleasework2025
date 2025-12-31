# Ads Publish Error Details Fix - COMPLETE

**Date**: 2025-12-31
**Status**: ✅ FULLY IMPLEMENTED

## Problem

Ads publish was failing with:
- POST `/.netlify/functions/run-ads-submit` → 500
- Response: `{ ok: false, error: "Failed to create campaign record" }`
- No details about WHY the insert failed
- No Postgres error code, message, or hint

This made debugging impossible.

## Root Cause

The error handling in `run-ads-submit.ts` (lines 366-374) was catching Supabase insert errors but only returning a generic message:

```typescript
if (insertError || !campaign) {
  console.error('[run-ads-submit] Failed to insert campaign:', insertError);
  return {
    statusCode: 500,
    body: JSON.stringify({
      ok: false,
      error: 'Failed to create campaign record',
      // ❌ NO DETAIL!
    }),
  };
}
```

## Solution Implemented

### 1. **Server-Side: Expose Full Postgres Error Details**

**File**: `netlify/functions/run-ads-submit.ts`

**Changes**:

**A) Added logging before insert (lines 362-367):**
```typescript
console.log('[run-ads-submit] Inserting ad_campaigns row:', {
  user_id: user.id,
  keys: Object.keys(insertPayload),
  creative_ids_count: resolvedCreativeIds.length,
  status: campaignStatus,
});
```

**B) Improved error response (lines 375-396):**
```typescript
if (insertError || !campaign) {
  console.error('[run-ads-submit] Failed to insert campaign:', {
    code: insertError?.code,
    message: insertError?.message,
    details: insertError?.details,
    hint: insertError?.hint,
  });

  return {
    statusCode: 500,
    body: JSON.stringify({
      ok: false,
      error: 'Failed to create campaign record',
      detail: {
        code: insertError?.code,        // e.g., "23505" (unique violation)
        message: insertError?.message,  // e.g., "duplicate key value..."
        details: insertError?.details,  // Full Postgres error text
        hint: insertError?.hint,        // Postgres hint
      },
    }),
  };
}
```

### 2. **Client-Side: Log Session State & Error Details**

**File**: `src/components/campaigns/AICampaignWizard.tsx`

**A) Added session validation logging (lines 286-297):**
```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session?.access_token) {
  console.error('[AICampaignWizard] Missing session or access_token', {
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
  });
  throw new Error('Not authenticated - please sign in again');
}

console.log('[AICampaignWizard] Auth session obtained', {
  hasAccessToken: !!session.access_token,
});
```

**B) Enhanced error logging to capture detail field (lines 364-400):**
```typescript
if (!response.ok) {
  const error = result || { error: responseText || 'Unknown error' };
  console.error('[AICampaignWizard] Publish failed (HTTP error):', {
    status: response.status,
    error,
  });

  // If detail exists, log it for debugging
  if (error.detail) {
    console.error('[AICampaignWizard] Database error detail:', error.detail);
  }

  throw new Error(error.error || error.message || 'Failed to create campaign');
}

if (!result.ok) {
  console.error('[AICampaignWizard] Publish failed (result.ok=false):', {
    result,
  });

  // If detail exists, log it for debugging
  if (result.detail) {
    console.error('[AICampaignWizard] Database error detail:', result.detail);
  }

  throw new Error(result.error || 'Failed to create campaign');
}
```

## What This Fixes

### Before
**Server logs:**
```
[run-ads-submit] Failed to insert campaign: [object Object]
```

**Client sees:**
```json
{
  "ok": false,
  "error": "Failed to create campaign record"
}
```

**Result**: No idea what went wrong.

### After
**Server logs:**
```
[run-ads-submit] Inserting ad_campaigns row: {
  user_id: "abc-123-uuid",
  keys: ["user_id", "draft_id", "ad_goal", "creative_ids", ...],
  creative_ids_count: 2,
  status: "draft"
}

[run-ads-submit] Failed to insert campaign: {
  code: "23505",
  message: "duplicate key value violates unique constraint \"ad_campaigns_pkey\"",
  details: "Key (id)=(xyz-456-uuid) already exists.",
  hint: null
}
```

**Client sees:**
```json
{
  "ok": false,
  "error": "Failed to create campaign record",
  "detail": {
    "code": "23505",
    "message": "duplicate key value violates unique constraint \"ad_campaigns_pkey\"",
    "details": "Key (id)=(xyz-456-uuid) already exists.",
    "hint": null
  }
}
```

**Client console:**
```
[AICampaignWizard] Database error detail: {
  code: "23505",
  message: "duplicate key value violates unique constraint ...",
  details: "Key (id)=(xyz-456-uuid) already exists.",
  hint: null
}
```

**Result**: Clear diagnosis!

## Common Postgres Error Codes

Now that detail is exposed, you can diagnose:

| Code | Meaning | Example |
|------|---------|---------|
| `23505` | Unique violation | Duplicate ID or slug |
| `23503` | Foreign key violation | Referenced row doesn't exist |
| `23502` | Not null violation | Required field missing |
| `42P01` | Table doesn't exist | Schema mismatch |
| `42703` | Column doesn't exist | Schema mismatch |
| `22P02` | Invalid text representation | Type casting error |
| `42501` | Insufficient privilege | RLS blocking insert |

## Auth Validation

The fix also ensures:

**Client checks session before sending:**
```typescript
if (!session?.access_token) {
  console.error('[AICampaignWizard] Missing session or access_token');
  throw new Error('Not authenticated - please sign in again');
}
```

**Server validates token:**
```typescript
const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return {
    statusCode: 401,
    body: JSON.stringify({ ok: false, error: "invalid_token" }),
  };
}
```

## Testing Scenarios

### Scenario 1: Missing Authorization Header
**Response**: 401 `{ ok: false, error: "unauthorized" }`

### Scenario 2: Invalid Token
**Response**: 401 `{ ok: false, error: "invalid_token" }`

### Scenario 3: Database Insert Fails (RLS)
**Response**: 500 with detail:
```json
{
  "ok": false,
  "error": "Failed to create campaign record",
  "detail": {
    "code": "42501",
    "message": "new row violates row-level security policy...",
    "hint": "..."
  }
}
```

### Scenario 4: Duplicate Key
**Response**: 500 with detail:
```json
{
  "ok": false,
  "error": "Failed to create campaign record",
  "detail": {
    "code": "23505",
    "message": "duplicate key value violates unique constraint..."
  }
}
```

### Scenario 5: Invalid UUID
**Response**: 500 with detail:
```json
{
  "ok": false,
  "error": "Failed to create campaign record",
  "detail": {
    "code": "22P02",
    "message": "invalid input syntax for type uuid: \"invalid-uuid\""
  }
}
```

### Scenario 6: Success
**Response**: 200 `{ ok: true, campaign_id: "xyz", status: "draft" }`

## Service Role Confirmation

The function uses `getSupabaseAdmin()` which:
- Returns a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`
- Bypasses RLS (only if service key is set in Netlify env vars)
- Falls back to anon key if service key not available

**Logged at function startup:**
```
[Supabase Admin] configured=true | urlLen=50 | serviceKeyLen=178 | anonKeyLen=178 | usingServiceRole=true
```

## What This Enables

With error details now exposed, you can:

1. **Diagnose RLS issues**: See if code `42501` appears → RLS blocking insert
2. **Fix schema mismatches**: See if code `42703` appears → column doesn't exist
3. **Handle constraint violations**: See if code `23505` appears → duplicate key
4. **Debug type errors**: See if code `22P02` appears → invalid UUID format
5. **Read Postgres hints**: Use `hint` field for suggestions

## Integration with Ads Debug Panel

The enhanced error details will be captured by the Ads Debug Panel:

**Console Tab** will show:
```
[AICampaignWizard] Database error detail: { code: "23505", ... }
```

**Network Tab** will show response body with full detail object.

## Next Steps

If you still get 500 errors:

1. **Open Ads Debug Panel**
2. **Click "Console" tab** → Look for session validation logs
3. **Click "Network" tab** → Expand request/response details
4. **Look at `detail.code`** in response body
5. **Cross-reference with Postgres error code table above**
6. **Fix root cause** (e.g., add missing column, fix RLS policy, etc.)

## Files Changed

### Modified
- `netlify/functions/run-ads-submit.ts` - Added error detail exposure
- `src/components/campaigns/AICampaignWizard.tsx` - Added session validation and error detail logging

## Security Note

No tokens or secrets are exposed in the error detail.

The `detail` field only contains:
- Postgres error code (public)
- Postgres error message (safe)
- Postgres details (table/column names - safe)
- Postgres hint (safe)

Authorization headers are never logged or returned.

Build passes. Error details now fully exposed for debugging.
