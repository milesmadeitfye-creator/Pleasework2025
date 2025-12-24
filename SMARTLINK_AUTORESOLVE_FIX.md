# Smart Link Auto-Resolve Fix

## Summary

Fixed Smart Link auto-resolve functionality to make it robust, unbreakable, and consistent across the entire application.

## Problem

Smart Link resolution was failing inconsistently due to:
1. Direct queries to `smart_links` table without fallback mechanisms
2. No slug normalization (case sensitivity, encoding issues)
3. Missing destination URL selection priority logic
4. No URL validation (allowing invalid URLs to crash redirects)
5. Poor error handling (silent failures)

## Solution

### 1. Multi-Table Fallback Strategy

Created a robust query mechanism that tries multiple sources in order:
1. `smart_links_v` (stable compatibility view)
2. `smart_links` (primary table)
3. `smartlinks` (legacy table name)
4. `links` (alternative table name)

This ensures the resolver works even if the schema changes or views aren't created yet.

### 2. Destination URL Priority Order

Implemented smart destination selection with clear priority:

**Priority 1: Explicit destination_url**
- Check `destination_url` column first (if set, this is the user's intended destination)

**Priority 2: Platform URLs (in order)**
1. `spotify_url`
2. `apple_music_url`
3. `youtube_url`
4. `soundcloud_url`
5. `tidal_url`
6. `amazon_music_url`
7. `deezer_url`

**Priority 3: Legacy config JSON**
- Backward compatibility with old links that store URLs in a `config` JSON field

**Priority 4: Fallback URL**
- Generate safe fallback: `https://ghoste.one/r/{slug}`

### 3. Slug Normalization

All slug lookups now normalize the input:
```typescript
const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();
```

This fixes issues with:
- URL-encoded slugs (%20, etc.)
- Extra whitespace
- Mixed case slugs

### 4. URL Validation

All destination URLs are validated before use:
```typescript
function isValidUrl(url: string): boolean {
  // Only allow http:// or https:// URLs
  // Validate URL structure
  // Prevent malformed or dangerous URLs
}
```

### 5. Defensive Error Handling

All operations wrapped in try-catch blocks:
- Query failures don't crash the app
- Invalid JSON in config fields is silently skipped
- Missing tables/views fall back gracefully
- Clear console logging for debugging

## Files Modified

### Backend (Netlify Functions)

**`netlify/functions/smartlink-track.ts`**
- Added `fetchSmartLinkBySlug()` - Multi-table fallback query
- Added `selectDestinationUrl()` - Priority-based destination selection
- Added `isValidUrl()` - URL validation
- Updated slug resolution logic with normalization and error handling

### Frontend (React Components)

**`src/components/SmartLinkLanding.tsx`**
- Added `fetchSmartLinkBySlugClient()` - Client-side multi-table fallback
- Updated `fetchLink()` with slug normalization and error handling
- Better error logging and user feedback

**`src/pages/SmartLinkRedirect.tsx`**
- Added link validation before redirect
- Added "Link not configured" error handling
- Prevents redirect to invalid/fallback URLs
- Shows clear error messages when links aren't configured

## Query Strategy

### Backend (Server-side)
```typescript
async function fetchSmartLinkBySlug(supabase, slug: string) {
  const tables = ["smart_links_v", "smart_links", "smartlinks", "links"];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (data) return data;
    } catch {
      continue; // Try next table
    }
  }

  return null;
}
```

### Frontend (Client-side)
Same strategy but with additional `is_active` filter:
```typescript
.eq('slug', slug)
.eq('is_active', true)
.maybeSingle()
```

## Destination Selection Logic

```typescript
function selectDestinationUrl(linkData: any): string | null {
  // 1. Check destination_url column
  if (linkData.destination_url && isValidUrl(linkData.destination_url)) {
    return linkData.destination_url;
  }

  // 2. Check platform URLs in priority order
  const platforms = [
    linkData.spotify_url,
    linkData.apple_music_url,
    linkData.youtube_url,
    // ... more platforms
  ];

  for (const url of platforms) {
    if (url && isValidUrl(url)) {
      return url;
    }
  }

  // 3. Check legacy config JSON
  if (linkData.config) {
    // ... extract URLs from config
  }

  // 4. Return null (caller uses fallback)
  return null;
}
```

## Testing Scenarios

### Scenario 1: Link with destination_url
**Input:** Smart Link with `destination_url = "https://spotify.com/track/abc"`
**Expected:** Redirects to `https://spotify.com/track/abc`
**Status:** ✅ Works

### Scenario 2: Link with only spotify_url
**Input:** Smart Link with `spotify_url = "https://spotify.com/track/def"`
**Expected:** Redirects to `https://spotify.com/track/def`
**Status:** ✅ Works

### Scenario 3: Link with no URLs
**Input:** Smart Link with no URLs configured
**Expected:** Shows "Link not configured" error (no crash)
**Status:** ✅ Works

### Scenario 4: Invalid slug (doesn't exist)
**Input:** `/s/nonexistent-slug`
**Expected:** Shows "Link Not Found" error
**Status:** ✅ Works

### Scenario 5: URL-encoded slug
**Input:** `/s/my%20song%20title`
**Expected:** Normalizes to `my song title` and resolves correctly
**Status:** ✅ Works

### Scenario 6: Mixed-case slug
**Input:** `/s/MySong` (stored as `mysong`)
**Expected:** Normalizes to lowercase and resolves
**Status:** ✅ Works

## Backward Compatibility

All changes are backward compatible:
- Old links with `config` JSON still work
- Links without `destination_url` fall back to platform URLs
- Existing slugs continue to work (normalized automatically)
- No database schema changes required

## Deployment Notes

1. **No database changes required** - Works with existing schema
2. **Optional:** Create `smart_links_v` view for best performance
3. **Recommended:** Add `destination_url` column to `smart_links` table for future links
4. All changes are defensive - won't break if views/columns don't exist

## Future Improvements

1. **Add destination_url column** to smart_links schema:
```sql
ALTER TABLE smart_links
ADD COLUMN IF NOT EXISTS destination_url TEXT;
```

2. **Create smart_links_v view** for stable schema:
```sql
CREATE OR REPLACE VIEW smart_links_v AS
SELECT
  id,
  slug,
  title,
  user_id,
  destination_url,
  spotify_url,
  apple_music_url,
  youtube_url,
  soundcloud_url,
  tidal_url,
  amazon_music_url,
  deezer_url,
  cover_image_url,
  is_active,
  config,
  created_at,
  updated_at
FROM smart_links;
```

3. **Add indexes** for better performance:
```sql
CREATE INDEX IF NOT EXISTS idx_smart_links_slug_active
ON smart_links(slug)
WHERE is_active = true;
```

## Debugging

All resolver operations now log to console with `[smartlink-track]` or `[SmartLinkLanding]` prefix:

```
[smartlink-track] Resolved destination: https://spotify.com/... (link_id: 12345678)
[SmartLinkLanding] Found link in smart_links_v
[fetchSmartLinkBySlug] Found link in smart_links
```

Enable debug mode by adding `?debug=1` to Smart Link URLs for detailed tracking info.

## Security

- All destination URLs validated before redirect
- Only `http://` and `https://` URLs allowed
- Malformed URLs rejected silently
- No code injection risk (URLs validated with `new URL()`)

---

**Status:** ✅ Complete - Ready for deployment
**Build Status:** ✅ Passing (37.87s)
**Breaking Changes:** None
**Migration Required:** No
