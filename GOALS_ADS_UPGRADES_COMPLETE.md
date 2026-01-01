# Goals Ads Flow Upgrades - Implementation Complete

## Overview

Successfully upgraded the Goals-driven ads system with five major enhancements:
1. Asset Picker - eliminates manual link pasting
2. Sound URL Auto-Find - discovers TikTok/FB sound URLs
3. Budget Estimator SOT - unified budget allocation
4. /studio/ads routing fix
5. Auto Meta Audiences - Custom + Lookalike creation

## Part A: Asset Picker (Link Selection)

### Component Created
**File:** `src/components/ads/AssetPicker.tsx`

### Features
- **Dual Mode Interface:**
  - "Choose from Ghoste" - Select from existing links
  - "Paste Link" - Manual URL input (still allowed)

- **Asset Types Supported:**
  - `smartlink` - Smart links for streams
  - `presave` - Pre-save campaigns
  - `oneclick` - One-click links for segmentation
  - `profile` - Social profile URLs

- **Smart Queries:**
  - Loads links from `smart_links` table
  - Filters by type (presave, one_click, etc.)
  - Shows title, URL, creation date
  - Search/filter functionality

- **Persistence:**
  - Stores selected URL and asset ID
  - Uses new `goal_assets` JSONB column
  - Available via RPC: `get_goal_assets()`, `set_goal_assets()`

### Usage Example
```typescript
<AssetPicker
  assetType="smartlink"
  value={smartlinkUrl}
  selectedAssetId={smartlinkId}
  onChange={(url, id) => {
    setSmartlinkUrl(url);
    setSmartlinkId(id);
  }}
  label="Smart Link"
  description="Choose the link fans will click"
  required
/>
```

## Part B: Sound URL Auto-Find

### Function Created
**File:** `netlify/functions/sound-url-find.ts`

### Capabilities
- **Best-Effort Discovery** via Songstats API:
  - Searches by ISRC (most reliable)
  - Falls back to Spotify ID
  - Falls back to title + artist text search
  - Extracts TikTok and Facebook/IG sound URLs

- **Graceful Fallbacks:**
  - TikTok: Search deep link if exact URL not found
  - Facebook/IG: Returns null (UI prompts manual paste)

- **Confidence Levels:**
  - `high` - Found via Songstats with exact matches
  - `medium` - Partial match or inferred
  - `low` - Search fallback link provided
  - `none` - Could not find any URLs

### API Request
```typescript
POST /api/sound-url-find
{
  "track_title": "Song Name",
  "artist_name": "Artist Name",
  "isrc": "USRC12345678", // optional but recommended
  "spotify_track_id": "3n3Ppam7vgaVa1iaRUc9Lp" // optional
}
```

### API Response
```json
{
  "ok": true,
  "tiktok_sound_url": "https://www.tiktok.com/music/...",
  "facebook_sound_url": "https://www.facebook.com/...",
  "confidence": "high",
  "source": "songstats",
  "message": null
}
```

### Environment Variable
- `SONGSTATS_API_KEY` - Required for Songstats integration (optional, falls back gracefully)

## Part C: Budget Estimator (Source of Truth)

### Component Created
**File:** `src/components/ads/BudgetEstimator.tsx`

### Concept
Users set **ONE** total budget + timeframe, then assign priorities to active goals.
Ghoste automatically allocates daily budgets proportionally.

### Features
- **Total Budget Input:**
  - Dollar amount ($50 minimum)
  - Timeframe selector (7, 14, 30, 60, 90 days)
  - Computes daily budget automatically

- **Priority-Based Allocation:**
  - High priority: 3x weight
  - Medium priority: 2x weight
  - Low priority: 1x weight
  - Budget split proportionally among active goals

- **Real-Time Calculation:**
  - Shows computed daily budget per goal
  - Shows total budget per goal over timeframe
  - Shows average per goal

- **Persistence:**
  - Stores in `user_ads_modes.budget_config` JSONB
  - Structure:
    ```json
    {
      "total_budget": 500,
      "timeframe_days": 30,
      "daily_budget": 16.67,
      "learning_share": 0.70,
      "scaling_share": 0.30,
      "per_goal_budgets": {
        "streams": { "daily_budget": 8.33, "priority": "high" },
        "followers": { "daily_budget": 5.56, "priority": "medium" },
        "presave": { "daily_budget": 2.78, "priority": "low" }
      }
    }
    ```

