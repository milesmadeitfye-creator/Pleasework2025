# Meta Publishing Gating + Ads Publish Function Fix - COMPLETE

**Date**: 2026-01-01
**Status**: ✅ Complete
**Build**: Passing (43.69s)

---

## Summary

Fixed Meta publishing gating in `/studio/ads/drafts/:id` and hardened OnboardingChecklist checkComplete functions to prevent crashes from undefined Supabase responses.

**Root causes**:
1. OnboardingChecklist's checkComplete functions were accessing `.data.user` directly without proper error handling, leading to "Cannot read properties of undefined (reading 'data')" crashes
2. No client-side Meta connection status checking before publish attempts
3. No debug visibility into Meta connection state or publish errors

---

## Changes Made

### A) Created Client Helper: `src/lib/meta/getMetaStatus.ts`

**Purpose**: Single source of truth for Meta connection status on the client

**Key features**:
- Calls `get_meta_connection_status` RPC as authoritative data source
- Returns normalized `MetaConnectionStatus` object
- Never throws - always returns safe defaults on error
- Includes comprehensive logging for debugging

**Interface**:
```typescript
interface MetaConnectionStatus {
  auth_connected: boolean;
  assets_configured: boolean;
  ad_account_id: string | null;
  page_id: string | null;
  instagram_actor_id: string | null;
  pixel_id: string | null;
  missing_assets: string[] | null;
  error?: string;
}
```

**Usage**:
```typescript
import { getMetaStatus } from '@/lib/meta/getMetaStatus';

const metaStatus = await getMetaStatus(supabase);
if (!metaStatus.auth_connected) {
  // Handle not connected
}
if (!metaStatus.assets_configured) {
  // Show missing assets: metaStatus.missing_assets
}
```

---

### B) Fixed OnboardingChecklist checkComplete Crashes

**File**: `src/components/OnboardingChecklist.tsx`

**Changes**:
- Rewrote all 5 checkComplete functions with proper error handling
- Changed from `const { user } = await supabase.auth.getUser()` (unsafe)
- To `const { data: userData, error: userError } = await supabase.auth.getUser()` (safe)
- Added explicit error checking for both auth and query responses
- Wrapped each function in try/catch blocks with logging
- Never accesses `.data` on potentially undefined responses

**Fixed checklist items**:
1. smart-link
2. one-click-link
3. fan-broadcast
4. meta-connect
5. split-invite

**Before** (unsafe):
```typescript
checkComplete: async () => {
  const { user } = await supabase.auth.getUser(); // Can crash if response is undefined
  if (!user.data.user) return false; // Accessing .data without checking

  const { data } = await supabase.from('smart_links')... // Can crash if error
  return !!data;
}
```

**After** (safe):
```typescript
checkComplete: async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return false;

    const { data, error } = await supabase.from('smart_links')...
    if (error) {
      console.error('[OnboardingChecklist] Error:', error);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error('[OnboardingChecklist] Exception:', err);
    return false;
  }
}
```

---

### C) Fixed Meta Publish Gating in AdsDraftDetailPage

**File**: `src/pages/studio/AdsDraftDetailPage.tsx`

**Changes**:

1. **Imported getMetaStatus helper**:
```typescript
import { getMetaStatus, MetaConnectionStatus } from '../../lib/meta/getMetaStatus';
import { ChevronDown, ChevronUp } from 'lucide-react';
```

2. **Added state variables**:
```typescript
const [metaStatus, setMetaStatus] = useState<MetaConnectionStatus | null>(null);
const [showDebugPanel, setShowDebugPanel] = useState(false);
const [lastPublishError, setLastPublishError] = useState<{ code?: string; message: string } | null>(null);
```

3. **Added loadMetaStatus function**:
```typescript
async function loadMetaStatus() {
  console.log('[AdsDraftDetail] Loading Meta connection status...');
  const status = await getMetaStatus(supabase);
  setMetaStatus(status);
  console.log('[AdsDraftDetail] Meta status loaded:', status);
}
```

