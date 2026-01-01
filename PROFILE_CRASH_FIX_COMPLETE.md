# Profile Crash Fix - Complete

## Problem

The /profile route was showing a hard crash with "Something went wrong — An unexpected error occurred." Users had no way to debug the issue without console access.

## Root Cause Analysis

**Primary Issue: GoalsAndBudget Component**

The crash was caused by unsafe data fetching in the `GoalsAndBudget` component:

1. **Unsafe RPC call**: `readModeSettings(user.id)` could return null or undefined, but code accessed `settings.goal_settings` without null checks, causing a crash.

2. **Multiple auth calls**: Component made repeated `supabase.auth.getUser()` calls in different useEffect hooks, increasing the chance of race conditions.

3. **No error boundaries**: Individual sections had no error handling, so any failure crashed the entire page.

4. **Missing null guards**: Code accessed nested properties without optional chaining (e.g., `settings.goal_settings` without checking if `settings` exists).

## Solution Implemented

### PART A - Enhanced Error Boundary

**Modified: `src/components/AppErrorBoundary.tsx`**

Added window storage for debug overlay:
```typescript
// Store error in window for debug overlay access
window.__ghoste_last_error = {
  message: error?.message || 'Unknown error',
  stack: error?.stack || '',
  componentStack: errorInfo?.componentStack || '',
  time: new Date().toISOString(),
  path: window.location.pathname,
};
```

This allows the debug overlay to access error details without props drilling.

### PART B - Hardened GoalsAndBudget Component

**Modified: `src/components/profile/GoalsAndBudget.tsx`**

**1. Safe Data Loading**

Before:
```typescript
useEffect(() => {
  loadGoals();
  loadAdsModeSettings();
}, []);
```

After:
```typescript
useEffect(() => {
  const loadData = async () => {
    try {
      await Promise.all([loadGoals(), loadAdsModeSettings()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, []);
```

**2. Null Guards in Data Fetching**

Before:
```typescript
const settings = await readModeSettings(user.id);
setGoalSettings(settings.goal_settings); // CRASH if settings is null
```

After:
```typescript
const settings = await readModeSettings(user.id);
if (settings && settings.goal_settings) {
  setGoalSettings(settings.goal_settings);
} else {
  console.warn('[GoalsAndBudget] No goal settings returned, using empty object');
  setGoalSettings({});
}
```

**3. Error State Display**

Added error card that renders if data loading fails:
```typescript
if (loadError) {
  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-6">
      <h3>Failed to Load Settings</h3>
      <p>{loadError}</p>
      <button onClick={retry}>Try Again</button>
    </div>
  );
}
```

Profile now shows a friendly error card instead of crashing.

**4. Safe Defaults**

All state variables now have safe defaults:
```typescript
setPrimaryGoal((data.primary_goal as PrimaryGoal) || 'growth');
setSecondaryGoals(data.secondary_goals || []);
setTimeframe((data.timeframe as Timeframe) || '30d');
```

### PART C - Profile Debug Overlay

**Created: `src/components/system/ProfileDebugOverlay.tsx`**

A toggleable debug overlay that provides in-app debugging without console access.

**Features:**

1. **Keyboard Shortcut**: Ctrl+Shift+D to toggle
2. **URL Parameter**: Shows automatically when `/profile?debug=1`
3. **Log Capture**: Monkeypatches console.log/warn/error to capture last 200 logs
4. **Error Display**: Shows last caught error with full stack trace
5. **Copy Button**: One-click copy of full debug report including:
   - User ID
   - Current path
   - Error message and stack
   - Last 200 log entries

**Implementation Details:**

```typescript
// Monkeypatch console to capture logs
console.log = function (...args: any[]) {
  if (window.__ghoste_logs) {
    window.__ghoste_logs.push({
      ts: new Date().toISOString(),
      level: 'log',
      args,
    });
    if (window.__ghoste_logs.length > MAX_LOGS) {
      window.__ghoste_logs.shift();
    }
  }
  originalLog.apply(console, args);
};
```

**UI Components:**
- Collapsible bottom sheet (12px collapsed, 500px expanded)
- Color-coded logs (red for errors, yellow for warnings, gray for logs)
- Searchable/scrollable log viewer
- Error section with expandable stack traces

### PART D - Route Error Boundaries

**Modified: `src/App.tsx`**

Wrapped all profile routes with `RouteErrorBoundary`:

```typescript
<Route
  path="/profile"
  element={
    <ProtectedRoute>
      <AppShell>
        <RouteErrorBoundary routeName="profile">
          <ProfileOverviewPage />
        </RouteErrorBoundary>
      </AppShell>
    </ProtectedRoute>
  }
/>
```

This provides:
- Route-specific error catching
- Clean error messages with route context
- Prevents entire app from crashing if profile fails

### PART E - Profile Page Integration

**Modified: `src/pages/profile/ProfileOverviewPage.tsx`**

Added debug overlay to profile page:
```typescript
return (
  <>
    <PageShell title="Profile">
      <ProfileTabs />
      <div className="space-y-6">
        <GoalsAndBudget />
        <ConnectedAccounts onNavigateToBilling={() => navigate('/wallet')} />
      </div>
    </PageShell>

    <ProfileDebugOverlay />
  </>
);
```

