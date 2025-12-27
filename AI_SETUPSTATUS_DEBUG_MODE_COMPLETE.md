# Ghoste AI setupStatus Debug Mode - Complete

## Summary

Added debug mode to `ghosteAgent.ts` that returns raw setupStatus without calling OpenAI. All authentication and RPC calls were already correctly implemented.

## What Was Changed

### 1. Added Debug Mode (ghosteAgent.ts lines 412-426)

**File**: `netlify/functions/ghosteAgent.ts`

Added early return when `?debug=1` is in the query string:

```typescript
// DEBUG MODE: Return setup status immediately without calling OpenAI
if (debug) {
  console.log('[ghosteAgent] Debug mode enabled - returning setupStatus without OpenAI call');
  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: JSON.stringify({
      ok: true,
      userId,
      setupStatus,
      debug: true,
      message: 'Debug mode - setup status fetched successfully'
    })
  };
}
```

## What Was Already Correct (No Changes Needed)

### ✅ JWT Authentication (Lines 289-342)

The function already:
1. Extracts Authorization header
2. Validates JWT with `supabase.auth.getUser(token)`
3. Returns 401 if missing/invalid
4. Uses authenticated userId (ignores body.userId)

```typescript
const authHeader = event.headers.authorization || event.headers.Authorization;
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
const userId = user.id; // Uses JWT user ID
```

### ✅ RPC Call with Parameter (Lines 404-405)

Already calls RPC with correct parameter:

```typescript
const { data: statusData, error: setupError } = await supabase.rpc('ai_get_setup_status', {
  p_user_id: userId // ✅ Correct - uses authenticated userId
});
```

### ✅ Frontend Authorization Header (edgeClient.ts lines 126-139)

Frontend already sends JWT:

```typescript
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData?.session?.access_token;

const response = await fetch("/.netlify/functions/ghosteAgent", {
  headers: {
    "Authorization": `Bearer ${token}`, // ✅ Already sending
  }
});
```

### ✅ All Other RPC Calls

Searched entire codebase - all `ai_get_setup_status` calls already use `{ p_user_id: userId }`:
- `src/components/manager/AdsDataStatus.tsx:37`
- `netlify/functions/ghosteAgent.ts:404`
- `netlify/functions/_aiSetupStatus.ts:182`
- `netlify/functions/ai-debug-setup.ts:127`
- `netlify/functions/run-ads-context.ts:59`

## How to Use Debug Mode

### Option 1: Query Parameter

Add `?debug=1` to the URL:

```bash
curl -X POST "https://ghoste.one/.netlify/functions/ghosteAgent?debug=1" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"messages": []}'
```

### Option 2: Frontend Test

Open browser console and run:

```javascript
const { data } = await supabase.auth.getSession();
const token = data?.session?.access_token;

const res = await fetch('/.netlify/functions/ghosteAgent?debug=1', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ messages: [] })
});

const debugData = await res.json();
console.log('Debug setupStatus:', debugData);
```

## Expected Debug Response

```json
{
  "ok": true,
  "userId": "abc-123-def-456",
  "setupStatus": {
    "meta": {
      "has_meta": true,
      "source_table": "user_profiles",
      "ad_accounts": [
        {
          "id": "act_954241099721950",
          "name": "Default",
          "source": "profile_fallback"
        }
      ],
      "pages": [
        {
          "id": "378962998634591",
          "name": "Default",
          "source": "profile_fallback"
        }
      ],
      "pixels": [
        {
          "id": "1265548714609457",
          "name": "Default",
          "source": "profile_fallback"
        }
      ],
      "instagram_accounts": [
        {
          "id": "17841467665224029",
          "username": "ghostemedia"
        }
      ]
    },
    "resolved": {
      "ad_account_id": "act_954241099721950",
      "page_id": "378962998634591",
      "pixel_id": "1265548714609457",
      "destination_url": "https://ghoste.one/s/million-talk"
    },
    "smart_links_count": 1,
    "smart_links_preview": [
      {
        "id": "link-123",
        "title": "Million Talk",
        "slug": "million-talk",
        "destination_url": "https://open.spotify.com/track/..."
      }
    ]
  },
  "debug": true,
  "message": "Debug mode - setup status fetched successfully"
}
```

## Troubleshooting Empty setupStatus

If `setupStatus` is `{}` or has empty fields:

### Check 1: User Has Meta Credentials

```sql
-- Run in Supabase SQL editor
SELECT * FROM public.user_profiles
WHERE user_id = '<uuid>'
AND (
  meta_ad_account_id IS NOT NULL
  OR meta_page_id IS NOT NULL
  OR meta_pixel_id IS NOT NULL
);
```

**Expected**: At least one Meta field should be non-null.

### Check 2: RPC Function Exists

```sql
-- Run in Supabase SQL editor
SELECT * FROM ai_get_setup_status('<uuid>');
```

**Expected**: Returns JSON with `meta`, `resolved`, and `smart_links_count` fields.

### Check 3: Frontend Auth

Open browser console:

```javascript
const { data } = await supabase.auth.getSession();
console.log('Token:', data?.session?.access_token ? 'present' : 'MISSING');
```

**Expected**: `Token: present`

### Check 4: Backend Auth

Check Netlify function logs for:

```
[ghosteAgent] Authenticated user: <uuid>
[ghosteAgent] Setup status fetched: { meta: { ... }, ... }
```

**Expected**: Both log lines should appear with valid data.

## Files Modified

1. **netlify/functions/ghosteAgent.ts** (lines 412-426)
   - Added debug mode early return

## Files NOT Modified (Already Correct)

1. `netlify/functions/ghosteAgent.ts` (auth + RPC) - ✅ Already correct
2. `src/lib/ghosteAI/edgeClient.ts` (Authorization header) - ✅ Already correct
3. `src/components/manager/AdsDataStatus.tsx` (RPC param) - ✅ Already correct
4. `netlify/functions/_aiSetupStatus.ts` (RPC param) - ✅ Already correct
5. `netlify/functions/ai-debug-setup.ts` (RPC param) - ✅ Already correct
6. `netlify/functions/run-ads-context.ts` (RPC param) - ✅ Already correct

## AI Function Endpoint

**Primary Endpoint**: `/.netlify/functions/ghosteAgent`

**Features**:
- ✅ JWT authentication (lines 289-342)
- ✅ RPC call with user ID (lines 404-405)
- ✅ RAW JSON setupStatus injection (lines 475-524)
- ✅ Debug mode (lines 412-426) - **NEWLY ADDED**
- ✅ Tool orchestration (16+ tools)
- ✅ Conversation persistence

**Debug URL**: `/.netlify/functions/ghosteAgent?debug=1`

## Security Notes

- Debug mode still requires valid JWT (returns 401 if missing)
- Debug mode only returns user's own data (validated via JWT)
- No secrets exposed in debug response
- Service role used only server-side (never exposed)

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 42.15s
✅ All Files Compile Successfully
```

## Conclusion

The Ghoste AI endpoint was already correctly authenticating and calling `ai_get_setup_status` with the proper parameter. This update only adds a debug mode for easier troubleshooting without calling OpenAI.

**To debug setupStatus issues**:
1. Add `?debug=1` to the request URL
2. Check response for `setupStatus` field
3. Verify `meta.has_meta` and `resolved` fields
4. If empty, check user_profiles table for Meta credentials