4. **Updated useEffect to load Meta status**:
```typescript
useEffect(() => {
  if (!user || !id) return;
  loadDraft();
  loadMetaStatus(); // Added
}, [user, id]);
```

5. **Enhanced approveDraft with pre-flight checks**:
```typescript
async function approveDraft() {
  // Check Meta connection status first (client-side pre-flight check)
  if (!metaStatus || !metaStatus.auth_connected) {
    alert('Meta is not connected. Please connect Meta in Profile → Connected Accounts first.');
    navigate('/profile/connected-accounts');
    return;
  }

  if (!metaStatus.assets_configured) {
    const missingList = metaStatus.missing_assets?.join(', ') || 'unknown assets';
    alert(`Meta assets are not fully configured. Missing: ${missingList}\n\nPlease complete your Meta setup in Profile → Connected Accounts.`);
    navigate('/profile/connected-accounts');
    return;
  }

  // ... rest of publish logic
}
```

6. **Added error capture**:
```typescript
if (!response.ok || !result.ok) {
  const errorMsg = result.error || `Publish failed (${response.status})`;
  setLastPublishError({
    code: result.code || `HTTP_${response.status}`,
    message: errorMsg,
  });
  throw new Error(errorMsg);
}
```

---

### F) Added Publish Debug Panel

**Location**: `src/pages/studio/AdsDraftDetailPage.tsx` (after error message section, before actions)

**Features**:
- Collapsible debug panel with blue indicator dot
- Shows Meta connection status in real-time:
  - Auth Connected (✓/✗)
  - Assets Configured (✓/✗)
  - Ad Account (✓/✗)
  - Facebook Page (✓/✗)
  - Pixel (✓/○ optional)
  - Instagram (✓/○ optional)
- Lists missing assets if any
- Shows last publish error with error code
- Actions:
  - "Refresh Meta Status" button
  - "Go to Connected Accounts" link

**UI Design**:
- Dark theme matching existing Ghoste aesthetic
- Collapsible with chevron icon
- Color-coded status indicators (green = configured, red = missing, gray = optional)
- Clear typography hierarchy
- Responsive layout

**Visual Example**:
```
┌─────────────────────────────────────────┐
│ ● Publish Debug Info                 ⌄ │
├─────────────────────────────────────────┤
│ META CONNECTION STATUS                  │
│ Auth Connected:        ✓ Yes            │
│ Assets Configured:     ✗ No             │
│ Ad Account:            ✓ Configured     │
│ Facebook Page:         ✗ Not set        │
│ Pixel:                 ○ Optional       │
│ Instagram:             ○ Optional       │
│ Missing Assets: page_id                 │
│                                         │
│ LAST PUBLISH ERROR                      │
│ Code: META_ASSETS_MISSING               │
│ Meta assets not configured...           │
│                                         │
│ Refresh Meta Status • Go to Connected   │
│                         Accounts        │
└─────────────────────────────────────────┘
```

---

## Server-Side Validation (Already Correct)

### D) ads-publish Function

**File**: `netlify/functions/ads-publish.ts`

**Status**: ✅ Already using canonical resolver correctly

The function already:
- Validates user JWT with Authorization header
- Uses `resolveMetaAssets()` from `_resolveMetaAssets.ts`
- Returns specific error codes: `META_NOT_CONNECTED`, `META_ASSETS_INCOMPLETE`, etc.
- Includes comprehensive `[ads-publish]` prefixed logging

No changes needed - the server-side validation was already correct.

---

### E) Client Publish Call Authorization

**File**: `src/pages/studio/AdsDraftDetailPage.tsx`

**Status**: ✅ Already sending Authorization header correctly

