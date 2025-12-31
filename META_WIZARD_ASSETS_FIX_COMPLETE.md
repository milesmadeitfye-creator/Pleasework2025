# Meta Configure Assets Wizard - Complete Fix

## Status: COMPLETE

Fixed Meta Configure Assets wizard to reliably fetch and save Pages and Ad Accounts, ensuring selections persist to the database and show in RPC status.

---

## Problems Fixed

### 1. Pages and Ad Accounts Not Loading

**Issue**: Wizard steps showed "No pages found" and "No ad accounts found" even when user had access.

**Root Cause**: The wizard only loaded assets when a business was selected, but:
- Business selection is optional (user can skip)
- Business-scoped endpoints (`/business_id/owned_pages`) return empty if pages aren't owned by the business
- Without business, wizard never triggered asset fetch

**Previous Flow**:
```
1. User skips business selection (clicks "Continue Without Business")
2. Reaches "Select Facebook Page" step
3. useEffect depends on selectedBusiness (null)
4. useEffect never runs → pages never loaded
5. Shows "No pages found"
6. User blocked from completing wizard
```

### 2. Asset Names Not Showing in RPC

**Issue**: After saving, `get_meta_connection_status()` RPC returned null for `ad_account_name` and `page_name`.

**Root Cause**: RPC was looking for names in separate tables (`meta_ad_accounts`, `meta_pages`), but the wizard saves names to `meta_credentials` table.

**Previous RPC Logic**:
```sql
-- Only reads IDs from meta_credentials
SELECT ad_account_id, page_id
FROM meta_credentials

-- Then tries to get names from separate tables
SELECT name FROM meta_ad_accounts WHERE...
SELECT name FROM meta_pages WHERE...

-- Result: Names are null because wizard doesn't write to those tables
```

---

## Solutions Applied

### 1. Wizard Loads Assets On Step Entry (Not Business Selection)

**File**: `src/components/meta/MetaConnectWizard.tsx`

**Changed**: Pages and Ad Accounts load when their step becomes active, not when business is selected.

**Before** (Pages - Lines 164-183):
```typescript
// Load pages when business is selected
useEffect(() => {
  if (!selectedBusiness) return;  // ❌ Blocks if no business

  (async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedPages = await fetchMetaAssets<{ id: string; name: string }>('pages', {
        business_id: selectedBusiness.id,  // ❌ Always uses business scope
      });
      setPages(fetchedPages);
    } catch (err: any) {
      console.error('[MetaConnectWizard] Pages error:', err);
      setError(err.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  })();
}, [selectedBusiness]);  // ❌ Only runs when business changes
```

**After** (Pages - Lines 164-184):
```typescript
// Load pages when page step becomes active
useEffect(() => {
  if (currentStep !== 'page') return;  // ✅ Runs when step is active

  (async () => {
    try {
      setLoading(true);
      setError(null);
      // Pass business_id only if business was selected (optional)
      const params = selectedBusiness ? { business_id: selectedBusiness.id } : {};  // ✅ No business = no params
      const fetchedPages = await fetchMetaAssets<{ id: string; name: string }>('pages', params);
      setPages(fetchedPages);
      console.log('[MetaConnectWizard] Loaded pages:', fetchedPages.length,
        selectedBusiness ? `(business: ${selectedBusiness.id})` : '(no business - using /me/accounts)');
    } catch (err: any) {
      console.error('[MetaConnectWizard] Pages error:', err);
      setError(err.message || 'Failed to load pages');
    } finally {
      setLoading(false);
    }
  })();
}, [currentStep, selectedBusiness]);  // ✅ Runs when step changes OR business changes
```

**Before** (Ad Accounts - Lines 206-225):
```typescript
// Load ad accounts when business is selected
useEffect(() => {
  if (!selectedBusiness) return;  // ❌ Blocks if no business

  (async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedAdAccounts = await fetchMetaAssets<{ id: string; name: string }>('ad_accounts', {
        business_id: selectedBusiness.id,  // ❌ Always uses business scope
      });
      setAdAccounts(fetchedAdAccounts);
    } catch (err: any) {
      console.error('[MetaConnectWizard] Ad accounts error:', err);
      setError(err.message || 'Failed to load ad accounts');
    } finally {
      setLoading(false);
    }
  })();
}, [selectedBusiness]);  // ❌ Only runs when business changes
```

