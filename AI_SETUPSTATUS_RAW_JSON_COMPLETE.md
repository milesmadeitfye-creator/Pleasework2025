# Ghoste AI RAW setupStatus JSON Injection - Complete

## Executive Summary

Enhanced Ghoste AI (`ghosteAgent.ts`) to inject RAW setupStatus JSON for direct AI parsing. The endpoint **already validates Supabase JWT** and the frontend **already sends Authorization headers** - this update improves the setupStatus format so the AI can cite specific IDs when asked.

## Authentication Already Implemented

### ✅ JWT Validation (Lines 289-324 in ghosteAgent.ts)

The endpoint validates Supabase JWT tokens:

```typescript
const authHeader = event.headers.authorization || event.headers.Authorization;
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
const authenticatedUserId = user.id;
const userId = authenticatedUserId; // Uses JWT user ID, ignores body.userId
```

### ✅ Frontend Sends JWT (Lines 126-139 in edgeClient.ts)

The frontend includes the Supabase session token:

```typescript
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData?.session?.access_token;

const response = await fetch("/.netlify/functions/ghosteAgent", {
  headers: { "Authorization": `Bearer ${token}` }
});
```

### ✅ setupStatus Fetching (Lines 400-495 in ghosteAgent.ts)

The endpoint calls the RPC to get setupStatus:

```typescript
const { data: statusData } = await supabase.rpc('ai_get_setup_status', {
  p_user_id: userId // Using authenticated userId from JWT
});
setupStatus = statusData;
```

## What Changed (This Update)

### RAW JSON Injection (Lines 475-524)

**BEFORE** (Human-readable text only):
```
=== AUTHORITATIVE SETUP STATUS ===
Meta Assets Available: YES
  - Ad Account: Default (act_954241099721950)
  - Page: Default (378962998634591)
  - Pixel: Default (1265548714609457)

Smart Links Count: 1
```

**AFTER** (RAW JSON + Human-readable):
```
=== AUTHORITATIVE SETUP STATUS ===

RAW setupStatus (authoritative - use these exact values when answering):
```json
{
  "adAccountId": "act_954241099721950",
  "pageId": "378962998634591",
  "pixelId": "1265548714609457",
  "destinationUrl": "https://ghoste.one/s/million-talk",
  "instagramAccounts": [{
    "instagramActorId": "17841467665224029",
    "instagramId": "17841467665224029",
    "instagramUsername": "ghostemedia"
  }],
  "defaultInstagramId": "17841467665224029",
  "smartLinksCount": 1,
  "smartLinks": [{
    "id": "link-123",
    "title": "Million Talk",
    "slug": "million-talk",
    "url": "https://ghoste.one/s/million-talk"
  }],
  "metaConnected": true,
  "sourceTable": "user_profiles"
}
```

🚨 CRITICAL: When user asks "What is my Meta setup status?", you MUST print these exact values above.
DO NOT say "I cannot call RPCs" or "no data available" - the data is RIGHT HERE in this context.

Meta Assets Available: YES
  - Ad Account: Default (act_954241099721950)
  - Page: Default (378962998634591)
  - Pixel: Default (1265548714609457)

Smart Links Count: 1

CRITICAL RULES:
- NEVER say "I cannot call RPCs" - setupStatus is RIGHT HERE in this context
- When user asks about Meta setup, cite the RAW setupStatus JSON above
```

### Code Added (Lines 475-524)

```typescript
// Build RAW JSON for AI to parse directly
const rawSetupStatus = {
  adAccountId: adAccountId || null,
  pageId: pageId || null,
  pixelId: pixelId || null,
  destinationUrl: destinationUrl || null,
  instagramAccounts: instagramAccounts.map((ig: any) => ({
    instagramActorId: ig.id,
    instagramId: ig.id,
    instagramUsername: ig.username,
  })),
  defaultInstagramId: instagramAccounts[0]?.id || null,
  smartLinksCount: setupStatus.smart_links_count || 0,
  smartLinks: (setupStatus.smart_links_preview || []).map((link: any) => ({
    id: link.id,
    title: link.title,
    slug: link.slug,
    url: `https://ghoste.one/s/${link.slug}`,
    destinationUrl: link.destination_url,
  })),
  metaConnected: hasResolvedAssets,
  sourceTable: sourceTable,
};

setupStatusText = `
=== AUTHORITATIVE SETUP STATUS ===

RAW setupStatus (authoritative - use these exact values when answering):
\`\`\`json
${JSON.stringify(rawSetupStatus, null, 2)}
\`\`\`

🚨 CRITICAL: When user asks "What is my Meta setup status?", you MUST print these exact values above.
DO NOT say "I cannot call RPCs" or "no data available" - the data is RIGHT HERE in this context.

... (rest of human-readable format) ...

CRITICAL:
- NEVER say "I cannot call RPCs" - setupStatus is RIGHT HERE in this context
- When user asks about Meta setup, cite the RAW setupStatus JSON above
`;
```

## Acceptance Test

**User**: "What is my Meta setup status?"

**Expected AI Response**:
```
Your Meta setup:

adAccountId: act_954241099721950
pageId: 378962998634591
pixelId: 1265548714609457
destinationUrl: https://ghoste.one/s/million-talk
instagramActorId: 17841467665224029
instagramUsername: ghostemedia

Everything's connected and ready.
```

**Must NOT Say**:
- "I cannot call RPCs"
- "no data available"
- "I don't have access to that information"

## Why This Works

### Before
AI saw human-readable text but couldn't easily extract specific IDs.

### After
AI has:
1. **RAW JSON** with exact field names (easy to parse)
2. **Human-readable text** (for context)
3. **Explicit instructions** (never say "I cannot call RPCs")

## Security

- JWT validated before RPC call
- Service role used for RPC (bypasses RLS safely)
- RAW setupStatus not sent to client (only in AI context)

## Files Modified

1. **netlify/functions/ghosteAgent.ts** (lines 475-524)
   - Added RAW setupStatus JSON construction
   - Added explicit "no RPC" denial instruction
   - Added instruction to cite RAW JSON when asked

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 35.90s
✅ All Files Compile Successfully
```