The fetch call already includes:
```typescript
const response = await fetch('/.netlify/functions/ads-publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`, // ✓ Correct
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ draft_id: draft.id, mode: 'PAUSED' }),
});
```

No changes needed.

---

## Testing Checklist

### Client-Side Pre-Flight Checks

- [ ] Navigate to `/studio/ads/drafts/:draft_id` when Meta is NOT connected
  - Expected: "Publish to Meta" button shows alert about Meta not connected
  - Expected: Redirects to `/profile/connected-accounts`

- [ ] Navigate to `/studio/ads/drafts/:draft_id` when Meta is connected but assets incomplete
  - Expected: Alert shows specific missing assets (e.g., "Missing: page_id, ad_account_id")
  - Expected: Redirects to `/profile/connected-accounts`

- [ ] Navigate to `/studio/ads/drafts/:draft_id` when Meta is fully configured
  - Expected: "Publish to Meta" button works
  - Expected: Campaign publishes successfully

### Debug Panel

- [ ] Click "Publish Debug Info" to expand panel
  - Expected: Shows Meta connection status with color-coded indicators

- [ ] Check debug panel when Meta NOT connected
  - Expected: Auth Connected = ✗ No (red)
  - Expected: Assets Configured = ✗ No (red)

- [ ] Check debug panel when Meta connected but incomplete
  - Expected: Auth Connected = ✓ Yes (green)
  - Expected: Assets Configured = ✗ No (red)
  - Expected: Shows missing assets list

- [ ] Check debug panel when Meta fully configured
  - Expected: All required items show green checkmarks
  - Expected: Optional items (Pixel, Instagram) show gray indicators

- [ ] Click "Refresh Meta Status"
  - Expected: Calls `loadMetaStatus()` again
  - Expected: Shows "Meta status refreshed" alert

- [ ] Click "Go to Connected Accounts"
  - Expected: Navigates to `/profile/connected-accounts`

### OnboardingChecklist Error Handling

- [ ] Load dashboard with checklist visible
  - Expected: No console errors
  - Expected: Checklist items show correct completion status

- [ ] Simulate Supabase connection error
  - Expected: Checklist items gracefully fail to false
  - Expected: Console logs show `[OnboardingChecklist] Error checking...` messages

- [ ] Complete a checklist item
  - Expected: Item shows green checkmark
  - Expected: Progress bar updates

---

## Files Changed

### Created
- `src/lib/meta/getMetaStatus.ts` - Canonical client-side Meta status checker

### Modified
- `src/pages/studio/AdsDraftDetailPage.tsx` - Added Meta gating, debug panel, error capture
- `src/components/OnboardingChecklist.tsx` - Hardened all checkComplete functions

### Verified (Already Correct)
- `netlify/functions/ads-publish.ts` - Server-side validation using canonical resolver
- `netlify/functions/_resolveMetaAssets.ts` - Canonical Meta asset resolver (RPC-based)

---

## Build Status

```bash
✓ built in 43.69s
```

No TypeScript errors, no ESLint errors, all files compiled successfully.

---

## Key Improvements

1. **Single Source of Truth**: `getMetaStatus()` helper uses RPC as authoritative source
2. **Client-Side Pre-Flight**: Checks Meta status BEFORE attempting publish
3. **Better Error Messages**: Shows specific missing assets instead of generic "not configured"
4. **Debug Visibility**: Collapsible panel shows real-time Meta connection state
5. **Crash Protection**: OnboardingChecklist no longer crashes on undefined Supabase responses
6. **Comprehensive Logging**: All functions log errors with `[ComponentName]` prefixes

---

## Next Steps (Optional Enhancements)

1. Add visual indicator on "Publish to Meta" button showing Meta connection status
2. Show Meta connection status in draft list view
3. Add auto-refresh of Meta status when returning from Connected Accounts page
4. Add toast notifications instead of alerts for better UX
5. Track publish attempts in analytics

---

**✅ All requirements (A-F) implemented in one pass as requested**