**After** (Ad Accounts - Lines 207-227):
```typescript
// Load ad accounts when ad account step becomes active
useEffect(() => {
  if (currentStep !== 'adAccount') return;  // ✅ Runs when step is active

  (async () => {
    try {
      setLoading(true);
      setError(null);
      // Pass business_id only if business was selected (optional)
      const params = selectedBusiness ? { business_id: selectedBusiness.id } : {};  // ✅ No business = no params
      const fetchedAdAccounts = await fetchMetaAssets<{ id: string; name: string }>('ad_accounts', params);
      setAdAccounts(fetchedAdAccounts);
      console.log('[MetaConnectWizard] Loaded ad accounts:', fetchedAdAccounts.length,
        selectedBusiness ? `(business: ${selectedBusiness.id})` : '(no business - using /me/adaccounts)');
    } catch (err: any) {
      console.error('[MetaConnectWizard] Ad accounts error:', err);
      setError(err.message || 'Failed to load ad accounts');
    } finally {
      setLoading(false);
    }
  })();
}, [currentStep, selectedBusiness]);  // ✅ Runs when step changes OR business changes
```

**Key Changes**:
1. ✅ Triggers on `currentStep` change, not just business selection
2. ✅ Passes empty params `{}` when no business (uses `/me/accounts` and `/me/adaccounts`)
3. ✅ Logs which source was used (business vs /me)
4. ✅ Re-runs if business is selected later

---

### 2. Enhanced meta-assets Endpoint with Ad Accounts Fallback

**File**: `netlify/functions/meta-assets.ts` (Lines 266-314)

**Added**: Fallback logic for ad_accounts (pages already had this from previous fix).

**Before**:
```typescript
// Fetch assets from Meta API
const items = await fetchMetaAssets(body.type, connection.access_token, {
  business_id: body.business_id,
  page_id: body.page_id,
  ad_account_id: body.ad_account_id,
});

// CRITICAL: Fallback for pages only
if (body.type === 'pages' && items.length === 0 && body.business_id) {
  console.log('[meta-assets] Business-scoped pages returned empty, falling back to /me/accounts');
  const fallbackItems = await fetchMetaAssets(body.type, connection.access_token, {});
  items = fallbackItems;
}

console.log(`[meta-assets] Fetched ${items.length} ${body.type}`);

return {
  statusCode: 200,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  body: JSON.stringify({ items, source: body.business_id ? 'business' : 'me/accounts' }),
};
```

**After**:
```typescript
// Fetch assets from Meta API
let items = await fetchMetaAssets(body.type, connection.access_token, {
  business_id: body.business_id,
  page_id: body.page_id,
  ad_account_id: body.ad_account_id,
});

// CRITICAL: Fallback for pages/ad_accounts - if business-scoped returns empty, try /me endpoints
// This handles cases where:
// 1. Business has no owned_pages / owned_ad_accounts
// 2. User has pages/accounts but they're personal, not business-owned
// 3. Business ID scope is too restrictive
// 4. No business ID provided (user skipped business selection)
if (body.type === 'pages' && items.length === 0 && body.business_id) {
  console.log('[meta-assets] Business-scoped pages returned empty, falling back to /me/accounts');
  const fallbackItems = await fetchMetaAssets(body.type, connection.access_token, {});
  console.log(`[meta-assets] Fallback fetched ${fallbackItems.length} pages from /me/accounts`);
  items = fallbackItems;
}

if (body.type === 'ad_accounts' && items.length === 0 && body.business_id) {
  console.log('[meta-assets] Business-scoped ad accounts returned empty, falling back to /me/adaccounts');
  const fallbackItems = await fetchMetaAssets(body.type, connection.access_token, {});
  console.log(`[meta-assets] Fallback fetched ${fallbackItems.length} ad accounts from /me/adaccounts`);
  items = fallbackItems;
}

// Determine source for logging
let source = 'unknown';
if (!body.business_id) {
  source = body.type === 'pages' ? 'me/accounts' : body.type === 'ad_accounts' ? 'me/adaccounts' : 'me';
} else if (items.length > 0) {
  source = 'business-scoped';
} else {
  source = body.type === 'pages' ? 'me/accounts' : body.type === 'ad_accounts' ? 'me/adaccounts' : 'fallback';
}

console.log(`[meta-assets] Fetched ${items.length} ${body.type}`, {
  user_id: user.id,
  type: body.type,
  count: items.length,
  source,
  business_id_provided: !!body.business_id,
});

return {
  statusCode: 200,
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  body: JSON.stringify({ items, source }),
};
```

