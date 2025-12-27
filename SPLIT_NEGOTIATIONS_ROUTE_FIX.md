# Split Negotiations Route Fix - COMPLETE

## Problem
The green "Open Negotiation" button in the Split Negotiations page was navigating to `/splits/${negotiation.id}`, which doesn't exist as a route, causing a 404 error.

Additionally, several other components were navigating to `/split-negotiations`, which also doesn't exist.

---

## Root Cause
Multiple navigation issues:

1. **"Open Negotiation" button** (`SplitNegotiations.tsx:1110`):
   - Tried to navigate to `/splits/${negotiation.id}`
   - No such route exists in App.tsx

2. **After creating negotiation** (`SplitNegotiations.tsx:346`):
   - Tried to navigate to `/splits/${result.negotiation.id}`
   - No such route exists

3. **Back buttons** in error/completion states:
   - `ContractReview.tsx` (2 instances): navigated to `/split-negotiations`
   - `SplitNegotiationView.tsx` (3 instances): navigated to `/split-negotiations`
   - Correct route is `/studio/splits`

---

## Solution

### 1. Fixed "Open Negotiation" Button
**File:** `src/components/SplitNegotiations.tsx`

**Before:**
```tsx
<button onClick={() => navigate(`/splits/${negotiation.id}`)}>
  Open Negotiation
</button>
```

**After:**
```tsx
<button onClick={() => openMessagesModal(negotiation)}>
  Open Negotiation
</button>
```

**Rationale:**
- The component already has modals for managing participants and viewing messages
- "Open Negotiation" should open the messages/thread modal (same as "View Thread / Offers")
- This keeps users on the same page without requiring a new route

### 2. Fixed Post-Creation Navigation
**File:** `src/components/SplitNegotiations.tsx`

**Before:**
```tsx
if (result.negotiation?.id) {
  navigate(`/splits/${result.negotiation.id}`);
} else {
  // Fallback: refresh list
  setNegotiations((prev) => [result.negotiation, ...prev]);
  setShowModal(false);
}
```

**After:**
```tsx
// Close modal and refresh list
if (result.negotiation) {
  setNegotiations((prev) => [result.negotiation, ...prev]);
}
setShowModal(false);
```

**Rationale:**
- Removed broken navigation
- Always use the fallback behavior: refresh list and close modal
- Better UX: user stays on splits page and sees new negotiation in list

### 3. Fixed All `/split-negotiations` References
**Files Updated:**
- `src/pages/ContractReview.tsx` (2 instances)
- `src/pages/SplitNegotiationView.tsx` (3 instances)

**Before:**
```tsx
navigate('/split-negotiations')
```

**After:**
```tsx
import { ROUTES } from '../lib/routes';
// ...
navigate(ROUTES.studioSplits)
```

**Rationale:**
- Used centralized ROUTES constant
- Prevents future typos and route mismatches
- Correct route is `/studio/splits` (from `ROUTES.studioSplits`)

---

## Files Modified

### 1. `src/components/SplitNegotiations.tsx`
- Added import: `import { ROUTES } from '../lib/routes';`
- Line 1110: Changed navigate to `openMessagesModal(negotiation)`
- Lines 345-358: Removed broken navigation, kept modal close + list refresh

### 2. `src/pages/ContractReview.tsx`
- Added import: `import { ROUTES } from '../lib/routes';`
- Line 128: Changed `/split-negotiations` to `ROUTES.studioSplits`
- Line 145: Changed `/split-negotiations` to `ROUTES.studioSplits`

### 3. `src/pages/SplitNegotiationView.tsx`
- Added import: `import { ROUTES } from '../lib/routes';`
- Line 318: Changed `/split-negotiations` to `ROUTES.studioSplits`
- Line 346: Changed `/split-negotiations` to `ROUTES.studioSplits`
- Line 363: Changed `/split-negotiations` to `ROUTES.studioSplits`

---

## Existing Routes (No Changes Needed)

The actual Split Negotiations page route is defined in `src/App.tsx`:

```tsx
<Route path="/studio/splits" element={
  <ProtectedRoute>
    <AppShell>
      <SplitsPage />
    </AppShell>
  </ProtectedRoute>
} />
```

**Canonical Route:** `/studio/splits`  
**ROUTES Constant:** `ROUTES.studioSplits`

No new routes were added - all fixes use the existing `/studio/splits` route.

---

## Testing Checklist

### Manual Tests
- [x] Click "Open Negotiation" green button → Opens messages modal (no navigation)
- [x] Create new split negotiation → Modal closes, list refreshes (no navigation)
- [x] Error state in ContractReview → "Back" button navigates to `/studio/splits`
- [x] Error state in SplitNegotiationView → "Back" button navigates to `/studio/splits`
- [x] Complete negotiation → Navigates to `/studio/splits`
- [x] Direct navigation to `/studio/splits` → Works (unchanged)

### Build
- [x] TypeScript compiles without errors
- [x] Build succeeds
- [x] Bundle size: 53.29 kB (9.81 kB gzipped) for SplitsPage
- [x] No console errors expected

---

## Benefits

1. **No More 404s:**
   - "Open Negotiation" button now works
   - All back buttons navigate to correct route

2. **Consistent Navigation:**
   - All split-related navigation uses `ROUTES.studioSplits`
   - Centralized route constant prevents typos

3. **Better UX:**
   - "Open Negotiation" opens modal instead of navigating
   - Users stay on splits page when creating negotiations
   - Consistent with existing modal pattern (Manage Participants, View Thread)

4. **Maintainable:**
   - If route changes in future, only update `ROUTES.studioSplits`
   - All navigation automatically uses new route

---

## Summary

Fixed broken navigation for the Split Negotiations feature:

**Issue:** Green "Open Negotiation" button caused 404 by navigating to non-existent `/splits/:id` route.

**Fix:** Changed button to open the messages modal (same behavior as "View Thread / Offers"), keeping users on the splits page.

**Bonus:** Fixed all other broken navigation to `/split-negotiations` (non-existent route) to use correct `/studio/splits` route via ROUTES constant.

Build successful: 38.5s  
No new routes added  
All navigation now works correctly
