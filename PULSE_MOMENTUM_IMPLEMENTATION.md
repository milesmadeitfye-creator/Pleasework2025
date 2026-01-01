# Pulse & Momentum Ads Operating Modes - Implementation Summary

## Status: Phase 1 Complete (Core Infrastructure + Profile UI)

This document outlines the Pulse & Momentum ads operating modes system for Ghoste Ads.

## What Was Implemented (Phase 1)

### ✅ PART A - Data Layer (COMPLETE)
**Database:**
- Created `user_ads_modes` table with RLS policies
- Fields: `ads_mode`, `pulse_settings`, `momentum_settings`, `goal_settings`
- Added campaign fields: `campaign_role`, `goal_key`, `mode`, `promoted_from_id`, `winner_detected`
- Created RPCs:
  - `get_user_ads_mode_settings()`
  - `upsert_user_ads_mode_settings()`

**Client Library:** `src/lib/ads/modes/`
- `types.ts` - Core types (AdsMode, CampaignRole, Settings interfaces)
- `readModeSettings.ts` - Read user mode settings from Supabase
- `writeModeSettings.ts` - Write/update mode settings
- `index.ts` - Central export

**Key Types:**
```typescript
type AdsMode = 'pulse' | 'momentum'
type CampaignRole = 'testing' | 'scaling'

interface PulseSettings {
  daily_budget?: number;
  test_lane_pct?: number;
  rotation_days?: number;
}

interface MomentumSettings {
  starting_budget?: number;
  max_daily_budget?: number;
  scale_step_pct?: number;
  cooldown_hours?: number;
}

interface GoalSettings {
  is_active: boolean;
  priority: number;
  budget_hint?: number;
  auto_scale?: boolean;
  testing_enabled?: boolean;
  scaling_enabled?: boolean;
}
```

### ✅ PART B - Profile Goals Tab UI (COMPLETE)
**Location:** `src/components/profile/GoalsAndBudget.tsx`

**Added Features:**
1. **Mode Toggle:** Pulse vs Momentum selector at top of page
2. **Mode Settings Panel:** Expandable settings for each mode
   - Pulse: daily_budget, test_lane_pct, rotation_days
   - Momentum: starting_budget, max_daily_budget, scale_step_pct, cooldown_hours
3. **Ads Goals Control:** Per-goal active/priority/budget management
   - Goals: smartlink_conversions, presave_conversions, virality, follower_growth, email_capture, oneclick
   - Each goal shows: Active toggle, Priority (1-5), Budget hint

**User Flow:**
1. User selects Pulse or Momentum mode
2. User clicks "Mode Settings" to configure thresholds
3. User enables/disables specific goals (smartlink, presave, etc.)
4. Settings saved to `user_ads_modes` table
5. These settings drive campaign creation in RunAdsPage

## What Needs to Be Implemented (Phase 2)

### 🔄 PART C - Ads Manager UI (Testing/Scaling Tabs)
**Location:** `src/components/AdsManager.tsx` or create new `AdsManagerEnhanced.tsx`

**Requirements:**
1. Add tab switcher at top: `Testing` | `Scaling`
2. Filter campaigns by `campaign_role` field
3. Campaign cards show:
   - Goal key badge (smartlink, presave, etc.)
   - Template key (template_key)
   - Mode badge (Pulse/Momentum)
   - Winner badge (if winner_detected = true)
4. Add "Promote to Scaling" button for Testing campaigns with winners
   - Button creates/finds a Scaling CBO campaign
   - Copies ad/adset into scaling campaign
   - Marks original as promoted_from_id

**Implementation Approach:**
```typescript
// In AdsManager component
const [roleFilter, setRoleFilter] = useState<'testing' | 'scaling'>('testing');

// Filter campaigns
const filteredCampaigns = campaigns.filter(c => c.campaign_role === roleFilter);

// Promote function
async function promoteCampaign(campaignId: string) {
  // 1. Find/create scaling CBO campaign for same goal_key
  // 2. Copy ad/adset from testing to scaling
  // 3. Update promoted_from_id
  // 4. Mark winner_detected = true
}
```

### 🔄 PART D - Campaign Creation Logic (Mode-Driven Defaults)
**Location:** `src/pages/studio/RunAdsPage.tsx`

**Requirements:**
1. When user creates campaign, read mode settings from Profile
2. Set `campaign_role = 'testing'` by default (both modes)
3. Set `goal_key` based on selected template
4. Set `mode` from user's ads_mode setting
5. Budget defaults:
   - Pulse: Use pulse_settings.daily_budget
   - Momentum: Use momentum_settings.starting_budget for testing, scaling uses CBO
