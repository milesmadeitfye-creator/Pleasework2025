# Goals Ads Flow: Link Picker + Auto-fill + Songstats - COMPLETE

## Overview

Fully upgraded the Goals-driven ads system to eliminate manual URL pasting and streamline campaign creation. Users now select links from Ghoste's existing tables, auto-fill creative destinations, and discover sound URLs via Songstats.

## Implementation Summary

### Part A: LinkPicker Component

**File:** `src/components/ads/LinkPicker.tsx`

**Features:**
- Unified component for all three link sources
- Dual mode: "Choose from Ghoste" or "Paste Link" (optional)
- Real-time search/filter
- Shows title, URL, creation date
- Stores full metadata (id, slug, source, platform)

**Supported Sources:**

1. **smart_links** (`smart_links` table)
   - Queries: `user_id`, ordered by `created_at desc`
   - Fields: `id`, `slug`, `title`, `link_type`, `created_at`
   - Public URL: `https://ghoste.one/l/{slug}`
   - Use case: Streams goal, general smart links

2. **oneclick_links** (`oneclick_links` table)
   - Queries: `user_id`, ordered by `created_at desc`
   - Fields: `id`, `short_code`, `slug`, `title`, `platform`, `created_at`
   - Public URL: `https://ghoste.one/1c/{short_code}`
   - Use case: Fan segmentation, platform-specific redirects

3. **presave_links** (`presave_links` table)
   - Queries: `user_id`, ordered by `created_at desc`
   - Fields: `id`, `slug`, `song_title`, `artist_name`, `release_date`, `created_at`
   - Title format: `{song_title} - {artist_name}`
   - Public URL: `https://ghoste.one/presave/{slug}`
   - Use case: Pre-save campaigns

**Props:**
```typescript
interface LinkPickerProps {
  label: string;
  value?: string;
  selectedMeta?: LinkMeta;
  onChange: (url: string, meta: LinkMeta) => void;
  source: 'smart_links' | 'oneclick_links' | 'presave_links';
  owner_user_id: string;
  allowPaste?: boolean; // default true
  description?: string;
  required?: boolean;
}
```

**Metadata Structure:**
```typescript
interface LinkMeta {
  id: string;
  slug?: string;
  short_code?: string; // for oneclick
  link_type?: string; // for smart_links
  platform?: string; // for oneclick
  source: 'smart_links' | 'oneclick_links' | 'presave_links';
}
```

**Storage:**
Selections persisted in `user_ads_modes.goal_assets`:
```json
{
  "streams": {
    "url": "https://ghoste.one/l/abc123",
    "id": "uuid-1",
    "source": "smart_links",
    "slug": "abc123",
    "link_type": "smart_link"
  },
  "presave": {
    "url": "https://ghoste.one/presave/def456",
    "id": "uuid-2",
    "source": "presave_links",
    "slug": "def456"
  },
  "fan_segmentation": {
    "url": "https://ghoste.one/1c/ghi789",
    "id": "uuid-3",
    "source": "oneclick_links",
    "short_code": "ghi789",
    "platform": "instagram"
  }
}
```

**Usage Example:**
```tsx
<LinkPicker
  label="Smart Link for Streams"
  source="smart_links"
  owner_user_id={user.id}
  value={selectedUrl}
  selectedMeta={selectedMeta}
  onChange={(url, meta) => {
    setSelectedUrl(url);
    setSelectedMeta(meta);
    // Persist to goal_assets via RPC
  }}
  description="Choose the link fans will click to stream"
  required
/>
```

### Part B: Auto-fill Creatives Destination URLs

**Problem:** 
Before campaign launch, `ad_creatives` rows need `destination_url` populated, but users shouldn't manually paste URLs for each creative.

**Solution:**
Auto-fill from `goal_assets` when user clicks "Launch Campaign".

**Files Created:**

1. `netlify/functions/_adCreativesAutofill.ts` (helper)
   - `autofillCreativeDestinations()` - updates creatives
   - `validateGoalAssets()` - checks for missing URLs

2. `netlify/functions/ads-creatives-autofill.ts` (endpoint)

**Logic:**

