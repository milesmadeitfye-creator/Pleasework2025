# Ads Publish Logging - COMPLETE

**Date**: 2025-12-31
**Status**: ✅ FULLY INSTRUMENTED

## Summary

Added comprehensive logging to ads publish flow to track exactly where failures occur and verify Meta IDs are being used correctly.

## What Was Added

### Enhanced Logging in run-ads-submit.ts

**1. Meta Status Check**
```
[run-ads-submit] ===== META STATUS RECEIVED =====
[run-ads-submit] metaStatus: {
  "ok": true,
  "auth_connected": true,
  "assets_configured": true,
  "missing_assets": [],
  "ad_account_id": "act_123456789",
  "page_id": "987654321",
  ...
}
[run-ads-submit] Ready checks: {
  hasAuth: true,
  hasAssets: true,
  hasAdAccount: true,
  hasPage: true,
  ad_account_id: "act_123456789",
  page_id: "987654321"
}
```

**2. Ready for Publish**
```
[run-ads-submit] ===== ✅ META READY FOR PUBLISH =====
[run-ads-submit] proceeding_to_meta_publish: {
  ad_account_id: "act_123456789",
  page_id: "987654321",
  instagram_actor_id: "17841400000000",
  pixel_id: "123456789012345",
  destination_url: "https://ghoste.one/l/abc123",
  daily_budget_cents: 5000,
  ad_goal: "link_clicks"
}
[run-ads-submit] Calling executeMetaCampaign with metaStatus...
```

**3. Execution Result**
```
[run-ads-submit] executeMetaCampaign result: {
  success: true,
  meta_campaign_id: "120212345678901",
  meta_adset_id: "120212345678902",
  meta_ad_id: "120212345678903",
  error: null
}
[run-ads-submit] ✅ Campaign published to Meta: {
  ghoste_id: "abc-123-uuid",
  meta_campaign_id: "120212345678901",
  meta_adset_id: "120212345678902",
  meta_ad_id: "120212345678903"
}
```

### Enhanced Logging in _metaCampaignExecutor.ts

**1. Campaign Start**
```
[executeMetaCampaign] ===== STARTING META CAMPAIGN EXECUTION =====
[executeMetaCampaign] campaign_id: abc-123-uuid
[executeMetaCampaign] Has metaStatus: true
```

**2. Asset Fetching**
```
[fetchMetaAssets] ===== FETCHING META ASSETS =====
[fetchMetaAssets] user_id: user-456-uuid
[fetchMetaAssets] Has metaStatus passed: true
[fetchMetaAssets] metaStatus received: {
  auth_connected: true,
  assets_configured: true,
  ad_account_id: "act_123456789",
  page_id: "987654321",
  instagram_actor_id: "17841400000000",
  pixel_id: "123456789012345"
}
[fetchMetaAssets] ✅ RPC validation passed - fetching access_token...
[fetchMetaAssets] ✅ Access token fetched successfully
[fetchMetaAssets] ===== ✅ ASSETS BUILT SUCCESSFULLY =====
[fetchMetaAssets] Final assets: {
  has_token: true,
  token_length: 256,
  ad_account_id: "act_123456789",
  page_id: "987654321",
  instagram_actor_id: "17841400000000",
  pixel_id: "123456789012345"
}
```

**3. Asset Load Success**
```
[executeMetaCampaign] ✅ Assets loaded successfully: {
  user_id: "user-456-uuid",
  has_token: true,
  ad_account_id: "act_123456789",
  page_id: "987654321",
  instagram_actor_id: "17841400000000",
  pixel_id: "123456789012345"
}
[executeMetaCampaign] Step 2/4: Creating Meta campaign...
```

## Error Scenarios

### If Meta Not Connected
```
[run-ads-submit] ===== META STATUS RECEIVED =====
[run-ads-submit] metaStatus: {
  "ok": true,
  "auth_connected": false,
  "assets_configured": false,
  "missing_assets": ["meta_oauth"]
}
[run-ads-submit] Ready checks: {
  hasAuth: false,
  hasAssets: false,
  hasAdAccount: false,
  hasPage: false
}
[run-ads-submit] ❌ Meta not ready for publish: {
  auth_connected: false,
  assets_configured: false,
  missing_assets: ["meta_oauth"],
  has_ad_account: false,
  has_page: false
}
```

### If Meta Auth Only (No Assets)
```
[run-ads-submit] ===== META STATUS RECEIVED =====
[run-ads-submit] metaStatus: {
  "ok": true,
  "auth_connected": true,
  "assets_configured": false,
  "missing_assets": ["ad_account_id", "page_id"]
}
[run-ads-submit] Ready checks: {
  hasAuth: true,
  hasAssets: false,
  hasAdAccount: false,
  hasPage: false
}
[run-ads-submit] ❌ Meta not ready for publish: {
  auth_connected: true,
  assets_configured: false,
  missing_assets: ["ad_account_id", "page_id"],
  has_ad_account: false,
  has_page: false
}
```

### If fetchMetaAssets Fails
```
[executeMetaCampaign] ===== STARTING META CAMPAIGN EXECUTION =====
[executeMetaCampaign] campaign_id: abc-123-uuid
[executeMetaCampaign] Has metaStatus: true
[executeMetaCampaign] Step 1/4: Fetching Meta assets...
[fetchMetaAssets] ===== FETCHING META ASSETS =====
[fetchMetaAssets] user_id: user-456-uuid
[fetchMetaAssets] Has metaStatus passed: true
[fetchMetaAssets] metaStatus received: {
  auth_connected: true,
  assets_configured: false,
  ...
}
[fetchMetaAssets] ❌ Meta not ready per RPC: {
  auth_connected: true,
  assets_configured: false,
  missing_assets: ["page_id"]
}
[executeMetaCampaign] ❌ fetchMetaAssets returned null
```

