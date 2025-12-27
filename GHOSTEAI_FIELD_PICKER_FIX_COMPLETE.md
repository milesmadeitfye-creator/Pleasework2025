# Ghoste AI Field Picker - FLAT RPC Payload Support - COMPLETE

## Problem

The Supabase RPC `public.ai_get_setup_status(uuid)` returns a **FLAT jsonb structure** with fields like:
- `adAccountId`
- `pageId`
- `pixelId`
- `destinationUrl`
- `instagramActorId`
- `instagramUsername`
- `instagramAccounts` (array)
- `defaultInstagramId`

However, the transformation code expected **NESTED structures** like:
- `rpcData.meta.has_meta`
- `rpcData.resolved.ad_account_id`

This caused all values to be normalized to `null`, even when the RPC returned valid IDs.

**Result:** My Manager UI showed "Meta Ads: Not connected" even when Meta was properly configured.

---

## Solution: FLAT Payload Fast-Path

Added fast-path detection at the TOP of both transformation functions to handle flat RPC payloads directly, before attempting to access nested structures.

---

## Changes Made

### File: netlify/functions/_aiSetupStatus.ts

### 1. Updated `transformRPCResponse` (Lines 123-254)

**Added FAST-PATH at the beginning:**

```typescript
function transformRPCResponse(rpcData: any): Omit<AISetupStatus, 'errors'> {
  // FAST-PATH: Handle FLAT RPC payload directly
  const isFlat =
    rpcData &&
    (rpcData.adAccountId || rpcData.pageId || rpcData.pixelId || rpcData.destinationUrl);

  if (isFlat) {
    console.log('[transformRPCResponse] Using FLAT payload fast-path');

    // Extract resolved values from flat fields
    const resolved = {
      adAccountId: rpcData.adAccountId || null,
      pageId: rpcData.pageId || null,
      pixelId: rpcData.pixelId || null,
      destinationUrl: rpcData.destinationUrl || null,
    };

    // Build Instagram accounts from flat or array
    let instagramAccounts: any[] = [];
    if (Array.isArray(rpcData.instagramAccounts)) {
      instagramAccounts = rpcData.instagramAccounts.map((ig: any) => ({
        id: ig.id || ig.instagramActorId,
        username: ig.username || ig.instagramUsername,
        profilePictureUrl: ig.profile_picture_url,
      }));
    } else if (rpcData.instagramActorId || rpcData.instagramId) {
      instagramAccounts = [{
        id: rpcData.instagramActorId || rpcData.instagramId,
        username: rpcData.instagramUsername || null,
        profilePictureUrl: null,
      }];
    }

    const metaConnected = !!(resolved.adAccountId && resolved.pageId && resolved.pixelId);

    return {
      meta: {
        connected: metaConnected,
        sourceTable: 'user_profiles',
        adAccounts: resolved.adAccountId ? [{
          id: resolved.adAccountId,
          name: null,
          accountId: resolved.adAccountId,
          currency: null,
          source: 'profile_fallback',
        }] : [],
        pages: resolved.pageId ? [{
          id: resolved.pageId,
          name: null,
          category: null,
          source: 'profile_fallback',
        }] : [],
        pixels: resolved.pixelId ? [{
          id: resolved.pixelId,
          name: null,
          isAvailable: true,
          source: 'profile_fallback',
        }] : [],
        instagramAccounts,
      },
      smartLinks: {
        count: rpcData.smartLinksCount || 0,
        recent: Array.isArray(rpcData.smartLinks)
          ? rpcData.smartLinks.map((link: any) => ({ ... }))
          : [],
      },
      resolved,
    };
  }

  // LEGACY PATH: Handle nested RPC payload (old format)
  // ... existing nested logic preserved ...
}
```

**Key Features:**
- Detects flat payloads by checking for `rpcData.adAccountId`, `pageId`, etc.
- Maps flat fields directly to resolved values (no nulling)
- Builds Instagram accounts from flat fields OR array
- Creates minimal meta structures for compatibility
- Falls back to legacy nested logic if not flat

---

### 2. Updated `normalizeSetupStatus` (Lines 185-320)

