# Ghoste AI Ad Launch Fix - Complete

## Overview

Fixed blocking bugs in Ghoste AI's "run ads" flow to eliminate false negatives and enable reliable ad launches.

**Status:** ✅ Complete and Ready for Integration

---

## Problem Statement

**Before:** Ghoste AI would claim "Meta not connected" or "no assets" even when setup was complete, blocking legitimate ad launches.

**Root Causes:**
1. Multiple tables checked for Meta status (meta_credentials vs user_meta_assets)
2. Stale data from wrong tables
3. No unified truth check
4. No auto-link creation from platform URLs
5. Verbose error messages with technical details

---

## Solution: Hard Requirements Implemented

### A) Ad Launch Truth Check (Programmatic)

**Single source of truth:** `meta_credentials` table (same as Ads Manager UI)

**Required checks BEFORE launch:**
```typescript
✅ Meta access token exists
✅ Meta ad account selected
✅ Meta page selected
✅ Campaign input (Smart Link OR One-Click OR goal)
```

**File:** `_adLaunchTruthCheck.ts`

**Function:** `checkAdLaunchReadiness(userId)`

**Returns:**
```typescript
{
  ready: boolean,
  meta_connected: boolean,
  meta_ad_account: boolean,
  meta_page: boolean,
  meta_pixel: boolean,
  has_campaign_input: boolean,
  blocker?: string,          // ONLY ONE if not ready
  next_action?: string,      // ONLY ONE if not ready
  assets?: {                 // Available if ready
    ad_account_id,
    page_id,
    pixel_id,
    access_token,
    ...
  }
}
```

**No more false negatives:**
- Reads from exact same table as UI
- No stale cache
- No wrong table lookups
- Direct DB queries only

---

### B) Smart Link Auto-Creation

**Problem:** User provides Spotify/Apple/YouTube URL but AI blocks launch saying "no link"

**Solution:** Auto-create Smart Link on the fly

**Function:** `autoCreateSmartLink(userId, platformUrl, title)`

**Supported platforms:**
- Spotify (open.spotify.com / spotify:)
- Apple Music (music.apple.com)
- YouTube (youtube.com / youtu.be)
- Tidal (tidal.com)
- SoundCloud (soundcloud.com)

**Flow:**
```
User: "run ads for https://open.spotify.com/track/abc123"
  ↓
AI extracts URL from message
  ↓
Auto-creates Smart Link
  ↓
Launches ads with link
  ↓
Success
```

**No manual link creation required.**

---

### C) Fail Fast, Fail Clean

**Old behavior:**
```
Meta connection error. Please check:
- Ad Account ID: act_123456789
- Pixel ID: 987654321
- Page ID: 111222333444
- Business Manager: ...
[long technical dump]
```

**New behavior:**
```
Blocker: "Meta not connected"
Next Action: "Go to Profile → Connect Meta"
```

**One blocker. One action. Clean.**

**Implementation:**
```typescript
getBlockerMessage(blocker: string): string
getNextActionMessage(nextAction: string): string
```

**No asset IDs. No technical details. Just what user needs to do.**

---

### D) Campaign Confirmation Logging

**After successful launch:**
```typescript
logCampaignLaunch({
  userId,
  campaignId,
  campaignName,
  dailyBudgetCents,
  goal,
  linkUrl,
  smartLinkId,
})
```

**Stored in:** `ai_campaign_launches` table

**AI can query:**
```sql
SELECT * FROM ai_campaign_launches
WHERE user_id = ?
ORDER BY launched_at DESC
```

**Fields logged:**
- campaign_id
- campaign_name
- daily_budget_cents
- goal
- link_url
- smart_link_id
- ads_status (AI internal: 'RUNNING')
- launched_at timestamp

**Full audit trail of AI-launched campaigns.**

---

## Database Schema

### New Table: `ai_campaign_launches`

```sql
CREATE TABLE ai_campaign_launches (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),

  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  daily_budget_cents int NOT NULL,
  goal text NOT NULL,

  link_url text,
  smart_link_id uuid REFERENCES smart_links(id),

  ads_status text DEFAULT 'RUNNING',

  launched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```

**Purpose:**
- Confirmation logging
- AI internal tracking
- Audit trail

**RLS:** Users can read own launches, service role can insert

---

## API Implementation

### 1. Truth Check

**File:** `_adLaunchTruthCheck.ts`

**Exports:**
- `checkAdLaunchReadiness(userId)` - Programmatic readiness check
- `autoCreateSmartLink(userId, platformUrl, title)` - Auto-create from URL
- `extractPlatformUrl(message)` - Extract Spotify/Apple/YouTube URL
- `logCampaignLaunch(params)` - Log successful launch

**No stale data:**
- Direct `meta_credentials` query
- Direct `smart_links` query
- Direct `oneclick_links` query
- Fresh reads every time

---

### 2. Unified Launch Helper

**File:** `_adLaunchHelper.ts`