**Key Changes**:
1. ✅ Added fallback for `ad_accounts` (same as pages)
2. ✅ Logs fallback usage with count
3. ✅ Returns `source` field in response for debugging
4. ✅ Enhanced logging includes user_id, type, count, source, business_id_provided

**Fallback Flow**:
```
No business selected:
  → GET /v20.0/me/accounts (pages)
  → GET /v20.0/me/adaccounts (ad accounts)

Business selected but empty:
  → Try /v20.0/{business_id}/owned_pages → empty
  → Fallback: GET /v20.0/me/accounts

  → Try /v20.0/{business_id}/owned_ad_accounts → empty
  → Fallback: GET /v20.0/me/adaccounts
```

---

### 3. RPC Reads Asset Names from meta_credentials

**Migration**: `meta_connection_read_names.sql`

**Problem**: Wizard saves names to `meta_credentials`, but RPC looks in `meta_ad_accounts` and `meta_pages` tables.

**Before** (Lines 136-154 of old RPC):
```sql
-- Get ad account name if configured
IF v_auth_connected AND v_ad_account_id IS NOT NULL THEN
  SELECT name
  INTO v_ad_account_name
  FROM meta_ad_accounts
  WHERE user_id = v_user_id
    AND (ad_account_id = v_ad_account_id OR account_id = v_ad_account_id)
  LIMIT 1;
END IF;

-- Get page name if configured
IF v_auth_connected AND v_page_id IS NOT NULL THEN
  SELECT name
  INTO v_page_name
  FROM meta_pages
  WHERE user_id = v_user_id
    AND meta_page_id = v_page_id
  LIMIT 1;
END IF;
```

**After** (Lines 72-91 of new RPC):
```sql
-- Check Meta credentials (read names from this table)
SELECT
  access_token IS NOT NULL AND access_token <> '',
  ad_account_id,
  ad_account_name,  -- ✅ Read name directly from meta_credentials
  page_id,
  COALESCE(page_name, facebook_page_name),  -- ✅ Read name with fallback
  instagram_actor_id,
  pixel_id,
  expires_at,
  updated_at
INTO
  v_has_token,
  v_ad_account_id,
  v_ad_account_name,  -- ✅ Populated from primary SELECT
  v_page_id,
  v_page_name,  -- ✅ Populated from primary SELECT
  v_instagram_actor_id,
  v_pixel_id,
  v_expires_at,
  v_last_updated
FROM meta_credentials
WHERE user_id = v_user_id;
```

**Fallback Logic** (Lines 136-161):
```sql
-- Fallback: Get names from separate tables if not in meta_credentials
IF v_auth_connected AND v_ad_account_id IS NOT NULL AND (v_ad_account_name IS NULL OR v_ad_account_name = '') THEN
  SELECT name
  INTO v_ad_account_name_fallback
  FROM meta_ad_accounts
  WHERE user_id = v_user_id
    AND (ad_account_id = v_ad_account_id OR account_id = v_ad_account_id)
  LIMIT 1;

  v_ad_account_name := COALESCE(v_ad_account_name, v_ad_account_name_fallback);
END IF;

IF v_auth_connected AND v_page_id IS NOT NULL AND (v_page_name IS NULL OR v_page_name = '') THEN
  SELECT name
  INTO v_page_name_fallback
  FROM meta_pages
  WHERE user_id = v_user_id
    AND meta_page_id = v_page_id
  LIMIT 1;

  v_page_name := COALESCE(v_page_name, v_page_name_fallback);
END IF;
```

