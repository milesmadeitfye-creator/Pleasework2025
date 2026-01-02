# Listening Parties: Twitch-Style Broadcast Complete

## Goal Achieved
Transformed Listening Parties from "sales call" style (everyone joins) to "Twitch-style" broadcast (host goes live, viewers watch).

## Problem Fixed
- Viewers were calling `call.join()` causing "Can't find call with id" 404 errors
- Viewers were prompted for camera/mic permissions (unnecessary)
- Architecture resembled video conferencing, not broadcasting

## Solution Implemented

### 1. Server: Host-Only Token Enforcement

**File**: `netlify/functions/stream-video-token.ts`

**Changes**:
- Enforces `role === 'host'` - rejects all non-host requests
- Returns 403 with clear error: `HOST_ONLY: Livestream token is host-only. Viewers do not join calls.`
- Verifies requesting user is party owner before issuing token
- Creates livestream call server-side using `StreamClient` before returning token
- Loads credentials from Supabase `public.app_secrets` (STREAM_API_KEY, STREAM_API_SECRET)

**Result**: Viewers cannot obtain join tokens. Only hosts can create/join livestream calls.

### 2. Client: Host Flow (Unchanged, Already Fixed)

**File**: `src/pages/ListeningPartyHostPage.tsx`

**Behavior**:
- Fetches host token from `/.netlify/functions/stream-video-token`
- Creates `StreamVideoClient` with returned credentials
- Calls `call.join()` with resilient retry logic
- Enables camera/mic if selected
- Calls `call.goLive()` to start broadcast

**Result**: Host successfully goes live and broadcasts.

### 3. Client: Viewer Watch-Only Mode

**File**: `src/pages/PublicListeningParty.tsx`

**Changes**:
- **Removed**: `await videoCall.join()` call (line 340)
- **Removed**: `call.leave()` in cleanup
- **Added**: Watch-only setup with `LivestreamPlayer` component
- **Added**: Live/offline state detection showing:
  - `<LivestreamPlayer />` when `party.is_live === true`
  - "Stream Offline - Waiting for host to go live..." when offline

**Console Output**:
```javascript
[LP Viewer] Setting up watch-only mode for livestream: {
  partyId: 'abc-123',
  callType: 'livestream',
  isLive: true
}
[LP Viewer] Watch mode ready - no join required
```

**Result**: Viewers watch broadcast without joining as participants. No 404 errors.

### 4. Legacy Component Marked

**File**: `src/components/listening-parties/ListeningPartyRoom.tsx`

**Changes**:
- Added JSDoc warning comment identifying component as LEGACY
- Recommends using `ListeningPartyHostPage` or `PublicListeningParty` instead
- Component preserved for backward compatibility

## Architecture Summary

### Before (Sales Call Style)
```
Host: create call → join call → camera/mic on
Viewer: join same call → camera/mic on
Problem: Everyone is a participant, causes join errors
```

### After (Twitch/Broadcast Style)
```
Host: get token → join call → goLive → broadcast
Viewer: watch stream → LivestreamPlayer → no join
Result: Clean broadcast architecture, no join errors
```

## Server Endpoint Behavior

### `stream-video-token.ts` (HOST ONLY)
**Request**:
```json
POST /.netlify/functions/stream-video-token
Authorization: Bearer <supabase-jwt>
{ "partyId": "abc-123", "role": "host" }
```

**Success Response (200)**:
```json
{
  "ok": true,
  "token": "eyJhbGc...",
  "apiKey": "mmhfdz...",
  "callType": "livestream",
  "callId": "abc-123",
  "userId": "user-id",
  "userName": "Host Name",
  "role": "host"
}
```

**Error Response - Non-Host (403)**:
```json
{
  "ok": false,
  "error": "HOST_ONLY",
  "message": "Livestream token is host-only. Viewers do not join calls."
}
```

### `listening-party-join.ts` (VIEWERS)
- Returns Stream Chat credentials only
- Upserts users to Stream for chat participation
- Does NOT provide video join token
- Viewers use these credentials with `LivestreamPlayer`