### If No Access Token in DB
```
[fetchMetaAssets] ✅ RPC validation passed - fetching access_token...
[fetchMetaAssets] ❌ No access token found in meta_credentials for user: user-456-uuid
[executeMetaCampaign] ❌ fetchMetaAssets returned null
```

## How to Use These Logs

### Testing Campaign Publish

1. **Open Browser DevTools Console** before clicking "Publish Campaign"
2. **Click "Publish Campaign"**
3. **Watch for logs** in this order:

```
✅ Expected Success Flow:
[run-ads-submit] ===== META STATUS RECEIVED =====
[run-ads-submit] metaStatus: {...}
[run-ads-submit] Ready checks: { all true }
[run-ads-submit] ===== ✅ META READY FOR PUBLISH =====
[run-ads-submit] proceeding_to_meta_publish: { IDs shown }
[run-ads-submit] Calling executeMetaCampaign with metaStatus...
[executeMetaCampaign] ===== STARTING META CAMPAIGN EXECUTION =====
[fetchMetaAssets] ===== FETCHING META ASSETS =====
[fetchMetaAssets] ===== ✅ ASSETS BUILT SUCCESSFULLY =====
[executeMetaCampaign] ✅ Assets loaded successfully
[executeMetaCampaign] Step 2/4: Creating Meta campaign...
[executeMetaCampaign] ✓ Created campaign: 120212345678901
[executeMetaCampaign] Step 3/4: Creating Meta ad set...
[executeMetaCampaign] ✓ Created adset: 120212345678902
[executeMetaCampaign] Step 4/4: Creating Meta ad...
[executeMetaCampaign] ✅ Full campaign published to Meta
[run-ads-submit] executeMetaCampaign result: { success: true, ... }
[run-ads-submit] ✅ Campaign published to Meta
```

### Debugging Failures

**If you see:**
```
[run-ads-submit] ❌ Meta not ready for publish
```
**Check:** The "Ready checks" log shows which condition failed

**If you see:**
```
[fetchMetaAssets] ❌ Meta not ready per RPC
```
**Check:** The RPC returned `assets_configured: false` - user needs to configure assets

**If you see:**
```
[fetchMetaAssets] ❌ No access token found
```
**Check:** Token is missing from `meta_credentials` table - user needs to reconnect Meta

**If you see:**
```
[executeMetaCampaign] Failed to create Meta campaign
```
**Check:** Meta API error - check permissions, ad account status, or rate limits

## Key Validation Points

### 1. RPC Check (run-ads-submit.ts:529-545)
- Validates `auth_connected === true`
- Validates `assets_configured === true`
- Validates `ad_account_id` present
- Validates `page_id` present

### 2. Asset Fetch (fetchMetaAssets:61-77)
- Confirms metaStatus passed
- Validates `auth_connected` and `assets_configured` again
- Shows exact asset IDs from RPC

### 3. Token Fetch (fetchMetaAssets:83-97)
- Fetches ONLY access_token from `meta_credentials`
- Verifies token exists

### 4. Asset Build (fetchMetaAssets:102-118)
- Combines RPC IDs + access_token
- Shows final asset object being used

## API Response Examples

### Success Response
```json
{
  "ok": true,
  "campaign_id": "abc-123-uuid",
  "campaign_type": "smart_link_probe",
  "confidence": 0.6,
  "confidence_label": "medium",
  "status": "published",
  "meta_campaign_id": "120212345678901",
  "meta_adset_id": "120212345678902",
  "meta_ad_id": "120212345678903"
}
```

### Failure Response (Not Ready)
```json
{
  "ok": false,
  "campaign_id": "abc-123-uuid",
  "error": "Meta assets not configured. Connect Meta in Profile → Connected Accounts.",
  "metaStatus": {
    "auth_connected": true,
    "assets_configured": false,
    "missing_assets": ["page_id"]
  }
}
```

## ads-debug-scan Output

After publish attempt, check `/.netlify/functions/ads-debug-scan`:

### Success
```json
{
  "operations": [
    {
      "label": "publish_start",
      "response": {
        "campaign_id": "abc-123-uuid",
        "stage": "starting_meta_publish",
        "meta_status": {
          "ad_account_id": "act_123456789",
          "page_id": "987654321"
        }
      },
      "ok": true
    },
    {
      "label": "publish_success",
      "response": {
        "ok": true,
        "meta_campaign_id": "120212345678901",
        "meta_adset_id": "120212345678902",
        "meta_ad_id": "120212345678903"
      },
      "ok": true
    }
  ]
}
```

### Failure
```json
{
  "operations": [
    {
      "label": "publish_failed_meta_not_ready",
      "response": {
        "ok": false,
        "error": "Meta assets not configured"
      },
      "ok": false
    }
  ]
}
```

## Build Status

✅ **Build passed** (32.69s)

All logging is now in place - ready to test campaign publish!

## Next Steps for Testing

1. Open browser DevTools Console
2. Ensure Meta is connected and assets configured
3. Click "Publish Campaign"
4. Watch console for log flow
5. If successful, verify Meta IDs in response
6. Check Meta Ads Manager for campaign
7. Run ads-debug-scan to see operation history

The logs will show exactly where any failure occurs!
