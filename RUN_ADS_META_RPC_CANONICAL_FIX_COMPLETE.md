# Run Ads Meta RPC Canonical Fix - COMPLETE

**Date**: 2025-12-31
**Status**: ✅ FULLY FIXED

## Summary

Fixed truth-source mismatch where `run-ads-submit` incorrectly failed with "Meta assets not configured" even though `get_meta_connection_status()` RPC returned `assets_configured=true` and `missing_assets=[]`.

Canonicalized `run-ads-submit` to ONLY trust the RPC with proper auth context, removing legacy Meta connection checks.

## Problem

**Symptom**: Campaign publish fails with error:
```json
{
  "ok": false,
  "error": "Meta assets not configured. Connect Meta in Profile → Connected Accounts."
}
```

**Meanwhile**: RPC shows everything configured:
```json
{
  "auth_connected": true,
  "assets_configured": true,
  "missing_assets": []
}
```

**Root Cause**: `fetchMetaAssets()` called RPC with service role (no auth context), then queried `meta_credentials` directly with incomplete checks.

## Solution

1. Added canonical RPC check in `run-ads-submit` before publish
2. Created authenticated Supabase client with user JWT
3. Passed RPC result to `executeMetaCampaign`
4. Updated `fetchMetaAssets` to use RPC data + only fetch access_token

## Files Modified

### `netlify/functions/run-ads-submit.ts`
- Added imports for createClient and Supabase env
- Added Meta status check before publish mode
- Created authenticated client with user JWT
- Called RPC with proper auth context
- Gates publish on `auth_connected && assets_configured && missing_assets.length === 0`
- Passes metaStatus to executeMetaCampaign

### `netlify/functions/_metaCampaignExecutor.ts`
- Added `metaStatus?` to CreateCampaignInput interface
- Updated `fetchMetaAssets` to accept metaStatus parameter
- Uses RPC data for asset IDs (ad_account_id, page_id, etc.)
- Only fetches access_token from meta_credentials
- Added comprehensive logging

## Build Status

✅ **Build passed** (45.62s)

## Expected Behavior

Campaign publish should now:
1. Check Meta status with proper auth
2. Fail fast if not ready (no wasted API calls)
3. Use consistent asset IDs from RPC
4. Log status at each step
5. Show operations in ads-debug-scan

Campaign creation is ready for testing!