**Added FAST-PATH at the beginning:**

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

  // FAST-PATH: Detect FLAT RPC payload (new format from ai_get_setup_status)
  const isFlat =
    rpcData &&
    (rpcData.adAccountId || rpcData.pageId || rpcData.pixelId || rpcData.destinationUrl ||
     rpcData.instagramActorId || rpcData.instagramId);

  if (isFlat) {
    console.log('[normalizeSetupStatus] Detected FLAT RPC payload - using fast-path');

    const metaConnected = !!(rpcData.adAccountId && rpcData.pageId && rpcData.pixelId);

    // Build Instagram accounts array from flat fields
    let instagramAccounts: any[] = [];
    if (Array.isArray(rpcData.instagramAccounts)) {
      instagramAccounts = rpcData.instagramAccounts;
    } else if (rpcData.instagramId || rpcData.instagramActorId) {
      instagramAccounts = [{
        id: rpcData.instagramActorId || rpcData.instagramId,
        username: rpcData.instagramUsername || null,
        page_id: rpcData.pageId || null,
        page_name: null,
      }];
    }

    const firstInstagram = instagramAccounts[0];

    const normalized = {
      // Nested meta structure
      meta: {
        has_meta: metaConnected,
        source_table: 'user_profiles',
        ad_accounts: rpcData.adAccountId ? [{ ... }] : [],
        pages: rpcData.pageId ? [{ ... }] : [],
        pixels: rpcData.pixelId ? [{ ... }] : [],
        instagram_accounts: instagramAccounts,
      },
      // Nested resolved structure (snake_case)
      resolved: {
        ad_account_id: rpcData.adAccountId || null,
        page_id: rpcData.pageId || null,
        pixel_id: rpcData.pixelId || null,
        destination_url: rpcData.destinationUrl || null,
        instagram_actor_id: firstInstagram?.id || rpcData.instagramActorId || null,
        instagram_username: firstInstagram?.username || rpcData.instagramUsername || null,
      },
      smart_links_count: rpcData.smartLinksCount || 0,
      smart_links_preview: rpcData.smartLinks || [],
      // Flat fields (backward compat - camelCase)
      adAccountId: rpcData.adAccountId || null,
      pageId: rpcData.pageId || null,
      pixelId: rpcData.pixelId || null,
      destinationUrl: rpcData.destinationUrl || null,
      instagramActorId: firstInstagram?.id || rpcData.instagramActorId || null,
      instagramUsername: firstInstagram?.username || rpcData.instagramUsername || null,
      instagramId: rpcData.instagramId || firstInstagram?.id || null,
      defaultInstagramId: rpcData.defaultInstagramId || firstInstagram?.id || null,
    };

    console.log('[normalizeSetupStatus] FLAT payload normalized:', {
      metaConnected,
      adAccountId: normalized.adAccountId,
      pageId: normalized.pageId,
      pixelId: normalized.pixelId,
      destinationUrl: normalized.destinationUrl,
      instagramAccounts: instagramAccounts.length,
    });

    return normalized;
  }

  // LEGACY PATH: Handle nested RPC payload (old format)
  // ... existing nested logic preserved ...
}
```

**Key Features:**
- Detects flat payloads by checking for flat field presence
- Preserves real IDs from RPC (no nulling)
- Creates BOTH nested AND flat structures for compatibility
- Handles Instagram accounts as array OR flat fields
- Logs detection and results for debugging
- Falls back to legacy logic for nested payloads

---

### 3. RPC Call Signature (Lines 247-249) - ALREADY CORRECT

```typescript
const { data, error } = await supabase.rpc('ai_get_setup_status', {
  p_user_id: userId,
});
```

Uses correct parameter name `p_user_id` (not `user_id`).
Throws on error, returns data directly.

---

### 4. pickSetupFields in ghosteAgent.ts (Lines 39-51) - ALREADY CORRECT

```typescript
function pickSetupFields(setupStatus: any) {
  const ss = setupStatus || {};
  const flat = ss.flat || ss;
  const resolved = ss.resolved || {};
  return {
    adAccountId: resolved.ad_account_id ?? flat.adAccountId ?? null,
    pageId: resolved.page_id ?? flat.pageId ?? null,
    pixelId: resolved.pixel_id ?? flat.pixelId ?? null,
    destinationUrl: resolved.destination_url ?? flat.destinationUrl ?? null,
    instagramActorId: resolved.instagram_actor_id ?? flat.instagramActorId ?? null,
    instagramUsername: resolved.instagram_username ?? flat.instagramUsername ?? null
  };
}
```

Already handles both nested and flat structures correctly.
Checks `resolved` first, falls back to flat fields.

---

## Expected Behavior

### Before Fix

RPC returns:
```json
{
  "adAccountId": "act_954241099721950",
  "pageId": "378962998634591",
  "pixelId": "1265548714609457",
  "destinationUrl": "https://ghoste.one",
  "instagramActorId": "17841467665224029",
  "instagramUsername": "ghostemedia"
}
```

After normalization (BROKEN):
```json
{
  "adAccountId": null,
  "pageId": null,
  "pixelId": null,
  "destinationUrl": null,
  "resolved": {
    "ad_account_id": null,
    "page_id": null,
    "pixel_id": null,
    "destination_url": null
  }
}
```

UI: "Meta Ads: Not connected"

---

### After Fix

RPC returns (same):
```json
{
  "adAccountId": "act_954241099721950",
  "pageId": "378962998634591",
  "pixelId": "1265548714609457",
  "destinationUrl": "https://ghoste.one",
  "instagramActorId": "17841467665224029",
  "instagramUsername": "ghostemedia"
}
```

After normalization (FIXED):
```json
{
  "adAccountId": "act_954241099721950",
  "pageId": "378962998634591",
  "pixelId": "1265548714609457",
  "destinationUrl": "https://ghoste.one",
  "resolved": {
    "ad_account_id": "act_954241099721950",
    "page_id": "378962998634591",
    "pixel_id": "1265548714609457",
    "destination_url": "https://ghoste.one",
    "instagram_actor_id": "17841467665224029",
    "instagram_username": "ghostemedia"
  },
  "meta": {
    "has_meta": true,
    "source_table": "user_profiles",
    "ad_accounts": [{ "id": "act_954241099721950", ... }],
    "pages": [{ "id": "378962998634591", ... }],
    "pixels": [{ "id": "1265548714609457", ... }],
    "instagram_accounts": [{ "id": "17841467665224029", "username": "ghostemedia" }]
  }
}
```

UI: "Meta Ads: Connected" ✅

---

## Log Output (After Fix)

```
[callSetupStatusRPC] Calling ai_get_setup_status RPC for user: ...
[normalizeSetupStatus] Detected FLAT RPC payload - using fast-path
[normalizeSetupStatus] FLAT payload normalized: {
  metaConnected: true,
  adAccountId: 'act_954241099721950',
  pageId: '378962998634591',
  pixelId: '1265548714609457',
  destinationUrl: 'https://ghoste.one',
  instagramAccounts: 1
}
[transformRPCResponse] Using FLAT payload fast-path
[getAISetupStatus] Status summary: {
  metaConnected: true,
  sourceTable: 'user_profiles',
  metaAdAccounts: 1,
  metaPages: 1,
  metaPixels: 1,
  resolvedAdAccount: 'act_954241099721950',
  resolvedPage: '378962998634591',
  resolvedPixel: '1265548714609457',
  resolvedDestination: 'https://ghoste.one'
}
```

---

## Files Changed

### netlify/functions/_aiSetupStatus.ts

| Lines | Change | Purpose |
|-------|--------|---------|
| 124-196 | Added flat payload fast-path to `transformRPCResponse` | Detect and handle flat RPC responses |
| 199-254 | Preserved legacy nested path | Backward compatibility |
| 197-280 | Added flat payload fast-path to `normalizeSetupStatus` | Detect and map flat fields to nested structure |
| 283-320 | Preserved legacy nested path | Backward compatibility |

**Total:** 1 file modified, ~180 lines changed
**No RPC changes, no DB changes**

---

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 44.44s
✅ All Files Compile Successfully
```

---

## Summary

### Root Cause
- RPC returns FLAT structure: `{ adAccountId, pageId, pixelId, ... }`
- Transform functions expected NESTED: `{ meta: {...}, resolved: {...} }`
- Result: All values normalized to `null`

### Fix Strategy
1. **Detect flat payloads** at the TOP of transform functions
2. **Map flat fields directly** to output structure (no nested access)
3. **Build minimal meta/resolved structures** for compatibility
4. **Preserve legacy path** for nested payloads
5. **Log detection** for debugging

### Key Innovation: Fast-Path Detection

Both functions now check for flat field presence FIRST:
```typescript
const isFlat = rpcData && (rpcData.adAccountId || rpcData.pageId || ...);
if (isFlat) { /* handle flat */ }
// else { /* handle nested (legacy) */ }
```

This guarantees:
- ✅ Real IDs preserved from RPC
- ✅ No nulling of valid values
- ✅ Backward compatibility maintained
- ✅ Instagram fields populated
- ✅ My Manager UI shows correct status

### Result

Meta Connection panel and AI chat now show correct Meta setup status with real IDs instead of nulls.