```typescript
// For each goal:
const asset = goalAssets[goalKey];

// Find creatives needing destination_url:
SELECT * FROM ad_creatives
WHERE owner_user_id = ? 
  AND goal_key = ?
  AND status = 'ready'
  AND (destination_url IS NULL OR destination_url = '')

// Update them:
UPDATE ad_creatives
SET destination_url = asset.url
WHERE id IN (...)
```

**API Request:**
```typescript
POST /api/ads-creatives-autofill
{
  "goal_keys": ["streams", "presave"], // optional, defaults to all
  "validate_only": false // true = just check, don't update
}
```

**API Response:**
```json
{
  "ok": true,
  "results": [
    {
      "goal_key": "streams",
      "updated_count": 5,
      "errors": []
    },
    {
      "goal_key": "presave",
      "updated_count": 3,
      "errors": []
    }
  ],
  "total_updated": 8,
  "has_errors": false,
  "message": "Auto-filled destination URLs for 8 creatives across 2 goals"
}
```

**Validation Mode:**
```json
POST /api/ads-creatives-autofill
{
  "goal_keys": ["streams", "followers"],
  "validate_only": true
}

Response:
{
  "ok": true,
  "valid": false,
  "missing_assets": ["followers"],
  "message": "Missing destination URLs for: followers"
}
```

**Integration:**
Call before campaign launch:
1. Validate goal assets (show error if missing required URLs)
2. Auto-fill creatives
3. Proceed with campaign creation

**Goals That DON'T Require URLs:**
- `brand_awareness` - broad reach, no specific link
- `virality` - sound URLs stored separately

### Part C: Songstats Sound URL Lookup

**File:** `netlify/functions/songstats-sound-lookup.ts`

**Purpose:**
Auto-discover TikTok and Facebook/Instagram sound URLs for virality campaigns using Songstats API.

**Search Strategy:**
1. Try ISRC (most reliable)
2. Try Spotify Track ID
3. Try title + artist text search
4. Fallback to search links if nothing found

**API Request:**
```typescript
POST /api/songstats-sound-lookup
{
  "title": "Song Name",
  "artist": "Artist Name",
  "isrc": "USRC12345678", // optional but recommended
  "spotify_track_id": "3n3Ppam7vgaVa1iaRUc9Lp" // optional
}
```

**API Response (Success):**
```json
{
  "ok": true,
  "tiktok_sound_url": "https://www.tiktok.com/music/song-name-1234567890",
  "facebook_sound_url": "https://www.facebook.com/...",
  "confidence": "high",
  "source": "songstats"
}
```

**API Response (Fallback):**
```json
{
  "ok": true,
  "tiktok_sound_url": "https://www.tiktok.com/search?q=Song+Name+Artist+Name",
  "facebook_sound_url": null,
  "confidence": "low",
  "source": "search_fallback",
  "message": "Could not find exact sound URLs via Songstats. TikTok search link provided. Paste Facebook sound URL manually if needed."
}
```

**Confidence Levels:**
- `high` - Found via Songstats with exact matches
- `medium` - Partial match or inferred
- `low` - Search fallback link provided
- `none` - Could not find any URLs

**Songstats API:**
- Uses enterprise API: `https://api.songstats.com/enterprise/v1/`
- Requires `SONGSTATS_API_KEY` env var
- Gracefully falls back if key missing

**Endpoints Used:**
```
GET /tracks?isrc={isrc}
GET /tracks?spotify_id={spotifyId}
GET /tracks/search?query={query}
GET /tracks/{trackId}
```

**Persistence:**
Store sound URLs in `user_ads_modes.goal_assets.virality`:
```json
{
  "virality": {
    "sound_urls": {
      "tiktok": "https://www.tiktok.com/music/...",
      "facebook": "https://www.facebook.com/..."
    }
  }
}
```

### Part D: Budget Estimator (Already Implemented)

**File:** `src/components/ads/BudgetEstimator.tsx`

**Summary:**
- Users set ONE total budget + timeframe
- Assign priorities to goals (High/Med/Low)
- System computes daily budgets proportionally
- Stored in `user_ads_modes.budget_config`
- Orchestrator reads computed budgets

See `GOALS_ADS_UPGRADES_COMPLETE.md` for full details.

### Part E: /studio/ads Routing (Already Fixed)

**File:** `src/App.tsx`

