# Ghoste AI setupStatus Normalization - Complete

## Summary

Fixed setupStatus shape mismatch by normalizing RPC response to include **BOTH** flat fields (backward compat) AND nested meta/resolved structure. All consumers now get consistent data regardless of which shape they expect.

---

## Problem

The RPC `ai_get_setup_status` returns nested structure:
```json
{
  "meta": { "has_meta": true, "ad_accounts": [...] },
  "resolved": { "ad_account_id": "act_123", "page_id": "456" }
}
```

But some code expected flat fields:
```json
{
  "adAccountId": "act_123",
  "pageId": "456"
}
```

This caused `setupStatus.resolved.ad_account_id` to be undefined in debug mode even when data existed.

---

## Solution

Created `normalizeSetupStatus()` function that returns **BOTH** shapes:

```typescript
{
  // Nested structure (canonical from RPC)
  meta: {
    has_meta: true,
    ad_accounts: [...],
    pages: [...],
    pixels: [...]
  },
  resolved: {
    ad_account_id: "act_954241099721950",
    page_id: "378962998634591",
    pixel_id: "1265548714609457",
    destination_url: "https://ghoste.one/s/..."
  },

  // Flat fields (backward compat)
  adAccountId: "act_954241099721950",
  pageId: "378962998634591",
  pixelId: "1265548714609457",
  destinationUrl: "https://ghoste.one/s/...",
  instagramActorId: "17841467665224029",
  instagramUsername: "ghostemedia"
}
```

---

## Files Changed

### 1. netlify/functions/_aiSetupStatus.ts

**Lines 178-234**: Added `normalizeSetupStatus()` export

```typescript
export function normalizeSetupStatus(rpcData: any): any {
  if (!rpcData) {
    return {
      meta: { has_meta: false },
      resolved: {},
      adAccountId: null,
      pageId: null,
      pixelId: null,
      destinationUrl: null,
    };
  }

  const resolved = rpcData.resolved || {};
  const meta = rpcData.meta || {};
  const instagramAccounts = meta.instagram_accounts || [];
  const firstInstagram = instagramAccounts[0];

  // Create normalized object with BOTH flat and nested fields
  const normalized = {
    // Preserve original nested structure
    meta: {
      has_meta: meta.has_meta || false,
      source_table: meta.source_table || null,
      ad_accounts: meta.ad_accounts || [],
      pages: meta.pages || [],
      pixels: meta.pixels || [],
      instagram_accounts: instagramAccounts,
    },
    resolved: {
      ad_account_id: resolved.ad_account_id || null,
      page_id: resolved.page_id || null,
      pixel_id: resolved.pixel_id || null,
      destination_url: resolved.destination_url || null,
      instagram_actor_id: firstInstagram?.id || null,
      instagram_username: firstInstagram?.username || null,
    },
    smart_links_count: rpcData.smart_links_count || 0,
    smart_links_preview: rpcData.smart_links_preview || [],

    // Add flat fields (backward compat)
    adAccountId: resolved.ad_account_id || null,
    pageId: resolved.page_id || null,
    pixelId: resolved.pixel_id || null,
    destinationUrl: resolved.destination_url || null,
    instagramActorId: firstInstagram?.id || null,
    instagramUsername: firstInstagram?.username || null,
  };

  return normalized;
}
```

**Lines 240-283**: Updated `callSetupStatusRPC()` to normalize response

```typescript
async function callSetupStatusRPC(supabase: SupabaseClient | null, userId: string): Promise<any> {
  // ... fetch RPC ...

  // Normalize the response to include both flat and nested fields
  const normalized = normalizeSetupStatus(data);

  console.log('[callSetupStatusRPC] RPC success (normalized):', {
    has_meta: normalized.meta?.has_meta,
    // Flat fields
    adAccountId: normalized.adAccountId,
    pageId: normalized.pageId,
    pixelId: normalized.pixelId,
    // Resolved fields
    resolved_ad_account: normalized.resolved?.ad_account_id || null,
    resolved_page: normalized.resolved?.page_id || null,
    resolved_pixel: normalized.resolved?.pixel_id || null,
  });

  return normalized;
}
```

