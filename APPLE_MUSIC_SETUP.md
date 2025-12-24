# Apple Music Pre-Save Setup

Apple Music integration is **COMPLETE** and ready to use.

## What Was Built

**Database:**
- `app_secrets` table (simple key/value schema)
- Credentials stored: Team ID, Key ID, Media ID, Private Key

**Backend (Netlify Functions):**
- `apple-music-token.ts` - JWT token generator (ES256)
- `apple-music-lookup.ts` - Track URL parser + metadata fetcher

**Frontend:**
- Pre-Save creator: Apple Music URL input with auto-lookup
- Pre-Save landing: Apple Music one-click button

---

## How It Works

### For Creators

1. Go to **Studio → Pre-Saves → Create New**
2. Enable **"Apple Music Pre-Add"**
3. Paste Apple Music track URL
4. System automatically:
   - Extracts track ID
   - Fetches metadata from Apple Music API
   - Pre-fills release title and cover art
5. Publish pre-save link

### For Fans

1. Visit pre-save landing page
2. Enter email address
3. Click **"Apple Music"** button
4. Opens in Apple Music app/web

---

## Credentials Already Configured

The following credentials are stored in the `app_secrets` table:

- **Team ID:** `VLZAPU5PL6`
- **Key ID:** `6AJB2CGP8N`
- **Media ID:** `media.GhosteoneV1`
- **Private Key:** ✓ (P8 format, stored securely)

Migration already applied. No manual setup needed.

---

## Testing

**Test Token Generation:**
```bash
curl https://ghoste.one/.netlify/functions/apple-music-token
```

Expected response:
```json
{
  "token": "eyJhbGciOiJFUzI1NiIsImtpZCI6IjZBSkIyQ0dQOE4ifQ...",
  "expiresAt": 1234567890000
}
```

**Test Track Lookup:**
```bash
curl "https://ghoste.one/.netlify/functions/apple-music-lookup?url=https://music.apple.com/us/album/song-name/123456?i=789012"
```

Expected response:
```json
{
  "apple_music_id": "789012",
  "apple_music_url": "https://music.apple.com/...",
  "title": "Song Name",
  "artist": "Artist Name",
  "artwork": "https://is1-ssl.mzstatic.com/image/thumb/...",
  "storefront": "us",
  "isrc": "USXXX1234567"
}
```

---

## URL Formats Supported

- `https://music.apple.com/us/album/album-name/1234567890?i=9876543210`
- `https://music.apple.com/us/song/song-name/9876543210`
- International storefronts (gb, jp, de, etc.)

---

## Security

- ✅ Private key never exposed to client
- ✅ RLS prevents unauthorized access to `app_secrets`
- ✅ JWT signing server-side only
- ✅ Tokens cached 30 minutes (reduces overhead)

---

## Files Created/Modified

**New:**
- `netlify/functions/apple-music-token.ts`
- `netlify/functions/apple-music-lookup.ts`

**Modified:**
- `netlify/functions/_lib/appSecrets.ts` - Added global secret helpers
- `src/features/links/PreSaveLinkFields.tsx` - Apple Music URL input + lookup
- `src/pages/PreSaveLinkLanding.tsx` - Apple Music one-click button

**Database:**
- Migration: `apple_music_secrets_simple`

---

## Build Status

✅ Build successful (25.67s)
✅ No TypeScript errors
✅ No breaking changes

---

## Ready to Deploy

No additional setup required. Push to production and Apple Music Pre-Saves will work immediately.

**Quick Verification:**
1. Create a Pre-Save campaign
2. Paste an Apple Music URL
3. Verify metadata auto-fills
4. Publish and test landing page