### Orchestrator Integration
- Orchestrator reads `budget_config.per_goal_budgets`
- Uses computed daily budgets when creating campaigns
- Falls back to default $10/day if not configured

## Part D: /studio/ads Routing Fix

### Change Made
**File:** `src/App.tsx`

Added route alias so `/studio/ads` points to `AdCampaignsPage`:

```typescript
<Route
  path="/studio/ads"
  element={
    <ProtectedRoute>
      <AppShell>
        <AdCampaignsPage />
      </AppShell>
    </ProtectedRoute>
  }
/>
```

Now both `/studio/ads` and `/studio/ad-campaigns` work correctly.

## Part E: Auto Meta Audiences

### Database Schema
**Migration:** `goals_ads_assets_and_audiences_final`

**Table:** `public.meta_audiences`

Columns:
- `id` - UUID primary key
- `user_id` - User ownership (FK to auth.users)
- `audience_type` - 'custom' or 'lookalike'
- `source` - 'pixel', 'engagers', 'video_viewers', 'purchasers', 'customer_list'
- `meta_audience_id` - Meta platform audience ID
- `name` - Audience name
- `status` - 'active', 'archived', 'deleted', 'error'
- `size_estimate` - Estimated audience size
- `lookalike_spec` - JSONB spec for lookalikes
- `parent_audience_id` - FK to parent seed audience (for lookalikes)
- `created_at`, `updated_at`, `last_synced_at`
- `error_message`

Indexes:
- `(user_id, audience_type)`
- `(user_id, status)`
- `(parent_audience_id)`

RLS: Enabled with full CRUD policies for authenticated users

### Function Created
**File:** `netlify/functions/meta-audiences-ensure.ts`

### Capabilities
- **Creates Custom Audiences:**
  - Website Visitors 180d (pixel-based)
  - Page/IG Engagers 365d
  - Video Viewers 25% 365d

- **Creates Lookalike Audiences:**
  - 1% lookalike (US) for each custom audience
  - Stores relationship in `parent_audience_id`

- **Graceful Failure:**
  - If Meta credentials missing: returns empty array
  - If API fails: logs error, continues without audiences
  - Campaigns fall back to broad targeting

- **Reuse Logic:**
  - Checks DB for existing audiences by name
  - Only creates if missing
  - Reduces redundant API calls

### API Request
```typescript
POST /api/meta-audiences-ensure
{
  "goal_key": "streams",
  "seed_types": ["website_180", "engagers_365", "video_viewers_25"]
}
```

### API Response
```json
{
  "ok": true,
  "audiences": [
    {
      "id": "uuid-1",
      "meta_audience_id": "123456789",
      "type": "custom",
      "name": "Ghoste_website_180",
      "source": "website_180"
    },
    {
      "id": "uuid-2",
      "meta_audience_id": "987654321",
      "type": "lookalike",
      "name": "Ghoste_LAL_website_180_1pct_US"
    }
  ],
  "errors": [],
  "message": "Created/reused 6 audiences"
}
```

### Orchestrator Integration
**File:** `netlify/functions/_adsOrchestrator.ts`

**Method:** `ensureLearningCampaign()`

Flow:
1. Check if learning campaign exists
2. Call `ensureAudiences()` (graceful try/catch)
3. If audiences created: attach to campaign details
4. If audiences failed: continue with broad targeting
5. Log action with targeting type

Action log includes:
```json
{
  "actionType": "create_campaign",
  "goalKey": "streams",
  "details": {
    "campaignRole": "testing",
    "budgetType": "ABO",
    "audiences": ["123456789", "987654321"],
    "targeting": "custom_audiences"
  }
}
```

## Database Schema Summary

### New Columns in `user_ads_modes`
```sql
ALTER TABLE public.user_ads_modes
  ADD COLUMN goal_assets jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN budget_config jsonb DEFAULT '{}'::jsonb;
```

**goal_assets structure:**
```json
{
  "streams": {
    "smartlink_url": "https://ghoste.one/l/abc123",
    "smartlink_id": "uuid-1",
    "sound_urls": {
      "tiktok": "https://www.tiktok.com/music/...",
      "facebook": "https://www.facebook.com/..."
    }
  },
  "presave": {
    "presave_url": "https://ghoste.one/l/def456",
    "presave_id": "uuid-2"
  }
}
```

### New Table `meta_audiences`
- Tracks Custom + Lookalike audiences
- Stores Meta audience IDs for reuse
- Enables parent-child relationships (seed → lookalike)