**Lines 119-176**: Updated `transformRPCResponse()` to handle normalized data safely

```typescript
function transformRPCResponse(rpcData: any): Omit<AISetupStatus, 'errors'> {
  const resolved = {
    adAccountId: rpcData.resolved?.ad_account_id || null,
    pageId: rpcData.resolved?.page_id || null,
    pixelId: rpcData.resolved?.pixel_id || null,
    destinationUrl: rpcData.resolved?.destination_url || null,
  };

  // ... builds AISetupStatus structure ...
}
```

### 2. netlify/functions/ghosteAgent.ts

**Lines 408-436**: Import and use `normalizeSetupStatus()`

```typescript
if (!setupError && statusData) {
  // Import and use normalizeSetupStatus to ensure both flat and nested fields exist
  const { normalizeSetupStatus } = await import('./_aiSetupStatus.js');
  setupStatus = normalizeSetupStatus(statusData);
  console.log('[ghosteAgent] Setup status fetched and normalized:', setupStatus);

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
        message: 'Debug mode - setup status fetched successfully',
        // Include key fields for quick verification
        verification: {
          has_meta: setupStatus.meta?.has_meta,
          flat_adAccountId: setupStatus.adAccountId,
          resolved_adAccountId: setupStatus.resolved?.ad_account_id,
          flat_pageId: setupStatus.pageId,
          resolved_pageId: setupStatus.resolved?.page_id,
        }
      })
    };
  }
}
```

**Lines 448-523**: Uses normalized `resolved` values (already correct, no changes needed)

```typescript
// Use RESOLVED fields (canonical source of truth)
const resolved = setupStatus.resolved || {};
const adAccountId = resolved.ad_account_id;  // ✅ Uses normalized nested field
const pageId = resolved.page_id;              // ✅ Uses normalized nested field
const pixelId = resolved.pixel_id;            // ✅ Uses normalized nested field
const destinationUrl = resolved.destination_url; // ✅ Uses normalized nested field

// Build RAW JSON for AI to parse directly
const rawSetupStatus = {
  adAccountId: adAccountId || null,  // ✅ Uses resolved value
  pageId: pageId || null,            // ✅ Uses resolved value
  pixelId: pixelId || null,          // ✅ Uses resolved value
  // ...
};
```

---

## Verification

### Test Debug Endpoint

**In Browser Console:**

```javascript
const { data } = await supabase.auth.getSession();
const token = data.session.access_token;

const res = await fetch('/.netlify/functions/ghosteAgent?debug=1', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ messages: [] })
});

const debug = await res.json();
console.log('Debug Response:', debug);
console.log('\n--- Verification ---');
console.log('has_meta:', debug.verification.has_meta);
console.log('flat_adAccountId:', debug.verification.flat_adAccountId);
console.log('resolved_adAccountId:', debug.verification.resolved_adAccountId);
console.log('Match:', debug.verification.flat_adAccountId === debug.verification.resolved_adAccountId);
```