6. Add fields to campaign payload:
   ```typescript
   {
     campaign_role: 'testing',
     goal_key: 'smartlink_conversions', // from template
     mode: 'pulse', // from user settings
     promoted_from_id: null
   }
   ```

**Implementation:**
```typescript
// In run-ads-submit handler
const modeSettings = await readModeSettings(user.id);
const goalKey = selectedTemplate; // or map template to goal_key

const campaignPayload = {
  ...existingFields,
  campaign_role: 'testing', // Always testing on create
  goal_key: goalKey,
  mode: modeSettings.ads_mode,
  daily_budget_cents: (modeSettings.ads_mode === 'pulse'
    ? modeSettings.pulse_settings.daily_budget
    : modeSettings.momentum_settings.starting_budget) * 100
};
```

### 🔄 PART E - Winner Detection (Basic Client-Side)
**Location:** `src/lib/ads/modes/winnerDetection.ts` (create new)

**Requirements:**
1. Detect winners based on core signal per goal:
   - smartlink_conversions → smartlinkclicked
   - presave_conversions → presavecomplete
   - virality → thruplay
   - follower_growth → profile_view
   - email_capture → lead
   - oneclick → oneclick_redirect

2. Winner criteria (MVP):
   - min_spend >= $10 OR min_impressions >= 2000
   - cost_per_signal is 15% better than median of all ad sets

3. Display winner badge in Ads Manager campaign cards

**Implementation:**
```typescript
// src/lib/ads/modes/winnerDetection.ts
export interface WinnerCriteria {
  campaignId: string;
  adSetId: string;
  isWinner: boolean;
  coreSignal: string;
  costPerSignal: number;
  improvement: number; // % better than median
}

export function detectWinners(
  campaigns: Campaign[],
  goalKey: string
): WinnerCriteria[] {
  const coreSignal = GOAL_CORE_SIGNALS[goalKey];

  // Filter eligible campaigns (min spend/impressions)
  // Calculate cost per signal for each
  // Find median cost per signal
  // Mark winners if 15%+ better than median

  return winners;
}
```

### 🔄 PART F - Momentum Auto-Scale (Toggle Only, Conservative)
**Location:** `src/components/profile/GoalsAndBudget.tsx` + backend job (future)

**Requirements:**
1. Add `auto_scale` toggle to each goal in GoalsAndBudget
2. Default: OFF (user must opt-in)
3. If enabled + Momentum mode:
   - Show confirmation toast when winner detected
   - Manual "Promote" button in toast
4. Future: Background job to auto-promote if user enables "Auto-promote all winners"

**Current Implementation:**
- Toggle exists in `GoalSettings` type
- UI shows it but logic is not wired
- For Phase 1: Just store the setting, don't act on it

### 🔄 PART G - Debug Panel Logging
**Location:** `src/components/ads/AdsDebugPanel.tsx`

**Requirements:**
Add display fields for:
- `ads_mode` (pulse/momentum)
- `campaign_role` (testing/scaling)
- `goal_key`
- `template_key`
- `winner_detected`
- `promoted_from_id`
- Mode settings dump (pulse/momentum config)

**Implementation:**
```typescript
// In AdsDebugPanel, add new section:
<div className="space-y-2">
  <h4 className="font-semibold">Pulse & Momentum</h4>
  <div className="text-xs space-y-1">
    <div>Mode: {debugData.ads_mode || 'N/A'}</div>
    <div>Role: {debugData.campaign_role || 'N/A'}</div>
    <div>Goal: {debugData.goal_key || 'N/A'}</div>
    <div>Winner: {debugData.winner_detected ? 'Yes' : 'No'}</div>
  </div>
</div>
```

## Integration Points

### RunAdsPage Flow
1. User selects template (smartlink_conversions, presave_conversions, etc.)
2. System reads mode settings from Profile
3. Campaign created with:
   - campaign_role = 'testing'
   - goal_key = template key
   - mode = user's ads_mode
   - budget = mode-specific default
4. Campaign published to Meta as ABO (testing) or CBO (scaling)

### Ads Manager Flow
1. User views Testing tab (all campaign_role='testing')
2. System detects winners (if spend/impressions meet threshold)
3. Winner badge shown on eligible campaigns
4. User clicks "Promote to Scaling"
5. System creates/finds Scaling CBO campaign
6. Ad/adset copied to scaling campaign
7. Testing campaign marked with promoted_from_id