**Export:**
```typescript
launchAds(request: AdLaunchRequest): Promise<AdLaunchResult>
```

**Flow:**
```
1. Truth check (Meta + assets)
2. Extract URL from message OR use existing link
3. Auto-create Smart Link if URL found
4. Call meta-create-campaign-simple
5. Log launch
6. Return success OR single blocker
```

**Handles all cases:**
- User provides Spotify URL → auto-create → launch
- User has existing Smart Link → use it → launch
- User wants follower goal → no link needed → launch
- Meta not connected → return blocker → stop

**Single entry point for ad launches.**

---

### 3. Acceptance Tests

**File:** `ad-launch-acceptance-tests.ts`

**Endpoint:** `/.netlify/functions/ad-launch-acceptance-tests`

**Tests (8 total):**

1. ✅ Truth check returns structured result
2. ✅ Missing ad account blocks launch
3. ✅ Missing page blocks launch
4. ✅ Auto-create link from Spotify URL
5. ✅ Auto-create link from Apple Music URL
6. ✅ Extract platform URL from message
7. ✅ Readiness detects existing link
8. ✅ No false negatives (same source as UI)

**Run tests:**
```bash
curl -X POST /.netlify/functions/ad-launch-acceptance-tests
```

**Expected output:**
```json
{
  "ok": true,
  "passed": 8,
  "total": 8,
  "results": [...]
}
```

**All tests must pass before deployment.**

---

## Integration Points

### Ghoste AI Tools

**Add to tool registry:**

```typescript
{
  name: "run_ads",
  description: "Launch Meta ads campaign for user",
  parameters: {
    campaignName: "string (optional)",
    dailyBudgetDollars: "number (optional)",
    targetCountries: "string[] (optional)",
    linkUrl: "string (optional)",
    goal: "traffic | conversions | followers | awareness (optional)"
  },
  handler: async (params) => {
    const result = await launchAds({
      userId: params.userId,
      userMessage: params.userMessage,
      campaignName: params.campaignName,
      dailyBudgetDollars: params.dailyBudgetDollars,
      targetCountries: params.targetCountries,
      linkUrl: params.linkUrl,
      goal: params.goal,
    });

    if (result.success) {
      return `Ads launched: ${result.campaign_name} ($${result.message})`;
    } else {
      return `${result.blocker}. ${result.next_action}`;
    }
  }
}
```

**AI no longer needs to ask questions - just run the tool.**

---

## Usage Examples

### Example 1: User with Spotify link

**User:** "run ads for https://open.spotify.com/track/abc123"

**AI Flow:**
1. Truth check → ready
2. Extract URL → found Spotify link
3. Auto-create Smart Link → success
4. Launch campaign → success
5. Log launch → done

**AI Response:** "Ads launched: Campaign 2024-12-27 ($10/day)"

**No questions. No blockers. Immediate launch.**

---

### Example 2: User with existing Smart Link

**User:** "run ads"

**AI Flow:**
1. Truth check → ready
2. Check for existing links → found smart_link
3. Use existing link → https://ghoste.one/s/abc123
4. Launch campaign → success
5. Log launch → done

**AI Response:** "Ads launched: Campaign 2024-12-27 ($10/day)"

**Uses existing content automatically.**

---

### Example 3: Meta not connected

**User:** "run ads"

**AI Flow:**
1. Truth check → NOT ready
2. Blocker: "meta_not_connected"
3. Next action: "Connect Meta in Profile"
4. Return blocker → stop

**AI Response:** "Meta not connected. Go to Profile → Connect Meta"

**Single blocker. Single action. Clean.**

---

### Example 4: Follower goal (no link)

**User:** "run ads to get more followers"

**AI Flow:**
1. Truth check → ready
2. No URL found → okay
3. No existing link → okay
4. Goal: followers → no link needed
5. Launch campaign → success
6. Log launch → done

**AI Response:** "Ads launched: Follower Campaign ($10/day)"

**Supports link-less campaigns for followers.**

---

## Blocker Messages (Fail Fast)

**All possible blockers:**

| Blocker | Message | Next Action |
|---------|---------|-------------|
| meta_not_connected | Meta not connected | Go to Profile → Connect Meta |
| no_ad_account | Ad account not selected | Go to Profile → Select ad account |
| no_page | Facebook page not selected | Go to Profile → Select Facebook page |
| link_creation_failed | Could not create link | Create a Smart Link in Studio |
| campaign_creation_failed | Campaign creation failed | Check Profile → Meta settings |

**ONE blocker. ONE action. Always.**

---

## Files Created/Modified

### New Files

1. **`_adLaunchTruthCheck.ts`**
   - Truth check (no false negatives)
   - Auto-link creation
   - URL extraction
   - Campaign logging

2. **`_adLaunchHelper.ts`**
   - Unified launch flow
   - Fail-fast error handling
   - Simple messages

3. **`ad-launch-acceptance-tests.ts`**
   - 8 critical tests
   - Must pass before deploy

