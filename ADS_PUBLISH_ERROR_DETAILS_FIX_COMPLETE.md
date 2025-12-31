# Ads Publish - Full Meta Error Details - COMPLETE

**Date**: 2025-12-31
**Status**: ✅ PRODUCTION READY

## Summary

Enhanced ads publish flow to return **full Meta Graph API error details** instead of generic "Check ad account permissions" messages. Now captures exact error codes, subcodes, messages, and diagnostic info.

## What Was Implemented

### 1. Meta Request Helper (`_metaCampaignExecutor.ts`)

Created `metaRequest<T>()` helper function that:
- Handles all Meta Graph API calls uniformly
- Captures full error objects from Meta responses
- Throws detailed errors with complete Graph API error structure
- Supports GET and POST methods
- **NEVER logs access tokens** (security safe)

```typescript
interface MetaGraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_user_title?: string;
  error_user_msg?: string;
  [key: string]: any;
}
```

### 2. Enhanced MetaExecutionResult Interface

Updated to include:
```typescript
interface MetaExecutionResult {
  success: boolean;
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  error?: string;
  meta_error?: MetaGraphError;      // NEW: Full Graph error
  stage?: string;                    // NEW: Which step failed
  meta_permissions?: any;            // NEW: Diagnostic data
  ad_account_info?: any;             // NEW: Ad account status
}
```

### 3. Diagnostic Calls Before Campaign Creation

Before attempting to create a campaign, the system now checks:

**Permissions Check:**
```
GET /me/permissions
```
Returns what permissions the token has (ads_management, pages_read_engagement, etc.)

**Ad Account Health Check:**
```
GET /${ad_account_id}?fields=account_status,disable_reason,spend_cap,amount_spent,currency,name
```
Returns:
- `account_status`: ACTIVE, DISABLED, etc.
- `disable_reason`: Why account was disabled (if applicable)
- `spend_cap`: Spending limits
- `amount_spent`: Current spend
- `currency`: Account currency
- `name`: Account name

Both diagnostics are **non-blocking** - if they fail, execution continues but errors are captured.

### 4. Refactored Meta API Calls

All three creation functions now use `metaRequest()` and throw detailed errors:

**createMetaCampaign():**
- Throws if campaign creation fails
- Error includes code, subcode, fbtrace_id

**createMetaAdSet():**
- Throws if adset creation fails
- Error includes targeting issues, budget problems, etc.

**createMetaAd():**
- Throws if ad/creative creation fails
- Error includes creative validation issues, policy violations, etc.

### 5. Enhanced Error Handling in executeMetaCampaign

Each step wrapped in try/catch:

```typescript
try {
  campaign = await createMetaCampaign(...);
} catch (campaignErr) {
  return {
    success: false,
    error: 'Meta Graph error during campaign creation',
    meta_error: JSON.parse(campaignErr.message),
    stage: 'create_campaign',
    meta_permissions,
    ad_account_info,
  };
}
```

Similar handling for:
- `stage: 'create_adset'`
- `stage: 'create_ad'`

### 6. Enhanced Error Logging in run-ads-submit

When Meta execution fails:

```typescript
console.error('[run-ads-submit] ===== ❌ META EXECUTION FAILED =====');
console.error('[run-ads-submit] Error:', metaResult.error);
console.error('[run-ads-submit] Stage:', metaResult.stage);
console.error('[run-ads-submit] Meta Graph Error:', JSON.stringify(metaResult.meta_error, null, 2));
console.error('[run-ads-submit] Permissions:', metaResult.meta_permissions);
console.error('[run-ads-submit] Ad Account Info:', metaResult.ad_account_info);
```

### 7. Enhanced API Response

Error responses now include full details:

```json
{
  "ok": false,
  "campaign_id": "abc-123-uuid",
  "error": "Meta Graph error during campaign creation",
  "meta_error": {
    "message": "Invalid parameter",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 1487124,
    "fbtrace_id": "AaBC123xyz",
    "error_user_title": "Invalid Ad Account",
    "error_user_msg": "The ad account you're trying to use is disabled."
  },
  "stage": "create_campaign",
  "meta_campaign_id": null,
  "meta_adset_id": null,
  "meta_permissions": {
    "data": [
      { "permission": "ads_management", "status": "granted" },
      { "permission": "pages_read_engagement", "status": "granted" }
    ]
  },
  "ad_account_info": {
    "account_status": 2,
    "disable_reason": 1,
    "name": "My Ad Account",
    "currency": "USD",
    "amount_spent": "0"
  }
}
```

## Error Stages

The `stage` field indicates exactly where the failure occurred:

| Stage | Description |
|-------|-------------|
| `create_campaign` | Campaign creation failed (e.g., invalid objective, account disabled) |
| `create_adset` | AdSet creation failed (e.g., invalid budget, targeting issues) |
| `create_ad` | Ad/Creative creation failed (e.g., creative policy violation, missing assets) |
| `unknown` | Unexpected error outside normal flow |

## Common Meta Error Codes

Now captured and returned:

| Code | Subcode | Meaning |
|------|---------|---------|
| 100 | - | Invalid parameter |
| 190 | - | Access token expired |
| 200 | - | Missing permissions |
| 368 | - | Temporarily blocked for policies violating |
| 2635 | 1487124 | Ad account disabled |
| 2635 | 1487534 | Ad account closed |
| 80004 | - | Too many API calls |

## Example Error Scenarios

### Scenario 1: Disabled Ad Account