### Expected Response Shape

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
      "destination_url": "https://ghoste.one/s/million-talk",
      "instagram_actor_id": "17841467665224029",
      "instagram_username": "ghostemedia"
    },
    "smart_links_count": 1,
    "smart_links_preview": [
      {
        "id": "uuid-123",
        "title": "Million Talk",
        "slug": "million-talk",
        "destination_url": "https://open.spotify.com/track/..."
      }
    ],
    "adAccountId": "act_954241099721950",
    "pageId": "378962998634591",
    "pixelId": "1265548714609457",
    "destinationUrl": "https://ghoste.one/s/million-talk",
    "instagramActorId": "17841467665224029",
    "instagramUsername": "ghostemedia"
  },
  "debug": true,
  "verification": {
    "has_meta": true,
    "flat_adAccountId": "act_954241099721950",
    "resolved_adAccountId": "act_954241099721950",
    "flat_pageId": "378962998634591",
    "resolved_pageId": "378962998634591"
  }
}
```

### Verify AI Uses Correct Values

Ask Ghoste AI:
```
What is my Meta setup status?
```

**Expected**: AI should print the actual ad account ID, page ID, pixel ID from `setupStatus.resolved` (or flat fields), not null/undefined.

**Example Response:**
```
Your Meta setup status:
- Ad Account: act_954241099721950 (Default)
- Page: 378962998634591 (Default)
- Pixel: 1265548714609457 (Default)
- Instagram: @ghostemedia (17841467665224029)
- Destination: https://ghoste.one/s/million-talk
- Source: user_profiles (profile fallback)

✅ Meta is configured and ready to use for ad campaigns.
```

---

## Key Improvements

### 1. Dual Shape Support

Both consumers get what they expect:
- **Old code** using flat `setupStatus.adAccountId` → ✅ Works
- **New code** using nested `setupStatus.resolved.ad_account_id` → ✅ Works

### 2. Single Normalization Point

All normalization happens in `_aiSetupStatus.ts` → `normalizeSetupStatus()`:
- ✅ No duplicate logic
- ✅ Easy to maintain
- ✅ Consistent across all consumers

### 3. Debug Verification Object

New `verification` field in debug response shows both shapes side-by-side:
```json
{
  "verification": {
    "has_meta": true,
    "flat_adAccountId": "act_954241099721950",
    "resolved_adAccountId": "act_954241099721950",
    "flat_pageId": "378962998634591",
    "resolved_pageId": "378962998634591"
  }
}
```

Instant visual confirmation that both shapes match.

### 4. Instagram Fields Added

Normalized response now includes Instagram at top level:
```json
{
  "instagramActorId": "17841467665224029",
  "instagramUsername": "ghostemedia",
  "resolved": {
    "instagram_actor_id": "17841467665224029",
    "instagram_username": "ghostemedia"
  }
}
```

Both flat and nested formats available for backward compat.

---

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 36.33s
✅ All Files Compile Successfully
```

---

## Backward Compatibility

### ✅ Old Code Still Works

If any code expects flat fields:
```typescript
const adAccount = setupStatus.adAccountId;  // ✅ Still works
```

### ✅ New Code Works

If code expects nested structure:
```typescript
const adAccount = setupStatus.resolved.ad_account_id;  // ✅ Also works
```

### ✅ Both Return Same Value

```typescript
setupStatus.adAccountId === setupStatus.resolved.ad_account_id  // true
```

---

## Security Notes

- ✅ No RLS changes
- ✅ No DB schema changes
- ✅ Only normalized JSON transformation
- ✅ Still requires valid JWT for debug mode
- ✅ Service role used only server-side

---

## Next Steps

After deployment:

1. **Test debug endpoint**: Hit `/.netlify/functions/ghosteAgent?debug=1` with valid JWT
2. **Check verification**: Ensure `flat_adAccountId` matches `resolved_adAccountId`
3. **Ask Ghoste AI**: "What is my Meta setup status?" and verify it prints real IDs
4. **Remove debug mode** (optional): Once verified, can remove debug early return

---

## Files Modified Summary

| File | Lines | Change |
|------|-------|--------|
| `netlify/functions/_aiSetupStatus.ts` | 178-283 | Added `normalizeSetupStatus()` export + updated `callSetupStatusRPC()` |
| `netlify/functions/ghosteAgent.ts` | 408-436 | Import + use `normalizeSetupStatus()` + enhanced debug mode |

Total: **2 files, ~100 lines added/modified**

No DB changes, no schema changes, no breaking changes.