Route added:
```tsx
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

Now both `/studio/ads` and `/studio/ad-campaigns` work.

### Part F: Meta Audiences (Already Implemented)

**Files:**
- `netlify/functions/meta-audiences-ensure.ts`
- `supabase/migrations/goals_ads_assets_and_audiences_final.sql`

**Summary:**
- Auto-creates Custom + Lookalike audiences
- Stores in `public.meta_audiences` table
- Gracefully handles failures
- Orchestrator uses audiences when available

See `GOALS_ADS_UPGRADES_COMPLETE.md` for full details.

## Database Schema

### user_ads_modes Enhancements

**New Columns:**
```sql
goal_assets jsonb DEFAULT '{}'::jsonb
budget_config jsonb DEFAULT '{}'::jsonb
```

**goal_assets Structure:**
```json
{
  "streams": {
    "url": "https://ghoste.one/l/abc123",
    "id": "uuid-1",
    "source": "smart_links",
    "slug": "abc123",
    "link_type": "smart_link"
  },
  "presave": {
    "url": "https://ghoste.one/presave/def456",
    "id": "uuid-2",
    "source": "presave_links",
    "slug": "def456"
  },
  "fan_segmentation": {
    "url": "https://ghoste.one/1c/ghi789",
    "id": "uuid-3",
    "source": "oneclick_links",
    "short_code": "ghi789",
    "platform": "instagram"
  },
  "virality": {
    "sound_urls": {
      "tiktok": "https://www.tiktok.com/music/...",
      "facebook": "https://www.facebook.com/..."
    }
  }
}
```

**Helper Functions:**
- `get_goal_assets(user_id, goal_key)` - Returns assets for goal
- `set_goal_assets(user_id, goal_key, assets)` - Stores assets for goal

## User Flow

### 1. Set Up Goals (Profile Page)
- Enable goals (Streams, Pre-Save, Followers, etc.)
- Set priorities (High/Med/Low)
- Configure Budget Estimator (total budget + timeframe)

### 2. Choose Links (Use My Goals)

**For each active goal:**

**Streams Goal:**
```tsx
<LinkPicker
  label="Smart Link"
  source="smart_links"
  owner_user_id={user.id}
  description="Choose the smart link fans will click to stream your song"
  required
/>
```

**Pre-Save Goal:**
```tsx
<LinkPicker
  label="Pre-Save Link"
  source="presave_links"
  owner_user_id={user.id}
  description="Choose your pre-save campaign"
  required
/>
```

**Fan Segmentation Goal:**
```tsx
<LinkPicker
  label="OneClick Link"
  source="oneclick_links"
  owner_user_id={user.id}
  description="Choose the one-click link for platform targeting"
  required
/>
```

**Virality Goal:**
```tsx
<div>
  <input placeholder="Track Title" value={trackTitle} />
  <input placeholder="Artist Name" value={artistName} />
  <button onClick={autoFindSoundUrls}>Auto-Find Sound URLs</button>
  
  {/* After auto-find: */}
  <input label="TikTok Sound URL" value={tiktokUrl} />
  <input label="Facebook Sound URL" value={facebookUrl} />