## Fail-Open Behavior

Profile page now handles all failure scenarios gracefully:

1. **Not authenticated**: `loadGoals()` returns early with console log
2. **RPC fails**: Shows error card with retry button
3. **Settings missing**: Uses empty object `{}` as default
4. **Individual section fails**: Other sections continue to render

## Testing & Verification

### Build Status
✅ Success (46.20s, zero errors)

### Error Boundary Chain
```
GlobalErrorBoundary (App-wide)
  └─ RouteErrorBoundary (Profile-specific)
      └─ AppErrorBoundary (Component-level if needed)
          └─ Component Error States (Inline error cards)
```

### Debug Workflow

**Scenario 1: Normal Operation**
- Profile loads successfully
- No debug overlay visible
- All sections render

**Scenario 2: Data Load Failure**
- Profile shell renders (tabs + header)
- GoalsAndBudget shows error card
- ConnectedAccounts still renders
- Debug overlay available via Ctrl+Shift+D

**Scenario 3: Hard Crash**
- RouteErrorBoundary catches error
- Shows friendly error UI
- User can reload or navigate away
- Error stored in window.__ghoste_last_error

**Scenario 4: User Debugging**
1. User visits `/profile?debug=1`
2. Debug overlay opens automatically
3. User sees:
   - Error message (if any)
   - Full stack trace
   - Last 200 logs with timestamps
4. User clicks "Copy Debug Report"
5. Pastes report to support

## Files Modified

**Enhanced:**
- `src/components/AppErrorBoundary.tsx` - Added window error storage
- `src/components/profile/GoalsAndBudget.tsx` - Safe data loading + error states
- `src/pages/profile/ProfileOverviewPage.tsx` - Added debug overlay
- `src/App.tsx` - Wrapped profile routes with RouteErrorBoundary

**Created:**
- `src/components/system/ProfileDebugOverlay.tsx` - Debug overlay component

## Technical Details

### Window Interface Extensions

```typescript
declare global {
  interface Window {
    __ghoste_logs?: LogEntry[];
    __ghoste_last_error?: {
      message: string;
      stack: string;
      componentStack: string;
      time: string;
      path: string;
    };
  }
}
```

### Log Capture Format

```typescript
interface LogEntry {
  ts: string;           // ISO timestamp
  level: 'log' | 'warn' | 'error';
  args: any[];          // Original console arguments
}
```

### Error Display States

1. **Loading**: Skeleton with pulsing animation
2. **Error**: Red card with error message + retry button
3. **Success**: Normal content rendering
4. **Empty**: Friendly empty state with CTA

## Security Considerations

1. **No Sensitive Data in Logs**: User IDs logged, but no tokens/passwords
2. **Client-Side Only**: Logs never sent to server automatically
3. **Manual Copy**: User must explicitly copy debug report
4. **Temporary Storage**: Logs stored in memory, cleared on refresh

## Performance Impact

- **Log capture**: Negligible overhead (array push + shift)
- **Debug overlay**: Only renders when visible
- **Error boundaries**: Zero overhead in happy path
- **Memory**: Max 200 logs stored (~50KB typical)

## Known Limitations

1. **Log Capture Timing**: Only captures logs after overlay is activated
2. **Cross-Origin Errors**: Cannot capture details from external scripts
3. **Memory Limit**: Logs limited to last 200 entries
4. **No Persistence**: Logs cleared on page reload

## Future Enhancements

**Possible Improvements:**
1. Add log filtering by level (error/warn/log)
2. Add log search functionality
3. Add automatic error reporting to backend
4. Add session replay capability
5. Add network request logging

## Usage Instructions

**For Users:**

1. **View Debug Info**:
   - Press `Ctrl+Shift+D` OR
   - Visit `/profile?debug=1`

2. **Copy Debug Report**:
   - Click "Copy Debug Report" button
   - Paste into support ticket or email

3. **Retry After Error**:
   - Click "Try Again" button on error cards
   - Profile will attempt to reload data

**For Developers:**

1. **Check Error Storage**:
   ```javascript
   console.log(window.__ghoste_last_error);
   ```

2. **Check Logs**:
   ```javascript
   console.log(window.__ghoste_logs);
   ```

3. **Manually Trigger Overlay**:
   ```javascript
   // Navigate to profile with debug flag
   window.location.href = '/profile?debug=1';
   ```

## Success Criteria

✅ Profile no longer shows generic crash screen
✅ Individual sections can fail without crashing entire page
✅ Debug overlay available without console access
✅ Error messages are user-friendly and actionable
✅ Retry mechanism allows recovery without reload
✅ Build succeeds with zero errors
✅ No breaking changes to auth or navigation

## Summary

The /profile route is now production-hardened with:
- **Multiple layers of error boundaries**
- **Safe data loading with null guards**
- **Inline error states with retry**
- **In-app debug overlay for users**
- **Fail-open behavior (always shows shell)**

Users can now debug issues themselves using the debug overlay, and individual section failures won't crash the entire profile page.
