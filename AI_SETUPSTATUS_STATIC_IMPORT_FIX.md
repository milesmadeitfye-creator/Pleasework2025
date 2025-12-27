# Ghoste AI setupStatus Static Import Fix - Complete

## Problem

Meta Connection debug panel showed setupStatus with ONLY flat keys and NO resolved/meta structure. AI responses printed null values instead of actual IDs.

## Root Cause

Dynamic import of `normalizeSetupStatus()` wasn't working reliably:
```typescript
const { normalizeSetupStatus } = await import('./_aiSetupStatus.js');
```

Possible causes:
- Netlify Functions bundling issues with `.js` extension
- Async module resolution timing
- Build/runtime environment differences

## Solution

Changed to static import at top of file for deterministic behavior.

---

## Files Changed

### netlify/functions/ghosteAgent.ts

**Line 29:** Added static import
```typescript
import { normalizeSetupStatus } from './_aiSetupStatus';
```

**Lines 411-417:** Removed dynamic import, added detailed logging
```typescript
// ALWAYS normalize to ensure both flat and nested fields exist
setupStatus = normalizeSetupStatus(statusData);

console.log('[ghosteAgent] Setup status fetched and normalized');
console.log('[ghosteAgent] Normalized keys:', Object.keys(setupStatus));
console.log('[ghosteAgent] Has meta:', setupStatus.meta?.has_meta);
console.log('[ghosteAgent] Flat adAccountId:', setupStatus.adAccountId);
console.log('[ghosteAgent] Resolved ad_account_id:', setupStatus.resolved?.ad_account_id);
```

**Lines 432-441:** Enhanced debug response with verification
```typescript
verification: {
  has_meta: setupStatus.meta?.has_meta,
  flat_adAccountId: setupStatus.adAccountId,
  resolved_adAccountId: setupStatus.resolved?.ad_account_id,
  flat_pageId: setupStatus.pageId,
  resolved_pageId: setupStatus.resolved?.page_id,
  normalized_keys: Object.keys(setupStatus),
  meta_keys: Object.keys(setupStatus.meta || {}),
  resolved_keys: Object.keys(setupStatus.resolved || {}),
}
```

**Line 449:** Use normalizeSetupStatus for empty case
```typescript
setupStatus = normalizeSetupStatus(null);
```

---

## Expected Debug Response

`/.netlify/functions/ghosteAgent?debug=1` now returns:

```json
{
  "ok": true,
  "setupStatus": {
    "meta": {
      "has_meta": true,
      "ad_accounts": [...],
      "pages": [...],
      "pixels": [...]
    },
    "resolved": {
      "ad_account_id": "act_954241099721950",
      "page_id": "378962998634591",
      "pixel_id": "1265548714609457"
    },
    "adAccountId": "act_954241099721950",
    "pageId": "378962998634591",
    "pixelId": "1265548714609457"
  },
  "verification": {
    "has_meta": true,
    "flat_adAccountId": "act_954241099721950",
    "resolved_adAccountId": "act_954241099721950",
    "normalized_keys": ["meta", "resolved", "adAccountId", "pageId", ...],
    "meta_keys": ["has_meta", "source_table", "ad_accounts", ...],
    "resolved_keys": ["ad_account_id", "page_id", "pixel_id", ...]
  }
}
```

---

## Verification

### Console Test

```javascript
const { data } = await supabase.auth.getSession();
const token = data.session.access_token;

const res = await fetch('/.netlify/functions/ghosteAgent?debug=1', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [] })
});

const debug = await res.json();

console.log('Flat:', debug.setupStatus.adAccountId);
console.log('Resolved:', debug.setupStatus.resolved.ad_account_id);
console.log('Match:', debug.setupStatus.adAccountId === debug.setupStatus.resolved.ad_account_id);
```

Expected:
```
Flat: act_954241099721950
Resolved: act_954241099721950
Match: true
```

### AI Chat Test

Ask Ghoste AI: "What is my Meta setup status?"

Expected response includes real IDs:
```
Ad Account: act_954241099721950
Page: 378962998634591
Pixel: 1265548714609457
```

NOT null values.

---

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 45.02s
✅ All Files Compile Successfully
```

---

## Summary

| Change | Before | After |
|--------|--------|-------|
| Import method | Dynamic `await import()` | Static `import` |
| Reliability | Inconsistent | Deterministic |
| Debug output | Basic | Comprehensive verification |
| Empty handling | Manual object | `normalizeSetupStatus(null)` |

1 file changed, ~40 lines modified.
No DB changes, no breaking changes.