**Key Changes**:
1. ✅ Reads `ad_account_name` directly from `meta_credentials` (primary source)
2. ✅ Reads `page_name` with `COALESCE(page_name, facebook_page_name)` (dual field support)
3. ✅ Falls back to separate tables only if name is null in `meta_credentials`
4. ✅ Uses `COALESCE` to prefer primary source, fallback to secondary

**Why This Works**:
```
Wizard save flow:
  1. User selects page: { id: "123", name: "My Page" }
  2. Wizard saves to meta_credentials:
     - page_id = "123"
     - page_name = "My Page"
     - facebook_page_name = "My Page"  (dual write)
  3. RPC reads from meta_credentials:
     - COALESCE(page_name, facebook_page_name) = "My Page" ✓

Old RPC flow (broken):
  1. RPC reads page_id from meta_credentials: "123"
  2. RPC looks for name in meta_pages table: not found
  3. RPC returns page_name = null ✗

New RPC flow (fixed):
  1. RPC reads page_id AND page_name from meta_credentials: "123", "My Page"
  2. RPC returns page_name = "My Page" ✓
```

---

## Fixed Flows

### Flow 1: User Skips Business Selection

**Before (Broken)**:
```
1. User opens Configure Assets wizard
2. Step 1: Select Business → clicks "Continue Without Business"
3. Step 2: Personal Profile → auto-loaded ✓
4. Step 3: Select Facebook Page
   - useEffect depends on selectedBusiness (null)
   - useEffect never runs
   - pages = []
   - Shows "No pages found"
5. ❌ User blocked, cannot proceed
```

**After (Fixed)**:
```
1. User opens Configure Assets wizard
2. Step 1: Select Business → clicks "Continue Without Business"
3. Step 2: Personal Profile → auto-loaded ✓
4. Step 3: Select Facebook Page
   - useEffect triggers (currentStep === 'page')
   - Calls meta-assets with { type: "pages" } (no business_id)
   - Endpoint fetches GET /me/accounts
   - Returns [{ id: "123", name: "My Page" }]
   - pages = [{ id: "123", name: "My Page" }]
   - Shows "My Page" ✓
5. User selects page
6. Step 4: Select Instagram Account → loads from selected page ✓
7. Step 5: Select Ad Account
   - useEffect triggers (currentStep === 'adAccount')
   - Calls meta-assets with { type: "ad_accounts" } (no business_id)
   - Endpoint fetches GET /me/adaccounts
   - Returns [{ id: "act_456", name: "My Ad Account" }]
   - Shows "My Ad Account" ✓
8. User selects ad account
9. Step 6: Tracking → optional
10. Step 7: Confirm → saves all selections ✓
```

### Flow 2: Business with No Owned Assets

**Before (Broken)**:
```
1. User selects Business: "My Business" (ID: 789)
2. Step 3: Select Facebook Page
   - useEffect triggers (selectedBusiness changed)
   - Calls meta-assets with { type: "pages", business_id: "789" }
   - Endpoint fetches GET /v20.0/789/owned_pages
   - Business has no owned pages → returns []
   - Shows "No pages found"
3. ❌ User blocked
```

**After (Fixed)**:
```
1. User selects Business: "My Business" (ID: 789)
2. Step 3: Select Facebook Page
   - useEffect triggers (currentStep === 'page' AND selectedBusiness present)
   - Calls meta-assets with { type: "pages", business_id: "789" }
   - Endpoint fetches GET /v20.0/789/owned_pages → []
   - Fallback triggers: GET /v20.0/me/accounts
   - Returns [{ id: "123", name: "My Page" }] ✓
   - Shows "My Page"
3. User completes wizard ✓
```

### Flow 3: RPC After Save

