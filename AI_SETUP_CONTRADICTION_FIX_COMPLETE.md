# AI Setup Check Contradiction Fix - Complete

## Executive Summary

Fixed AI setup check contradictions where it would show "Meta page: Not connected / Pixel: Not connected / Smart links: None found" while simultaneously showing "Meta Ads Status: connected" with actual ad account/page/pixel IDs. The system now uses a single source of truth with profile fallbacks and never shows contradictory "Not connected" messages when assets exist.

## Problems Fixed

### 1. Contradictory "Not Connected" Messages
**BEFORE**: ❌
```
Meta page: Not connected
Pixel ID: Not connected
Smart links (ad destination URLs): None found

BUT ALSO:
Meta Ads Status: Your Meta account is connected
  Ad Account: act_123456789 (Default)
  Facebook Page: MyPage (1234567890)
  Meta Pixel: MyPixel (9876543210)
```

**AFTER**: ✅
```
Meta Assets (Resolved):
  ✅ AVAILABLE (source: meta_credentials)
  Ad Account: Default (act_123456789)
  Facebook Page: MyPage (1234567890)
  Pixel: MyPixel (9876543210)

Ad Destination:
  ✅ https://ghoste.one/s/million-talk
  [Using profile default - suggest creating smart link for tracking]
```

### 2. No Fallback for Assets
**BEFORE**: ❌
- If Meta OAuth connection dropped, AI would say "not connected"
- Even if user had working ad account/page/pixel IDs stored elsewhere

**AFTER**: ✅
- user_profiles now stores fallback IDs:
  - meta_ad_account_id
  - meta_page_id
  - meta_pixel_id
  - default_ad_destination_url
- RPC checks direct connections FIRST, then profile fallbacks
- Never shows "not connected" if ANY source has assets

### 3. No Canonical Resolved Assets
**BEFORE**: ❌
- AI had to guess which ad account/page/pixel to use
- No single source of truth for "what should we use for ads?"

**AFTER**: ✅
- RPC returns `resolved` object with canonical choices:
  - resolved.ad_account_id (the ONE to use)
  - resolved.page_id (the ONE to use)
  - resolved.pixel_id (the ONE to use)
  - resolved.destination_url (the ONE to use)

---

## Implementation Details

### A) Database Migration

**File**: `supabase/migrations/[timestamp]_ai_setup_status_with_profile_fallbacks.sql`

**Schema Changes:**
```sql
-- Added to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN meta_ad_account_id text;

ALTER TABLE public.user_profiles
ADD COLUMN meta_page_id text;

ALTER TABLE public.user_profiles
ADD COLUMN meta_pixel_id text;

ALTER TABLE public.user_profiles
ADD COLUMN default_ad_destination_url text;
```

**Purpose:**
- Stores fallback Meta configuration when direct OAuth isn't available
- Acts as profile defaults for users who set them manually
- Survives OAuth token expiration/revocation

**RLS Policies:**
```sql
-- Users can only see/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

### B) Updated ai_get_setup_status RPC

**Key Changes:**

1. **Fetch Profile Fallbacks**
```sql
-- Get profile fallback values
SELECT jsonb_build_object(
  'ad_account_id', meta_ad_account_id,
  'page_id', meta_page_id,
  'pixel_id', meta_pixel_id,
  'destination_url', default_ad_destination_url
)
INTO v_profile_fallback
FROM user_profiles
WHERE id = p_user_id;
```

2. **Resolve Assets (Connected > Fallback)**
```sql
-- Resolve ad account (connected > profile fallback)
IF jsonb_array_length(v_ad_accounts) > 0 THEN
  v_resolved_ad_account := v_ad_accounts->0->>'id';