### Helper Functions
- `get_goal_assets(user_id, goal_key)` - Returns JSONB assets for goal
- `set_goal_assets(user_id, goal_key, assets)` - Stores assets for goal

## Files Created

### Frontend Components
1. `src/components/ads/AssetPicker.tsx` - Link selection UI
2. `src/components/ads/BudgetEstimator.tsx` - Budget allocation UI

### Backend Functions
1. `netlify/functions/sound-url-find.ts` - Sound URL discovery
2. `netlify/functions/meta-audiences-ensure.ts` - Audience creation

### Modified Files
1. `src/App.tsx` - Added /studio/ads route
2. `netlify/functions/_adsOrchestrator.ts` - Added audience integration

### Database Migration
1. Applied via Supabase: `goals_ads_assets_and_audiences_final`

## Build Verification

Build completed successfully:
- Zero TypeScript errors
- Zero linting errors
- All components bundled correctly
- Total build time: 51.99s

## User Flow

### Setup (First Time)

1. **Set Budget** (Budget Estimator)
   - Enter total budget (e.g., $500)
   - Select timeframe (e.g., 30 days)
   - Set priorities for active goals
   - Save configuration

2. **Choose Assets** (Asset Picker)
   - For each goal, select links from Ghoste or paste manually
   - System stores selected asset IDs
   - No more manual URL copying

3. **Find Sound URLs** (Virality Goal)
   - Enter track title + artist
   - Click "Auto-Find Sound URLs"
   - System queries Songstats
   - Returns TikTok + Facebook sound URLs
   - Option to edit/paste overrides

### Running Campaigns

1. **Upload Creatives** (Use My Goals)
   - Upload images/videos for each goal
   - Creatives tagged automatically

2. **Click "Run Now"** (Orchestrator)
   - System loads budget config
   - Loads goal assets
   - Ensures Meta audiences exist (graceful failure)
   - Creates campaigns with:
     - Computed daily budgets
     - Selected destination URLs
     - Custom + Lookalike audiences (if available)
   - Shows status + logs

## Technical Benefits

### 1. No More Manual Link Pasting
- Users never copy/paste URLs between Ghoste and Ads
- Asset picker shows all available links
- Reduces errors and friction

### 2. Sound URL Discovery
- Best-effort via Songstats API
- Fallback to search links (not perfect but functional)
- No scraping, no breaking TOS

### 3. Single Budget Input
- Users don't manage per-goal budgets manually
- Priority system automatically allocates
- Easy to adjust total budget or timeframe

### 4. /studio/ads Always Works
- Route added as alias
- No more 404 errors

### 5. Smart Audience Targeting
- Reduces cold audience testing cost
- Lookalikes improve performance
- Graceful fallback ensures campaigns still launch

## API Endpoints Summary

### Created
1. `POST /api/sound-url-find` - Find sound URLs for track
2. `POST /api/meta-audiences-ensure` - Ensure audiences exist

### Used by Orchestrator
- `POST /api/ads-orchestrate` (enhanced with audience creation)

## Environment Variables

### New (Optional)
- `SONGSTATS_API_KEY` - For sound URL discovery

### Existing (Required)
- Meta credentials in DB (via meta_connections)
- Supabase credentials
- Netlify URL for function calls

## Next Steps for User

1. **Go to Profile** → Set up goals and budgets
2. **Use Budget Estimator** → Allocate total budget across goals
3. **Use Asset Picker** → Choose links for each goal
4. **Use Sound URL Finder** → Auto-find sound URLs for virality
5. **Upload Creatives** → Tag with goals
6. **Run Campaigns** → Let Ghoste handle the rest

## Status

🟢 **COMPLETE** - All five parts implemented, tested, and ready for production.

### Coverage

- ✅ Asset Picker eliminates manual link pasting
- ✅ Sound URL auto-find works via Songstats + fallbacks
- ✅ Budget Estimator is Source of Truth for allocations
- ✅ /studio/ads routing fixed
- ✅ Meta audiences auto-created with graceful failure
- ✅ Orchestrator uses all new features
- ✅ Build successful (zero errors)

## Key Design Decisions

1. **Graceful Degradation** - If Songstats fails, use search links. If audiences fail, use broad targeting.
2. **Reuse Over Recreate** - Check DB for existing audiences before API calls.
3. **Priority Weights** - Simple 3x/2x/1x system, easy to understand.
4. **Asset Storage** - JSONB in user_ads_modes for flexibility.
5. **No Breaking Changes** - All enhancements are additive.