**Before (Broken)**:
```
User completes wizard, saves:
  - page_id: "123"
  - page_name: "My Page" → saved to meta_credentials
  - ad_account_id: "act_456"
  - ad_account_name: "My Ad Account" → saved to meta_credentials

Profile debug runs get_meta_connection_status():
  RPC reads page_id from meta_credentials: "123" ✓
  RPC looks for page_name in meta_pages table: not found
  RPC returns:
    page_id: "123"
    page_name: null ✗
    ad_account_id: "act_456"
    ad_account_name: null ✗
```

**After (Fixed)**:
```
User completes wizard, saves:
  - page_id: "123"
  - page_name: "My Page" → saved to meta_credentials
  - ad_account_id: "act_456"
  - ad_account_name: "My Ad Account" → saved to meta_credentials

Profile debug runs get_meta_connection_status():
  RPC reads from meta_credentials:
    page_id: "123"
    page_name: "My Page" ✓
    ad_account_id: "act_456"
    ad_account_name: "My Ad Account" ✓

  Returns:
    page_id: "123"
    page_name: "My Page" ✓
    ad_account_id: "act_456"
    ad_account_name: "My Ad Account" ✓
```

---

## Console Logging

### meta-assets.ts

**No Business**:
```
[meta-assets] Fetching pages from https://graph.facebook.com/v20.0/me/accounts
[meta-assets] Fetched 3 pages {
  user_id: "abc-123",
  type: "pages",
  count: 3,
  source: "me/accounts",
  business_id_provided: false
}
```

**Business with Fallback**:
```
[meta-assets] Fetching pages from https://graph.facebook.com/v20.0/{business_id}/owned_pages
[meta-assets] Business-scoped pages returned empty, falling back to /me/accounts
[meta-assets] Fallback fetched 3 pages from /me/accounts
[meta-assets] Fetched 3 pages {
  user_id: "abc-123",
  type: "pages",
  count: 3,
  source: "me/accounts",
  business_id_provided: true
}
```

**Ad Accounts with Fallback**:
```
[meta-assets] Fetching ad_accounts from https://graph.facebook.com/v20.0/{business_id}/owned_ad_accounts
[meta-assets] Business-scoped ad accounts returned empty, falling back to /me/adaccounts
[meta-assets] Fallback fetched 2 ad accounts from /me/adaccounts
[meta-assets] Fetched 2 ad_accounts {
  user_id: "abc-123",
  type: "ad_accounts",
  count: 2,
  source: "me/adaccounts",
  business_id_provided: true
}
```

### MetaConnectWizard.tsx

**Pages Step**:
```
[MetaConnectWizard] Loaded pages: 3 (no business - using /me/accounts)
```

**Ad Accounts Step**:
```
[MetaConnectWizard] Loaded ad accounts: 2 (no business - using /me/adaccounts)
```

**With Business**:
```
[MetaConnectWizard] Loaded pages: 3 (business: 789)
[MetaConnectWizard] Loaded ad accounts: 2 (business: 789)
```

---

## Files Changed

### Frontend
1. ✅ **`src/components/meta/MetaConnectWizard.tsx`**
   - Lines 164-184: Pages load on step entry, not business selection
   - Lines 207-227: Ad accounts load on step entry, not business selection
   - Added logging for source (business vs /me)

### Backend
2. ✅ **`netlify/functions/meta-assets.ts`**
   - Lines 266-314: Added ad accounts fallback (same as pages)
   - Enhanced logging with source tracking
   - Returns `source` field in response

### Database
3. ✅ **Migration**: `meta_connection_read_names.sql`
   - RPC now reads `ad_account_name` and `page_name` from `meta_credentials`
   - Falls back to separate tables if names are null
   - Uses `COALESCE` for robust field handling

---

## Testing Scenarios

### Scenario 1: No Business Selected