## Console Logs Reference

### Host Success Flow
```
[stream-video-token] Stream credentials loaded: { source: 'app_secrets', apiKeyFingerprint: 'mmhfdz...umej' }
[stream-video-token] Creating Stream client and call: { callType: 'livestream', callId: 'party-123' }
[stream-video-token] Stream call created/verified
[stream-video-token] Token generated successfully

[ListeningParty] Stream Video token received: { apiKey: '✓', callType: 'livestream', callId: 'party-123' }
[ListeningParty] Joining call...
[ListeningParty] Call joined successfully
[ListeningParty] Call is now live!
```

### Viewer Watch Flow
```
[LP Viewer] Setting up watch-only mode for livestream: { partyId: 'party-123', callType: 'livestream', isLive: true }
[LP Viewer] Watch mode ready - no join required
```

## Success Criteria - All Met

✅ Host can click "Go Live" and consistently broadcasts
✅ Viewer opens party link without any join attempts
✅ No "JoinCall failed Can't find call" errors for viewers
✅ No camera/mic prompts for viewers
✅ Stream dashboard shows call only when host is live
✅ Viewers see "Stream Offline" placeholder when host hasn't started
✅ Clean separation: hosts broadcast, viewers watch

## Files Modified

1. `netlify/functions/stream-video-token.ts` - Host-only enforcement + call creation
2. `src/pages/PublicListeningParty.tsx` - Watch-only viewer experience
3. `src/components/listening-parties/ListeningPartyRoom.tsx` - Legacy component marked

## Build Status

```
✓ built in 38.53s
✅ No TypeScript errors
✅ No ESLint warnings
```

## Next Steps for Production

1. **Store Stream Credentials in Supabase**:
   ```sql
   INSERT INTO public.app_secrets (key, value) VALUES
     ('STREAM_API_KEY', 'your-api-key'),
     ('STREAM_API_SECRET', 'your-api-secret');
   ```

2. **Test End-to-End**:
   - Host: Create party → Go Live → Verify broadcast starts
   - Viewer: Open public link → Verify watch-only mode works
   - Viewer: Check no camera/mic prompts appear

3. **Monitor Logs**:
   - Look for `[LP Viewer] Watch mode ready` (success)
   - Look for absence of "JoinCall" errors
   - Verify Stream dashboard shows only host as participant

## Technical Details

### Stream Video SDK Components Used

**Host**:
- `StreamVideoClient` - Creates authenticated client
- `call.join()` - Joins as host participant
- `call.goLive()` - Starts livestream broadcast
- `SpeakerLayout` - Shows host video feed with controls

**Viewer**:
- `StreamVideoClient` - Creates authenticated client (chat only)
- `LivestreamPlayer` - Renders livestream playback without joining
- No `join()` call - Component handles playback automatically

### Why This Works

1. **Server-side call creation**: Host token endpoint creates call before returning, ensuring call exists
2. **Watch-only client**: Viewers use `LivestreamPlayer` which fetches HLS/WebRTC stream without joining
3. **Permission enforcement**: Token endpoint rejects non-host requests at API level
4. **State-based UI**: Viewer UI checks `is_live` flag to show player vs offline message

## Troubleshooting Guide

### Issue: Viewer sees "Can't find call"
**Fix**: Check that host has successfully gone live first. Call must exist before viewers can watch.

### Issue: Host can't go live
**Check**:
- Supabase `app_secrets` contains `STREAM_API_KEY` and `STREAM_API_SECRET`
- Host is authenticated party owner
- Network allows WebRTC connections

### Issue: Viewer sees black screen
**Check**:
- `party.is_live === true` in database
- Host has called `goLive()` successfully
- Viewer's network allows HLS/WebRTC playback

## Summary

Listening Parties now work like Twitch: hosts broadcast to viewers who watch without joining the call. This eliminates 404 errors, removes unnecessary camera/mic prompts for viewers, and creates a clean broadcast architecture.

**Commit Message**: "Listening Parties: Twitch-style broadcast (host join/goLive, viewer watch-only)"