ELSIF v_profile_fallback->>'ad_account_id' IS NOT NULL THEN
  v_resolved_ad_account := v_profile_fallback->>'ad_account_id';
  -- Add profile fallback to ad_accounts array with source tag
  v_ad_accounts := jsonb_build_array(
    jsonb_build_object(
      'id', v_profile_fallback->>'ad_account_id',
      'account_id', v_profile_fallback->>'ad_account_id',
      'name', 'Profile Default',
      'currency', 'USD',
      'source', 'profile_fallback'
    )
  );
END IF;
```

Same logic applies for page and pixel.

3. **Mark as has_meta if ANY Resolved Assets Exist**
```sql
-- Mark as "has_meta" if we have ANY resolved assets (connected OR profile fallbacks)
IF v_resolved_ad_account IS NOT NULL
   OR v_resolved_page IS NOT NULL
   OR v_resolved_pixel IS NOT NULL THEN
  v_has_meta := true;
  IF v_source_table IS NULL THEN
    v_source_table := 'profile_fallback';
  END IF;
END IF;
```

**Critical Change:** `has_meta` is now true if profile fallbacks provide assets, not just OAuth connections.

4. **Return Resolved Fields**
```sql
v_result := jsonb_build_object(
  'meta', jsonb_build_object(...),
  'smart_links_count', v_smart_links_count,
  'smart_links_preview', v_smart_links_preview,
  'resolved', jsonb_build_object(
    'ad_account_id', v_resolved_ad_account,
    'page_id', v_resolved_page,
    'pixel_id', v_resolved_pixel,
    'destination_url', v_resolved_destination
  )
);
```

**New Field:** `resolved` object contains the canonical asset IDs to use.

### C) Updated TypeScript (_aiSetupStatus.ts)

**Type Changes:**

```typescript
export interface AISetupStatus {
  meta: {
    connected: boolean;
    sourceTable: string | null;
    adAccounts: Array<{
      id: string;
      name: string;
      accountId: string;
      currency?: string;
      source?: string; // NEW: 'profile_fallback' tag
    }>;
    pages: Array<{
      id: string;
      name: string;
      category?: string;
      source?: string; // NEW: 'profile_fallback' tag
    }>;
    pixels: Array<{
      id: string;
      name: string;
      isAvailable: boolean;
      source?: string; // NEW: 'profile_fallback' tag
    }>;
    // ... instagram unchanged
  };
  smartLinks: {
    count: number;
    recent: Array<{...}>;
  };
  resolved: { // NEW FIELD
    adAccountId: string | null;
    pageId: string | null;
    pixelId: string | null;
    destinationUrl: string | null;
  };
  errors: string[];
}
```

**Prompt Formatting Changes:**

**BEFORE (formatSetupStatusForAI):**
```typescript
// Meta status
lines.push('Meta Connection:');
if (status.meta.connected) {
  lines.push(`  ✅ CONNECTED`);
  // ... list assets
} else {
  lines.push('  ❌ NOT CONNECTED'); // CONTRADICTION SOURCE
  lines.push('  → User must connect Meta');
}
```

**AFTER (formatSetupStatusForAI):**
```typescript
// RESOLVED ASSETS (single source of truth - no contradictions)
const hasResolvedAssets = Boolean(
  status.resolved.adAccountId ||
  status.resolved.pageId ||
  status.resolved.pixelId
);

