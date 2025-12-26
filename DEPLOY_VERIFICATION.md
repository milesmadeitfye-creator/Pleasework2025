# Deploy Verification - Build Stamp System

## Summary

Implemented a build stamp system that changes on every build to guarantee fresh deploys are live.

## What Changed

### 1. Build Stamp Infrastructure

**Created**: `src/lib/buildStamp.ts`
- Exports `BUILD_STAMP` constant with timestamp
- Changes on every build: `DEPLOY_${timestamp}`
- Provides `getBuildInfo()` helper

### 2. Frontend Build Stamp

**Modified**: `src/components/ghoste/GhosteAIChat.tsx`
- Imports BUILD_STAMP
- Displays in header: "Build: [last 12 chars]"
- Visible on every page load
- Shows as small gray text in top-right corner

### 3. Function Build Stamps

**Modified**: `netlify/functions/ai-debug-setup.ts`
- Added BUILD_STAMP constant (generated at build time)
- Returns `buildStamp` in JSON response
- Visible in debug panel

**Modified**: `netlify/functions/ghosteAgent.ts`
- Added BUILD_STAMP constant (generated at build time)
- Added header comment to force rebuild
- Updated with JWT auth + setup status RPC

### 4. Debug Panel Enhancement

**Modified**: `src/components/ghoste/AIDebugPanel.tsx`
- Shows server build stamp prominently
- Green text to indicate "fresh deploy confirmed"
- Explanation text: "This confirms the function is deployed and fresh"

## Verification Steps

After deploy to production:

### Step 1: Check Frontend Build Stamp
1. Open https://ghoste.one/studio/ghoste-ai
2. Look at top-right header
3. Should see: "Build: [timestamp]" in small gray text
4. Screenshot the timestamp

### Step 2: Check Function Build Stamp
1. On same page, click "Debug" button
2. Click "Fetch Debug Data"
3. Look for "Server Build" section
4. Should show: `DEPLOY_[timestamp]` in green
5. Compare timestamp with frontend - they should match

### Step 3: Verify Authentication
1. In debug panel, check "Meta Connection" badge
2. Should show green checkmark if Meta is connected
3. Should show your user ID
4. Should NOT show any errors about "missing_auth"

### Step 4: Test AI Chat
1. Close debug panel
2. Send a message to Ghoste AI
3. Should receive response (not auth error)
4. Open browser DevTools → Network
5. Find `ghosteAgent` request
6. Check Request Headers - should have `Authorization: Bearer ...`
7. Response should be 200, not 401

## What to Look For

### ✅ Success Indicators
- Frontend shows build timestamp in header
- Debug panel shows matching server timestamp
- Meta connection badge shows correct status
- AI chat responds without auth errors
- ghosteAgent accepts Authorization header

### ❌ Failure Indicators
- Build stamp shows old timestamp (deploy didn't happen)
- "missing_auth" errors in responses
- 401 Unauthorized from ghosteAgent
- Meta shows "not connected" when it should be connected
- Debug panel can't fetch data

## Build Verification

Local build completed successfully:
```
✓ built in 34.40s
dist/assets/GhosteAI-CXkfvhhs.js  232.60 kB │ gzip: 66.43 kB
```

The bundle hash changed, confirming:
- BUILD_STAMP import compiled
- New code is bundled
- Functions will rebuild with new timestamps

## Netlify Config Verified

Checked `netlify.toml`:
- ✅ Build command: `npm ci && npm run build`
- ✅ Publish dir: `dist` (Vite output)
- ✅ Functions dir: `netlify/functions`
- ✅ Node bundler: `esbuild`
- ✅ SPA redirect: `/* → /index.html`
- ✅ Node version: 20

## Force Deploy Triggers

Changed files that guarantee fresh build:
1. `src/lib/buildStamp.ts` - NEW FILE with timestamp
2. `netlify/functions/ai-debug-setup.ts` - Added BUILD_STAMP
3. `netlify/functions/ghosteAgent.ts` - Added BUILD_STAMP + auth
4. `src/components/ghoste/GhosteAIChat.tsx` - Import BUILD_STAMP

Each file now contains a timestamp that changes on every `npm run build`.

## Rollback Plan

If deploy breaks:
1. Netlify auto-keeps previous deploy
2. In Netlify dashboard → Deploys → find previous deploy
3. Click "Publish deploy" on working version
4. Build stamps will revert to old timestamp
5. Confirms rollback worked

## Next Deploy Verification

On EVERY future deploy:
1. Check frontend build stamp changed
2. Check debug panel server stamp matches
3. Confirms new code is live
4. No more "is this the old build?" confusion

## Common Issues & Fixes

### Build stamp shows old timestamp
- Deploy didn't finish
- Browser cached old bundle
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

### Debug panel shows different timestamp
- Function didn't redeploy
- Netlify only rebuilds changed functions
- Touch the function file to force rebuild

### Auth errors after deploy
- Supabase credentials not set in Netlify
- Check Netlify env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Redeploy after setting env vars

## Files Modified

Frontend:
- ✅ `src/lib/buildStamp.ts` (NEW)
- ✅ `src/components/ghoste/GhosteAIChat.tsx`
- ✅ `src/components/ghoste/AIDebugPanel.tsx`
- ✅ `src/lib/ghosteAI/edgeClient.ts`

Functions:
- ✅ `netlify/functions/ai-debug-setup.ts`
- ✅ `netlify/functions/ghosteAgent.ts`

Config:
- ✅ `netlify.toml` (verified, no changes needed)

## Build Artifacts

Frontend bundle changed:
- Old: `GhosteAI-BE81bRNJ.js` (66.38 kB gzip)
- New: `GhosteAI-CXkfvhhs.js` (66.43 kB gzip)

Bundle hash change confirms new code.

## Success Criteria

Deploy is verified successful when:
1. ✅ Frontend build stamp shows new timestamp
2. ✅ Server build stamp matches frontend
3. ✅ AI chat accepts authenticated requests
4. ✅ Debug panel loads without errors
5. ✅ Meta connection status reflects reality

## Documentation

See also:
- `AI_AUTH_COMPLETE.md` - Auth implementation details
- `AI_DEBUG_SETUP_AUTH.md` - Debug endpoint auth flow
- `ZERO_SECRETS_GUARANTEE.md` - Security overview