4. **`AD_LAUNCH_FIX_COMPLETE.md`**
   - This document

### Database

**Migration:** `ai_campaign_launches_log`
- New table: `ai_campaign_launches`
- RLS policies
- Indexes

---

## Verification Checklist

### Before Integration

✅ All acceptance tests pass (8/8)
✅ Truth check reads from meta_credentials
✅ No false negatives on valid setup
✅ Auto-link creation works for Spotify/Apple/YouTube
✅ Fail-fast returns single blocker
✅ Campaign logging works
✅ Build passes

### After Integration

**Test Case 1:** User with valid Meta setup + Spotify URL
- Expected: Ads launch immediately
- No questions asked
- Link auto-created
- Campaign confirmed

**Test Case 2:** User with valid Meta setup + existing Smart Link
- Expected: Ads launch immediately
- Uses existing link
- Campaign confirmed

**Test Case 3:** User with no Meta connection
- Expected: "Meta not connected. Go to Profile → Connect Meta"
- No long explanation
- Single action

**Test Case 4:** User with Meta but no ad account
- Expected: "Ad account not selected. Go to Profile → Select ad account"
- Single blocker
- Single action

---

## Integration Steps

### 1. Add to Ghoste AI Tool Registry

**File:** `ghoste-tools.ts` or tool registry

**Add action:**
```typescript
if (action === "run_ads") {
  const { campaignName, dailyBudgetDollars, targetCountries, linkUrl, goal } = body;

  const result = await launchAds({
    userId,
    userMessage: body.userMessage || "",
    campaignName,
    dailyBudgetDollars,
    targetCountries,
    linkUrl,
    goal,
  });

  if (result.success) {
    return json(200, {
      ok: true,
      campaign_id: result.campaign_id,
      campaign_name: result.campaign_name,
      message: result.message,
    });
  } else {
    return json(400, {
      ok: false,
      blocker: result.blocker,
      next_action: result.next_action,
    });
  }
}
```

### 2. Update Ghoste AI System Prompt

**Add to AI instructions:**

```
When user says "run ads":
1. Call run_ads tool immediately
2. DO NOT ask questions
3. DO NOT explain setup
4. If success: confirm launch
5. If blocker: show blocker + next action

The tool handles:
- Truth check
- Auto-link creation from URLs
- Campaign creation
- Logging

You just call it and relay the result.
```

### 3. Test Flow

1. User: "run ads for https://open.spotify.com/track/abc"
2. AI calls: run_ads tool
3. Tool: auto-creates link + launches
4. AI: "Ads launched: $10/day"

**No intermediate steps.**

### 4. Monitor

**Query recent launches:**
```sql
SELECT
  campaign_name,
  daily_budget_cents,
  goal,
  link_url,
  ads_status,
  launched_at
FROM ai_campaign_launches
WHERE user_id = ?
ORDER BY launched_at DESC
LIMIT 10;
```

**Check for failures:**
```sql
SELECT COUNT(*)
FROM ai_campaign_launches
WHERE ads_status = 'FAILED'
AND launched_at > NOW() - INTERVAL '24 hours';
```

---

## Acceptance Criteria (All Met)

✅ "run ads" with valid setup → ads launch
✅ "run ads" with Spotify link → Smart Link auto-created → ads launch
✅ No false "not connected" messages
✅ No requirement for manual Smart Link creation
✅ Single blocker if not ready
✅ Single next action if not ready
✅ Campaign confirmed after launch
✅ All tests passing (8/8)

---

## Rollback Plan

If issues occur:

### 1. Disable run_ads Tool

**Remove from tool registry:**
```typescript
// Comment out run_ads action
// if (action === "run_ads") { ... }
```

**Effect:** AI can't launch ads, users must use UI

### 2. Revert Migration

```sql
DROP TABLE IF EXISTS ai_campaign_launches;
```

**Effect:** Logging disabled, but ad launch still works

### 3. Use UI Instead

**Tell users:** "Use Ads Manager in Studio to launch campaigns"

**Effect:** Bypass AI completely

---

## Summary

Successfully fixed blocking bugs in Ghoste AI ad launch flow:

**Hard Truth Check:**
- Reads from `meta_credentials` (same as UI)
- No false negatives
- No stale data
- Programmatic verification

**Auto-Link Creation:**
- Spotify → Smart Link
- Apple Music → Smart Link
- YouTube → Smart Link
- No manual creation required

**Fail Fast:**
- One blocker
- One action
- No technical details

**Confirmation:**
- Log campaign_id
- Log budget
- Log goal
- Log timestamp
- AI can track internally

**Acceptance Tests:**
- 8 critical tests
- All passing
- Ready for deployment

**Status:** Production-ready, waiting for Ghoste AI tool integration

---

**Last Updated:** 2025-12-27
**Author:** Bolt AI (Claude)
**Build Status:** ✅ Passing
**Tests:** ✅ All Passing (8/8)
**Integration:** Ready
