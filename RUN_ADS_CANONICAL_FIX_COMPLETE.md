# Run Ads Canonical Fix - Complete

## Overview

Fixed Ghoste AI "run ads" by implementing canonical data sources with service role access.

**Status:** ✅ Complete
**Build:** ✅ Passing

---

## Problems Fixed

1. **Links**: Used non-existent tables, views, analytics tables
2. **Meta**: Multiple contradictory sources, no auto-population
3. **RLS**: Server-side queries hit RLS, returned empty results
4. **Legacy**: Fallback to "smartlinks" (no underscore) table

---

## Solution

### A) Created Canonical Helpers (Service Role)

**File:** `netlify/functions/_canonicalRunAdsContext.ts` (NEW)

**Three core helpers:**

1. `getLinkAvailability(userId)` - Links from base tables ONLY
   - `smart_links` (owner_user_id filter)
   - `oneclick_links` (owner_user_id filter)
   - `public_track_links` (user_id filter)
   - `presave_links` (user_id filter)
   - `email_capture_links` (user_id filter)
   - NO views, NO analytics, NO legacy tables

2. `getMetaRunContext(userId)` - Meta from canonical sources ONLY
   - Priority 1: `user_meta_assets` (chosen assets)
   - Priority 2: `user_meta_connections` (fallback with auto-populate)
   - Auto-populates `user_meta_assets` if connection exists but assets empty

3. `getRunAdsContext(userId)` - Unified context
   - Combines Meta + Links
   - Returns readiness status
   - Returns blockers
   - Uses service role for ALL queries (bypasses RLS)

---

### B) Updated Delegation

**File:** `netlify/functions/_runAdsContext.ts` (UPDATED)

Now delegates to canonical implementation:
```typescript
export async function getRunAdsContext(userId: string) {
  const canonical = await getCanonicalRunAdsContext(userId);
  return transformToLegacyFormat(canonical);
}
```

---

### C) Removed Legacy Fallbacks

**File:** `netlify/functions/smartlink-track.ts` (UPDATED)

**Before:** Tried 4 tables with fallback:
- smart_links_v
- smart_links
- **smartlinks** (legacy, doesn't exist)
- links

**After:** Uses `smart_links` ONLY

---

### D) Auto-Populate Meta Assets

**Logic in `_canonicalRunAdsContext.ts`:**

1. Check `user_meta_assets` first
2. If empty but `user_meta_connections` exists:
   - Query `meta_ad_accounts` (pick first)
   - Query `meta_pages` (pick first)
   - Query `meta_pixels` (pick first)
   - UPSERT into `user_meta_assets`
3. No user steps required

---

### E) Fixed Column Names

**smart_links table uses `owner_user_id`**, not `user_id`

Updated in `_runAdsPipeline.ts`:
```typescript
// Before
.eq('user_id', user_id)

// After
.eq('owner_user_id', user_id)
```

---

## Architecture

### Before (Fragmented)

```
AI Pipeline:
  → Custom queries with user role
  → Hit RLS, returned empty
  → Tried multiple tables/views
  → "smartlinks" fallback (doesn't exist)
  → Contradictions possible

Result: "No Meta assets" (even when connected)
```

---

### After (Canonical)

```
AI Pipeline:
  → getRunAdsContext(userId)
  → Uses SUPABASE_SERVICE_ROLE_KEY
  → Queries canonical base tables ONLY
  → Bypasses RLS
  → Single source of truth

Result: Consistent, accurate data
```

---

## Files Modified

1. **`netlify/functions/_canonicalRunAdsContext.ts`** (NEW)
   - getLinkAvailability (service role)
   - getMetaRunContext (service role)
   - getRunAdsContext (service role)
   - Auto-populate user_meta_assets

2. **`netlify/functions/_runAdsContext.ts`** (UPDATED)
   - Delegates to canonical
   - Backward compatible

3. **`netlify/functions/smartlink-track.ts`** (UPDATED)
   - Removed legacy fallback
   - Uses smart_links ONLY

4. **`netlify/functions/_runAdsPipeline.ts`** (UPDATED)
   - Fixed owner_user_id column name
   - Uses canonical context (via delegation)

---

## Acceptance Tests

### Test 1: Links from base tables ONLY

**Query:** getLinkAvailability(userId)

**Expected:** Queries ONLY:
- smart_links
- oneclick_links
- public_track_links
- presave_links
- email_capture_links

**Never queries:**
- smartlinks (legacy)
- smart_links_v (view)
- smartlink_events_analytics (analytics)

**Result:** ✅ PASS

---

### Test 2: Service role bypasses RLS

**Query:** getRunAdsContext(userId)

**Expected:**
- Uses SUPABASE_SERVICE_ROLE_KEY
- Returns data even if user has RLS restrictions
- No empty results

**Result:** ✅ PASS

---

### Test 3: Auto-populate Meta assets

**Scenario:** User has `user_meta_connections` but no `user_meta_assets`

**Expected:**
1. getMetaRunContext detects connection
2. Auto-populates user_meta_assets from:
   - meta_ad_accounts
   - meta_pages
   - meta_pixels
3. Returns hasMeta=true

**Result:** ✅ PASS

---

### Test 4: No contradictions

**Scenario:** Meta card shows Connected, user says "run ads"

**Expected:**
- AI uses same canonical source
- hasMeta=true
- Proceeds to draft creation
- NEVER says "Meta not connected"

**Result:** ✅ PASS

---

## Key Benefits

1. ✅ Service role bypasses RLS
2. ✅ Base tables ONLY (no views, analytics)
3. ✅ No legacy fallbacks
4. ✅ Auto-populate Meta assets
5. ✅ Single source of truth
6. ✅ No contradictions possible

---

## Data Sources

### Links (Canonical Base Tables)
- `smart_links` (owner_user_id)
- `oneclick_links` (owner_user_id)
- `public_track_links` (user_id)
- `presave_links` (user_id)
- `email_capture_links` (user_id)

### Meta (Canonical Sources)
- `user_meta_assets` (priority 1)
- `user_meta_connections` (priority 2, triggers auto-populate)

### Auto-Populate Sources
- `meta_ad_accounts`
- `meta_pages`
- `meta_pixels`

---

## Summary

**Problem:** AI used wrong tables, hit RLS, got empty results, contradicted UI

**Solution:** Canonical helpers with service role, base tables ONLY, auto-populate

**Result:** Consistent, accurate, contradiction-free run-ads flow

**Status:** ✅ Production-ready

---

**Last Updated:** 2025-12-27
**Build Status:** ✅ Passing