lines.push('Meta Assets (Resolved):');
if (hasResolvedAssets) {
  lines.push(`  ✅ AVAILABLE (source: ${status.meta.sourceTable || 'profile_fallback'})`);

  if (status.resolved.adAccountId) {
    const acc = status.meta.adAccounts.find(a => a.id === status.resolved.adAccountId);
    const accName = acc?.name || 'Default';
    const accSource = acc?.source === 'profile_fallback' ? ' [from profile]' : '';
    lines.push(`  Ad Account: ${accName} (${status.resolved.adAccountId})${accSource}`);
  }

  // Same for page, pixel...
} else {
  lines.push('  ❌ NOT CONFIGURED'); // Only shown if NO assets exist
  lines.push('  → User must connect Meta in Profile → Connected Accounts');
}
```

**Key Differences:**
1. Uses `resolved` fields (canonical) instead of guessing from arrays
2. Shows "AVAILABLE" instead of "CONNECTED" (more accurate for fallbacks)
3. Tags profile fallbacks with `[from profile]`
4. Only shows "NOT CONFIGURED" if truly no assets exist

**Destination URL Section:**
```typescript
// Destination URL (resolved)
lines.push('Ad Destination:');
if (status.resolved.destinationUrl) {
  lines.push(`  ✅ ${status.resolved.destinationUrl}`);
  if (status.smartLinks.count === 0) {
    lines.push('  [Using profile default - suggest creating smart link for tracking]');
  } else {
    lines.push(`  [${status.smartLinks.count} smart links available]`);
  }
} else {
  lines.push('  ❌ NO DESTINATION');
  lines.push('  → User must create a smart link or set default_ad_destination_url');
}
```

**Critical AI Rules (Updated):**
```typescript
lines.push('CRITICAL AI RULES:');
lines.push(`  1. Meta assets available = ${hasResolvedAssets} (DO NOT contradict this)`);
lines.push(`  2. Destination URL = ${status.resolved.destinationUrl ? 'available' : 'missing'}`);
lines.push(`  3. If assets available AND destination exists, ads CAN be created`);
lines.push(`  4. NEVER say "not connected" if resolved assets exist (even from profile fallback)`);
lines.push(`  5. Source "${status.meta.sourceTable}" includes profile_fallback as valid`);
```

---

## Behavior Changes

### Scenario 1: OAuth Connected (No Changes)
```
Given:
  - meta_credentials: valid access_token
  - meta_ad_accounts: 1 row
  - meta_pages: 1 row
  - meta_pixels: 1 row

Before:
  ✅ CONNECTED (source: meta_credentials)
  Ad Account: MyAccount (act_123)
  Page: MyPage (page_456)
  Pixel: MyPixel (pixel_789)

After:
  ✅ AVAILABLE (source: meta_credentials)
  Ad Account: MyAccount (act_123)
  Facebook Page: MyPage (page_456)
  Pixel: MyPixel (pixel_789)

Result: SAME (just renamed "CONNECTED" → "AVAILABLE")
```

### Scenario 2: OAuth Expired + Profile Fallbacks (FIXED)
```
Given:
  - meta_credentials: expired/missing
  - user_profiles.meta_ad_account_id: act_123
  - user_profiles.meta_page_id: page_456
  - user_profiles.meta_pixel_id: pixel_789
  - user_profiles.default_ad_destination_url: https://ghoste.one/s/million-talk

Before:
  ❌ NOT CONNECTED
  → User must connect Meta
  [CONTRADICTION: Assets exist but shown as missing]

After:
  ✅ AVAILABLE (source: profile_fallback)
  Ad Account: Profile Default (act_123) [from profile]
  Facebook Page: Profile Default (page_456) [from profile]
  Pixel: Profile Default (pixel_789) [from profile]

  Ad Destination:
  ✅ https://ghoste.one/s/million-talk
  [Using profile default]

Result: FIXED - No more "not connected" lie
```

### Scenario 3: Truly Not Connected (Correct Before & After)
```
Given:
  - meta_credentials: none
  - user_profiles.meta_ad_account_id: null
  - user_profiles.meta_page_id: null
  - user_profiles.meta_pixel_id: null

Before:
  ❌ NOT CONNECTED
  → User must connect Meta

After:
  ❌ NOT CONFIGURED
  → User must connect Meta in Profile → Connected Accounts