</div>
```

### 3. Upload Creatives
- Upload images/videos
- Tag with goals
- System stores in `ad_creatives` table
- `destination_url` will be auto-filled before launch

### 4. Launch Campaign
**Behind the scenes:**
1. Validate goal assets:
   ```typescript
   POST /api/ads-creatives-autofill { validate_only: true }
   ```
   - Shows error if required URLs missing

2. Auto-fill creative destinations:
   ```typescript
   POST /api/ads-creatives-autofill
   ```
   - Updates all creatives with goal URLs

3. Ensure audiences exist:
   ```typescript
   POST /api/meta-audiences-ensure
   ```
   - Creates Custom + Lookalike audiences

4. Run orchestrator:
   ```typescript
   POST /api/ads-orchestrate
   ```
   - Creates campaigns with computed budgets
   - Uses auto-filled creatives
   - Uses custom audiences

## API Endpoints

### New Endpoints

1. **POST /api/ads-creatives-autofill**
   - Auto-fills `destination_url` for creatives
   - Validates goal assets

2. **POST /api/songstats-sound-lookup**
   - Discovers TikTok/FB sound URLs
   - Uses Songstats API

### Existing (Enhanced)

1. **POST /api/meta-audiences-ensure**
   - Already implemented
   - Creates Custom + Lookalike audiences

2. **POST /api/ads-orchestrate**
   - Already implemented
   - Now calls autofill + audiences before launching

## Environment Variables

### Required
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Meta credentials (stored in DB)

### Optional
- `SONGSTATS_API_KEY` - For sound URL discovery (graceful fallback if missing)

## Build Verification

✅ **Build Successful** - 42.05s, zero errors

All components and functions compiled correctly:
- LinkPicker component
- BudgetEstimator component
- Auto-fill logic
- Songstats lookup
- Meta audiences

## Files Created/Modified

### Frontend Components
1. ✅ `src/components/ads/LinkPicker.tsx` - NEW
2. ✅ `src/components/ads/BudgetEstimator.tsx` - Already created
3. ✅ `src/components/ads/AssetPicker.tsx` - Superseded by LinkPicker

### Backend Functions
1. ✅ `netlify/functions/_adCreativesAutofill.ts` - NEW helper
2. ✅ `netlify/functions/ads-creatives-autofill.ts` - NEW endpoint
3. ✅ `netlify/functions/songstats-sound-lookup.ts` - NEW
4. ✅ `netlify/functions/sound-url-find.ts` - Superseded by songstats-sound-lookup
5. ✅ `netlify/functions/meta-audiences-ensure.ts` - Already created
6. ✅ `netlify/functions/_adsOrchestrator.ts` - Enhanced

### Database
1. ✅ `supabase/migrations/goals_ads_assets_and_audiences_final.sql`
   - Added `goal_assets` column
   - Added `budget_config` column
   - Created `meta_audiences` table
   - Added helper functions

### Routes
1. ✅ `src/App.tsx` - Added `/studio/ads` route

## Technical Benefits

### 1. Zero Manual URL Pasting
- Users select from existing Ghoste links
- No copying between Smart Links and Ads
- Reduces errors and friction

### 2. Table-Specific Queries
- `smart_links` - General streaming links
- `oneclick_links` - Platform-specific redirects
- `presave_links` - Pre-save campaigns
- Proper URL construction for each type

### 3. Auto-fill Prevents Errors
- Creatives always have correct destination URLs
- No blank landing pages
- Validation before launch

### 4. Songstats Integration
- Best-effort via official API
- Graceful fallback to search links
- No scraping, no TOS violations

### 5. Single Budget Input
- Budget Estimator is source of truth
- Priority system allocates automatically
- Easy to adjust total or timeframe

### 6. Smart Targeting
- Custom + Lookalike audiences
- Reduces cold audience costs
- Graceful fallback to broad

## Status

🟢 **COMPLETE** - All six parts fully implemented and tested.

### Coverage

- ✅ LinkPicker for smart_links/oneclick_links/presave_links
- ✅ Auto-fill ad_creatives.destination_url before launch
- ✅ Songstats sound URL lookup with fallbacks
- ✅ Budget Estimator as Source of Truth
- ✅ /studio/ads routing fixed
- ✅ Meta audiences auto-creation
- ✅ Build successful (zero errors)

## Key Design Decisions

1. **Three Table Sources** - Query specific tables for specific use cases
2. **Metadata Storage** - Store full link meta (id, slug, source) for traceability
3. **Auto-fill on Launch** - Prevent campaigns with missing URLs
4. **Graceful Degradation** - Songstats fails → search links; Audiences fail → broad targeting
5. **Validate Before Update** - Check for missing assets before attempting launch

## Next Steps for Users

1. **Create Links First:**
   - Smart Links for streaming
   - OneClick Links for segmentation
   - Pre-Save Links for campaigns

2. **Set Up Goals:**
   - Enable active goals
   - Set priorities
   - Configure Budget Estimator

3. **Choose Links:**
   - Use LinkPicker components
   - Select from existing Ghoste links
   - Auto-find sound URLs for virality

4. **Upload Creatives:**
   - Tag with goals
   - Don't worry about destination URLs

5. **Launch:**
   - System validates
   - Auto-fills creatives
   - Creates audiences
   - Launches campaigns

All upgrades are additive - no breaking changes!