```
Given: User completes OAuth (auth_connected = true)
  And: User skips business selection

When: User reaches "Select Facebook Page" step

Then: ✅ useEffect triggers on currentStep change
  And: ✅ Calls meta-assets with { type: "pages" } (no business_id)
  And: ✅ Endpoint fetches GET /me/accounts
  And: ✅ Returns user's pages
  And: ✅ Wizard displays pages

When: User reaches "Select Ad Account" step

Then: ✅ useEffect triggers on currentStep change
  And: ✅ Calls meta-assets with { type: "ad_accounts" } (no business_id)
  And: ✅ Endpoint fetches GET /me/adaccounts
  And: ✅ Returns user's ad accounts
  And: ✅ Wizard displays ad accounts
```

### Scenario 2: Business with No Owned Assets

```
Given: User selects business with no owned_pages / owned_ad_accounts

When: User reaches "Select Facebook Page" step

Then: ✅ Tries GET /business_id/owned_pages → []
  And: ✅ Fallback triggers: GET /me/accounts
  And: ✅ Returns user's personal pages
  And: ✅ Wizard displays pages

When: User reaches "Select Ad Account" step

Then: ✅ Tries GET /business_id/owned_ad_accounts → []
  And: ✅ Fallback triggers: GET /me/adaccounts
  And: ✅ Returns user's ad accounts
  And: ✅ Wizard displays ad accounts
```

### Scenario 3: RPC After Save

```
Given: User completes wizard
  And: Saves page_id, page_name, ad_account_id, ad_account_name to meta_credentials

When: Profile debug runs get_meta_connection_status()

Then: RPC reads:
  ✅ page_id: "123" (from meta_credentials)
  ✅ page_name: "My Page" (from meta_credentials)
  ✅ ad_account_id: "act_456" (from meta_credentials)
  ✅ ad_account_name: "My Ad Account" (from meta_credentials)

And: Returns complete status:
  ✅ auth_connected: true
  ✅ assets_configured: true
  ✅ page_id: "123"
  ✅ page_name: "My Page"
  ✅ ad_account_id: "act_456"
  ✅ ad_account_name: "My Ad Account"
```

---

## Build Status

✅ Build succeeded in 31.50s
✅ TypeScript passed
✅ All Netlify functions compiled
✅ No new dependencies added
✅ Bundle size: Minimal increase (~0.29 kB)

**Changed Files**:
- `MetaConnectWizard.tsx`: Changed asset loading triggers (step-based vs business-based)
- `meta-assets.ts`: Added ad accounts fallback logic (+48 lines)
- `meta_connection_read_names.sql`: New migration (RPC reads names from meta_credentials)
- `ConnectedAccounts-mIfvlbIm.js`: 82.00 kB (was 81.71 kB, +0.29 kB)

---

## Summary

**What Was Fixed**:
1. ✅ Pages/Ad Accounts now load when step is active (not when business is selected)
2. ✅ Assets load even when no business is selected (uses /me endpoints)
3. ✅ Fallback to /me endpoints when business-scoped returns empty
4. ✅ RPC reads asset names from meta_credentials (where wizard saves them)
5. ✅ Enhanced logging tracks source (business vs /me vs fallback)

**How It Works Now**:
1. User opens Configure Assets wizard
2. Step 1: Business (optional, can skip)
3. Step 2: Personal Profile (auto-loaded)
4. Step 3: Select Facebook Page
   - Triggers when step becomes active
   - Uses /me/accounts if no business
   - Falls back to /me/accounts if business-scoped returns empty
5. Step 4: Select Instagram (linked to page)
6. Step 5: Select Ad Account
   - Triggers when step becomes active
   - Uses /me/adaccounts if no business
   - Falls back to /me/adaccounts if business-scoped returns empty
7. Step 6: Tracking (optional)
8. Step 7: Confirm → saves to meta_credentials
9. RPC reads IDs and names from meta_credentials
10. Profile debug shows complete status with names

**Key Insight**:
- Business selection is optional and should not block asset loading
- Business-scoped endpoints are too restrictive for most users
- User-scoped endpoints (/me/accounts, /me/adaccounts) are the reliable sources
- Wizard saves names to meta_credentials, RPC must read from there

Ready for deployment.