Result: SAME (just renamed "NOT CONNECTED" → "NOT CONFIGURED")
```

---

## Files Modified

### 1. Database
**Migration**: `supabase/migrations/[timestamp]_ai_setup_status_with_profile_fallbacks.sql`
- Added 4 columns to user_profiles
- Updated ai_get_setup_status RPC function
- Added resolved asset logic
- Created index on Meta fields

### 2. TypeScript
**File**: `netlify/functions/_aiSetupStatus.ts`
- Added `resolved` field to AISetupStatus interface
- Added `source` field to adAccounts/pages/pixels
- Updated transformRPCResponse to handle new fields
- Completely rewrote formatSetupStatusForAI to use resolved fields
- Added logging for resolved assets

---

## Testing Checklist

### Test 1: OAuth Connected User
```sql
-- Setup
UPDATE user_profiles
SET meta_ad_account_id = NULL,
    meta_page_id = NULL,
    meta_pixel_id = NULL,
    default_ad_destination_url = NULL
WHERE id = 'user_uuid';

-- User has meta_credentials with valid token
-- Expected: Uses direct connection, shows "source: meta_credentials"
```

### Test 2: Profile Fallback User (CRITICAL)
```sql
-- Setup
DELETE FROM meta_credentials WHERE user_id = 'user_uuid';

UPDATE user_profiles
SET meta_ad_account_id = 'act_123456789',
    meta_page_id = '1234567890',
    meta_pixel_id = '9876543210',
    default_ad_destination_url = 'https://ghoste.one/s/million-talk'
WHERE id = 'user_uuid';

-- Expected:
-- ✅ AVAILABLE (source: profile_fallback)
-- Ad Account: Profile Default (act_123456789) [from profile]
-- NO "NOT CONNECTED" message
```

### Test 3: Mixed (Connected + Profile Override)
```sql
-- Setup
-- User has valid meta_credentials
-- But also has profile fallbacks

-- Expected:
-- Uses meta_credentials assets (direct connection wins)
-- Shows "source: meta_credentials"
-- Ignores profile fallbacks
```

### Test 4: Truly Not Connected
```sql
-- Setup
DELETE FROM meta_credentials WHERE user_id = 'user_uuid';

UPDATE user_profiles
SET meta_ad_account_id = NULL,
    meta_page_id = NULL,
    meta_pixel_id = NULL
WHERE id = 'user_uuid';

-- Expected:
-- ❌ NOT CONFIGURED
-- → User must connect Meta
```

---

## API Response Example

**Calling**: `GET /.netlify/functions/ai-setup-status`

**Before (Contradictory):**
```json
{
  "userId": "uuid",
  "setupStatus": {
    "meta": {
      "connected": true,
      "sourceTable": "meta_credentials",
      "adAccounts": [
        {"id": "act_123", "name": "MyAccount", "accountId": "act_123"}
      ],
      "pages": [
        {"id": "page_456", "name": "MyPage"}
      ],
      "pixels": []
    },
    "smartLinks": {"count": 0, "recent": []},
    "errors": []
  },
  "aiPrompt": "Meta Connection:\n  ✅ CONNECTED\n  Ad Accounts: 1\n...\nSmart Links:\n  ❌ NO SMART LINKS\n  → User must create a smart link\n  → Cannot create ads without a destination URL"
}
```

**Contradiction**: Says "NO SMART LINKS → Cannot create ads" but doesn't mention profile default_ad_destination_url.

**After (Resolved):**
```json
{
  "userId": "uuid",
  "setupStatus": {
    "meta": {
      "connected": true,
      "sourceTable": "profile_fallback",
      "adAccounts": [
        {
          "id": "act_123",
          "name": "Profile Default",
          "accountId": "act_123",
          "currency": "USD",
          "source": "profile_fallback"
        }
      ],
      "pages": [
        {
          "id": "page_456",
          "name": "Profile Default",
          "source": "profile_fallback"
        }
      ],
      "pixels": [
        {
          "id": "pixel_789",
          "name": "Profile Default",
          "isAvailable": true,
          "source": "profile_fallback"
        }
      ]
    },
    "smartLinks": {"count": 0, "recent": []},
    "resolved": {
      "adAccountId": "act_123",
      "pageId": "page_456",
      "pixelId": "pixel_789",
      "destinationUrl": "https://ghoste.one/s/million-talk"
    },
    "errors": []
  },
  "aiPrompt": "Meta Assets (Resolved):\n  ✅ AVAILABLE (source: profile_fallback)\n  Ad Account: Profile Default (act_123) [from profile]\n  Facebook Page: Profile Default (page_456) [from profile]\n  Pixel: Profile Default (pixel_789) [from profile]\n\nAd Destination:\n  ✅ https://ghoste.one/s/million-talk\n  [Using profile default - suggest creating smart link for tracking]"
}
```

**No Contradiction**: Shows assets are available, destination exists, suggests (but doesn't block) smart link creation.

---

## Priority Order

The system now uses this priority:

1. **Direct Meta Connection** (meta_credentials, meta_ad_accounts, meta_pages, meta_pixels)
   - Source: `meta_credentials` or `user_integrations`
   - Highest priority - if exists, use this

2. **Profile Fallbacks** (user_profiles.meta_*)
   - Source: `profile_fallback`
   - Used when direct connection missing/expired
   - Tagged with `[from profile]` in prompts

3. **Smart Links** (for destination URL only)
   - Used if no profile default_ad_destination_url
   - Not required (fallback exists)

4. **Nothing** (truly not connected)
   - Shows "NOT CONFIGURED"
   - Instructs user to connect

---

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 35.70s
✅ Secret Scan: PASSED
✅ Migration Applied: SUCCESS
```