**Console Output:**
```
[executeMetaCampaign] ===== STARTING META CAMPAIGN EXECUTION =====
[executeMetaCampaign] Running diagnostic checks...
[executeMetaCampaign] ✅ Permissions: { data: [...] }
[executeMetaCampaign] ✅ Ad Account Info: { account_status: 2, disable_reason: 1 }
[executeMetaCampaign] Step 2/4: Creating Meta campaign...
[createMetaCampaign] Creating campaign with objective: OUTCOME_TRAFFIC
[metaRequest] Meta Graph API Error: {
  path: '/act_123456789/campaigns',
  method: 'POST',
  status: 400,
  error: {
    message: 'The ad account you're trying to use is disabled',
    type: 'OAuthException',
    code: 100,
    error_subcode: 1487124,
    fbtrace_id: 'AaBCxyz123'
  }
}
[executeMetaCampaign] ❌ Campaign creation failed
```

**API Response:**
```json
{
  "ok": false,
  "error": "Meta Graph error during campaign creation",
  "stage": "create_campaign",
  "meta_error": {
    "message": "The ad account you're trying to use is disabled",
    "type": "OAuthException",
    "code": 100,
    "error_subcode": 1487124,
    "fbtrace_id": "AaBCxyz123"
  },
  "ad_account_info": {
    "account_status": 2,
    "disable_reason": 1
  }
}
```

### Scenario 2: Invalid Budget (AdSet Creation)

**Console Output:**
```
[executeMetaCampaign] ✓ Created campaign: 120212345678901
[executeMetaCampaign] Step 3/4: Creating Meta ad set...
[createMetaAdSet] Creating adset for campaign: 120212345678901
[metaRequest] Meta Graph API Error: {
  error: {
    message: 'Daily budget must be at least $5.00',
    type: 'FacebookApiException',
    code: 100,
    error_subcode: 1487390
  }
}
[executeMetaCampaign] ❌ AdSet creation failed
```

**API Response:**
```json
{
  "ok": false,
  "error": "Meta Graph error during adset creation",
  "stage": "create_adset",
  "meta_campaign_id": "120212345678901",
  "meta_error": {
    "message": "Daily budget must be at least $5.00",
    "code": 100,
    "error_subcode": 1487390
  }
}
```

### Scenario 3: Missing Permissions

**Console Output:**
```
[executeMetaCampaign] ⚠️ Could not fetch permissions: {
  "message": "Missing required permission",
  "type": "OAuthException",
  "code": 200
}
[executeMetaCampaign] Step 2/4: Creating Meta campaign...
[metaRequest] Meta Graph API Error: {
  error: {
    message: "Requires ads_management permission",
    code: 200
  }
}
```

**API Response:**
```json
{
  "ok": false,
  "error": "Meta Graph error during campaign creation",
  "stage": "create_campaign",
  "meta_error": {
    "message": "Requires ads_management permission",
    "code": 200
  },
  "meta_permissions": {
    "error": {
      "message": "Missing required permission",
      "code": 200
    }
  }
}
```

## Security Notes

**Token Safety:**
- Access tokens are **NEVER logged** to console
- Request bodies are **NOT logged** (they contain tokens)
- Only error objects are logged (no sensitive data)
- API responses **DO NOT include tokens**

## Testing Instructions

### 1. View Full Error in Console

```javascript
// In DevTools Console, trigger publish
// You'll see detailed errors like:

[run-ads-submit] ===== ❌ META EXECUTION FAILED =====
[run-ads-submit] Error: Meta Graph error during campaign creation
[run-ads-submit] Stage: create_campaign
[run-ads-submit] Meta Graph Error: {
  "message": "The ad account you're trying to use is disabled",
  "type": "OAuthException",
  "code": 100,
  "error_subcode": 1487124,
  "fbtrace_id": "AaBCxyz123",
  "error_user_title": "Account Disabled",
  "error_user_msg": "Your ad account has been disabled..."
}
[run-ads-submit] Permissions: { data: [...] }
[run-ads-submit] Ad Account Info: {
  "account_status": 2,
  "disable_reason": 1,
  "name": "My Ad Account"
}
```

### 2. Check API Response

Publish endpoint now returns:
```json
{
  "ok": false,
  "error": "Meta Graph error during campaign creation",
  "meta_error": { /* Full error object */ },
  "stage": "create_campaign",
  "meta_permissions": { /* Diagnostic data */ },
  "ad_account_info": { /* Account health */ }
}
```

### 3. Verify ads_operations Table

After publish failure, check:
```sql
SELECT * FROM ads_operations
WHERE label = 'publish_failed'
ORDER BY created_at DESC
LIMIT 1;
```

The `response` JSON column should contain:
- `meta_error` with full Graph error
- `stage` indicating where it failed
- `meta_permissions` and `ad_account_info`

## Build Status

✅ **Build passed** (37.85s)

All TypeScript types correct, no errors.

## Benefits

### Before This Fix:
```json
{
  "ok": false,
  "error": "Failed to create Meta campaign. Check ad account permissions."
}
```
**Problem:** Generic, unhelpful, no debugging info

### After This Fix:
```json
{
  "ok": false,
  "error": "Meta Graph error during campaign creation",
  "stage": "create_campaign",
  "meta_error": {
    "message": "The ad account you're trying to use is disabled",
    "code": 100,
    "error_subcode": 1487124,
    "fbtrace_id": "AaBCxyz123",
    "error_user_title": "Account Disabled"
  },
  "ad_account_info": {
    "account_status": 2,
    "disable_reason": 1
  }
}
```
**Solution:** Exact error, exact stage, diagnostic context, actionable info

## Next Steps

When you see a publish failure:

1. **Check Console** - See full error with fbtrace_id
2. **Check meta_error.code** - Identify error type
3. **Check stage** - Know which step failed
4. **Check ad_account_info** - Verify account health
5. **Check meta_permissions** - Verify token permissions
6. **Use fbtrace_id** - Report to Meta support if needed

The error details will tell you exactly what's wrong and what to fix!
