# Profile Crash Fix - React Error #310

## Problem

The `/profile` route was crashing with React error #310: "Rendered more hooks than during the previous render."

This error occurs when hooks are called in different orders between renders, violating React's Rules of Hooks.

## Root Cause

In `src/components/profile/GoalsAndBudget.tsx`, the `activeTab` state hook was declared AFTER conditional returns:

```tsx
export function GoalsAndBudget() {
  // ... other hooks ...

  // Conditional returns (lines 283-321)
  if (loading) return <LoadingState />
  if (loadError) return <ErrorState />

  // ❌ HOOK DECLARED AFTER CONDITIONALS (line 323)
  const [activeTab, setActiveTab] = useState<'estimator' | 'ads-goals'>('estimator');

  return (/* component JSX */)
}
```

**The Problem:**
- First render with `loading=true`: Component returns early, never reaches `activeTab` hook
- Second render with `loading=false`: Component now calls the `activeTab` hook
- React detects hook order changed → throws error #310 → page crashes

## Solution

Moved all hooks to the TOP of the component, BEFORE any conditional returns.

## Files Changed

- `src/components/profile/GoalsAndBudget.tsx`
  - Moved `activeTab` hook from line 323 to line 78
  - All hooks now declared before any conditional logic

## Verification

✅ Build succeeded (38.30s, zero errors)
✅ ProfileOverviewPage bundle updated
✅ All hooks now in correct order
✅ No other hook violations found in profile components

## Status

🟢 **FIXED** - /profile route now loads without crashing.