---

## Success Metrics

### Before This Fix
- ❌ Contradictory messages ("not connected" + "connected")
- ❌ No fallback for expired OAuth
- ❌ AI confused about which assets to use
- ❌ No canonical resolved asset IDs
- ❌ Blocked users with valid profile config

### After This Fix
- ✅ Single source of truth (resolved fields)
- ✅ Profile fallbacks for expired OAuth
- ✅ AI always knows which assets to use
- ✅ Canonical resolved.* fields in response
- ✅ Users can set profile defaults manually
- ✅ No contradictions (uses resolved assets only)
- ✅ Clear source tags (profile_fallback vs direct)

---

## User Experience Impact

### For Users with Valid OAuth
- No change (same behavior)
- Just sees "AVAILABLE" instead of "CONNECTED"

### For Users with Expired OAuth + Profile Config
- **HUGE IMPROVEMENT**
- Before: Blocked, told "not connected"
- After: Works seamlessly with profile fallbacks
- AI uses profile defaults automatically

### For Users Setting Up for First Time
- Can now set profile defaults before OAuth
- Useful for testing/development
- Less friction in onboarding

---

## Rollback Plan

If profile fallbacks cause issues:

1. **Quick Fix**: Set all user_profiles Meta fields to NULL
   ```sql
   UPDATE user_profiles
   SET meta_ad_account_id = NULL,
       meta_page_id = NULL,
       meta_pixel_id = NULL,
       default_ad_destination_url = NULL;
   ```

2. **Revert Migration**: Drop columns from user_profiles
   ```sql
   ALTER TABLE user_profiles
   DROP COLUMN meta_ad_account_id,
   DROP COLUMN meta_page_id,
   DROP COLUMN meta_pixel_id,
   DROP COLUMN default_ad_destination_url;
   ```

3. **Revert RPC**: Restore old ai_get_setup_status function
   - Use git to restore previous migration file
   - Re-apply old version

4. **Revert TypeScript**: Remove resolved field handling
   - Restore old formatSetupStatusForAI logic
   - Remove resolved field from AISetupStatus type

---

## Conclusion

The AI setup check now provides a single, non-contradictory source of truth:

1. Uses `resolved` object for canonical asset IDs
2. Supports profile fallbacks for expired OAuth
3. Never shows "not connected" when assets exist (any source)
4. Tags profile fallbacks clearly with `[from profile]`
5. Prioritizes direct connections over fallbacks

**No more contradictions. No more "not connected" lies.**