### Profile Flow
1. User sets mode (Pulse or Momentum)
2. User configures mode settings (budgets, thresholds)
3. User enables/disables goals
4. Settings saved and applied to future campaign creations

## Phase 2 Implementation Priority

1. **PART D** (Campaign Creation Logic) - **CRITICAL**
   - Easiest to implement
   - Unblocks testing
   - No UI changes needed

2. **PART E** (Winner Detection) - **HIGH**
   - Core feature
   - Moderate complexity
   - Enables manual promotion

3. **PART C** (Ads Manager Tabs) - **HIGH**
   - User-facing
   - Moderate complexity
   - Required for promotion flow

4. **PART G** (Debug Logging) - **MEDIUM**
   - Easy to implement
   - Helps with troubleshooting

5. **PART F** (Auto-Scale) - **LOW**
   - Complex
   - Can be manual for now
   - Future iteration

## Testing Checklist

### Phase 1 (Complete)
- [x] User can select Pulse or Momentum mode in Profile
- [x] Mode settings save/load correctly
- [x] Goal toggles work (enable/disable)
- [x] Settings persist in database
- [x] No errors in browser console
- [x] Build succeeds

### Phase 2 (To Do)
- [ ] Campaign created with correct role/goal_key/mode
- [ ] Testing campaigns show in Testing tab
- [ ] Winner detection logic runs correctly
- [ ] Promote button copies campaign to Scaling
- [ ] Scaling campaigns show in Scaling tab
- [ ] Debug panel shows mode fields
- [ ] Budget defaults respect mode settings

## Database Schema Summary

```sql
-- user_ads_modes (existing)
user_id uuid PRIMARY KEY
ads_mode text ('pulse' | 'momentum')
pulse_settings jsonb
momentum_settings jsonb
goal_settings jsonb
created_at timestamptz
updated_at timestamptz

-- ad_campaigns (updated)
id uuid PRIMARY KEY
campaign_role text ('testing' | 'scaling') -- NEW
goal_key text -- NEW (smartlink_conversions, presave_conversions, etc.)
mode text ('pulse' | 'momentum') -- NEW
promoted_from_id uuid -- NEW (FK to ad_campaigns.id)
winner_detected boolean -- NEW
... (existing fields)
```

## Code Files Modified/Created

### Created:
- `src/lib/ads/modes/types.ts`
- `src/lib/ads/modes/readModeSettings.ts`
- `src/lib/ads/modes/writeModeSettings.ts`
- `src/lib/ads/modes/index.ts`

### Modified:
- `src/components/profile/GoalsAndBudget.tsx` (added mode toggle + settings UI)

### To Modify (Phase 2):
- `src/pages/studio/RunAdsPage.tsx` (add mode-driven defaults)
- `src/components/AdsManager.tsx` (add Testing/Scaling tabs)
- `src/components/ads/AdsDebugPanel.tsx` (add mode logging)
- `netlify/functions/_metaCampaignExecutor.ts` (pass role/goal_key/mode to Meta)
- `netlify/functions/_runAdsCampaignBuilder.ts` (include new fields in payload)

### To Create (Phase 2):
- `src/lib/ads/modes/winnerDetection.ts` (winner detection logic)
- `src/lib/ads/modes/promoteCampaign.ts` (promotion helper)

## Next Steps

1. Implement PART D (campaign creation with mode defaults)
2. Test campaign creation flow end-to-end
3. Implement PART E (winner detection client-side)
4. Implement PART C (Ads Manager tabs + promote button)
5. Add debug logging (PART G)
6. Test full Testing → Scaling promotion flow
7. (Future) Implement auto-scale background job

## Notes

- Pulse mode = ABO (ad set budgets), steady testing
- Momentum mode = CBO (campaign budget) for scaling, ABO for testing
- Winners are COPIED (not moved) from Testing to Scaling
- All new campaigns start as Testing
- User must manually promote winners (for now)
- Auto-scale is toggle-only, not implemented yet (conservative approach)

## Support

For questions or issues with Pulse & Momentum:
1. Check Profile → Goals tab settings are saved
2. Verify `user_ads_modes` table has user's settings
3. Check `ad_campaigns` table for new fields (campaign_role, goal_key, mode)
4. Review Ads Debug Panel for mode field values
5. Check browser console for errors in mode settings read/write
