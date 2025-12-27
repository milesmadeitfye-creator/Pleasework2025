# Ghoste AI Server Truth Bypass - COMPLETE

## Problem

Even though setupStatus returned correct values in Raw JSON, the AI chat response still printed null Meta fields. The issue was that the AI was generating responses instead of using server-side truth.

## Solution: Server-Side Truth + Early Bypass

Implemented server-side truth fields that bypass OpenAI for meta setup status questions.

---

## Changes Made

### 1. Added Function-Scope Variables (Lines 422-423)

**Before:**
```typescript
let setupStatus: any = null;
let setupStatusText = '';
```

**After:**
```typescript
let setupStatus: any = null;
let setupStatusText = '';
let pickedFields: any = null;
let pickedConnected = false;
```

**Purpose:** Declare pickedFields and pickedConnected at function scope so they can be accessed in all return statements.

---

### 2. Compute Canonical Fields After Normalization (Lines 444-449)

**Before:**
```typescript
const normalizedSetupStatus = normalizeSetupStatus(statusData);
setupStatus = normalizedSetupStatus;

console.log('[ghosteAgent] Setup status fetched and normalized');
// ... logs ...
```

**After:**
```typescript
const normalizedSetupStatus = normalizeSetupStatus(statusData);
setupStatus = normalizedSetupStatus;

console.log('[ghosteAgent] Setup status fetched and normalized');
// ... logs ...

// COMPUTE CANONICAL PICKED FIELDS (single source of truth for all output)
pickedFields = pickSetupFields(setupStatus);
pickedConnected = Boolean(pickedFields.adAccountId && pickedFields.pageId && pickedFields.pixelId);

console.log('[ghosteAgent] 🎯 CANONICAL pickedFields:', pickedFields);
console.log('[ghosteAgent] 🎯 CANONICAL pickedConnected:', pickedConnected);
```

**Purpose:** Immediately compute pickedFields after normalization. These are the canonical values used everywhere.

---

### 3. Updated Debug Response (Lines 453-465)

**Before:**
```typescript
const pickedFields = pickSetupFields(setupStatus);
const connected = Boolean(pickedFields.adAccountId && pickedFields.pageId && pickedFields.pixelId);

return {
  body: JSON.stringify({
    pickedFields: { ...pickedFields, connected },
    // ...
  })
};
```

**After:**
```typescript
return {
  body: JSON.stringify({
    setupStatus: setupStatus,
    pickedFields: pickedFields,
    pickedConnected: pickedConnected,
    // ...
  })
};
```

**Purpose:** Use canonical pickedFields computed earlier. Debug response now shows exactly what will be used.

---

### 4. Added Early Bypass for Meta Setup Questions (Lines 493-529)

**NEW CODE:**
```typescript
// HARD OVERRIDE: If user asks about meta setup status, bypass OpenAI and return server truth immediately
const latestUserMessage = clientMessages.filter(m => m.role === 'user').pop();
const userText = (latestUserMessage?.content || '').toLowerCase();
const isMetaSetupQuestion =
  userText.includes('setup status') ||
  (userText.includes('meta') && userText.includes('status')) ||
  userText.includes('ad account') ||
  userText.includes('pixel');

if (isMetaSetupQuestion && !debug) {
  console.log('[ghosteAgent] 🚨 META SETUP QUESTION DETECTED - Bypassing OpenAI, returning server truth');

  const statusMessage = `Here is your Meta setup status with the requested fields:

${JSON.stringify({
  adAccountId: pickedFields.adAccountId,
  pageId: pickedFields.pageId,
  pixelId: pickedFields.pixelId,
  destinationUrl: pickedFields.destinationUrl,
  instagramActorId: pickedFields.instagramActorId,
  instagramUsername: pickedFields.instagramUsername
}, null, 2)}

${pickedConnected ? 'Meta assets are connected and ready to use.' : 'No Meta assets are connected. Please connect Meta in Profile → Connected Accounts.'}`;

  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: JSON.stringify({
      ok: true,
      pickedFields,
      pickedConnected,
      message: statusMessage,
      bypassedOpenAI: true
    })
  };
}
```

**Purpose:** 
- Detect if user is asking about meta setup status
- If yes, return server truth immediately WITHOUT calling OpenAI
- Guarantees correct IDs are shown
- Prevents AI from hallucinating or using stale context

**Triggers:**
- User text contains "setup status"
- User text contains "meta" AND "status"
- User text contains "ad account"
- User text contains "pixel"

---

### 5. Updated System Prompt (Lines 851-872)

**Before:**
```typescript
const fields = pickSetupFields(setupStatus);
const connected = Boolean(fields.adAccountId && fields.pageId && fields.pixelId);

console.log('[ghosteAgent] System prompt - picked fields:', fields);
console.log('[ghosteAgent] System prompt - connected:', connected);

const lines: string[] = [];
lines.push(`adAccountId: ${fields.adAccountId || 'null'}`);
// ...
lines.push(`connected: ${connected}`);
```

**After:**
```typescript
// Use the ALREADY COMPUTED canonical pickedFields (computed at line 445)
console.log('[ghosteAgent] System prompt - using canonical pickedFields:', pickedFields);
console.log('[ghosteAgent] System prompt - using canonical pickedConnected:', pickedConnected);

const lines: string[] = [];
lines.push(`adAccountId: ${pickedFields.adAccountId || 'null'}`);
lines.push(`pageId: ${pickedFields.pageId || 'null'}`);
lines.push(`pixelId: ${pickedFields.pixelId || 'null'}`);
lines.push(`destinationUrl: ${pickedFields.destinationUrl || 'null'}`);
lines.push(`instagramActorId: ${pickedFields.instagramActorId || 'null'}`);
lines.push(`instagramUsername: ${pickedFields.instagramUsername || 'null'}`);
lines.push(`connected: ${pickedConnected}`);
lines.push('');
lines.push('MetaSetup JSON (use this when answering):');
lines.push(JSON.stringify({ connected: pickedConnected, ...pickedFields }, null, 2));
```

**Purpose:** Use the canonical pickedFields instead of recomputing. System prompt now has correct values.

---

### 6. Updated Tool Handler (Lines 2135-2152)

**Before:**
```typescript
const fields = pickSetupFields(setupStatus);
const connected = Boolean(fields.adAccountId && fields.pageId && fields.pixelId);

console.log('[ghosteAgent] Tool handler - picked fields:', fields);
console.log('[ghosteAgent] Tool handler - connected:', connected);

const response = {
  ok: true,
  connected,
  adAccountId: fields.adAccountId,
  // ...
};
```

**After:**
```typescript
// Use the ALREADY COMPUTED canonical pickedFields (computed at line 445)
console.log('[ghosteAgent] Tool handler - using canonical pickedFields:', pickedFields);
console.log('[ghosteAgent] Tool handler - using canonical pickedConnected:', pickedConnected);

const response = {
  ok: true,
  connected: pickedConnected,
  adAccountId: pickedFields.adAccountId,
  pageId: pickedFields.pageId,
  pixelId: pickedFields.pixelId,
  destinationUrl: pickedFields.destinationUrl,
  instagramActorId: pickedFields.instagramActorId,
  instagramUsername: pickedFields.instagramUsername,
  source: (setupStatus as any)?.meta?.source_table || 'unknown',
  message: pickedConnected
    ? `Meta is connected via ${(setupStatus as any)?.meta?.source_table || 'unknown'} source`
    : 'Meta is not connected - user needs to connect in Profile settings'
};
```

**Purpose:** Use canonical pickedFields instead of recomputing. Tool response now has correct values.

---

### 7. Updated Final Response (Lines 2954-2955)

**Before:**
```typescript
return {
  statusCode: 200,
  headers: getCorsHeaders(),
  body: JSON.stringify({
    ok: true,
    message: choice?.message,
    conversation_id: finalConversationId,
    debug: {
      buildStamp: BUILD_STAMP,
      userId,
      hasMeta: setupStatus?.meta?.has_meta ?? null,
      smartLinksCount: setupStatus?.smart_links_count ?? null,
    },
  })
};
```

**After:**
```typescript
return {
  statusCode: 200,
  headers: getCorsHeaders(),
  body: JSON.stringify({
    ok: true,
    message: choice?.message,
    conversation_id: finalConversationId,
    pickedFields: pickedFields || null,
    pickedConnected: pickedConnected || false,
    debug: {
      buildStamp: BUILD_STAMP,
      userId,
      hasMeta: setupStatus?.meta?.has_meta ?? null,
      smartLinksCount: setupStatus?.smart_links_count ?? null,
    },
  })
};
```

**Purpose:** Include pickedFields and pickedConnected in ALL responses (including non-debug). This makes them visible in Meta Connection panel Raw JSON.

---

## Expected Behavior

### 1. Debug Response (?debug=1)

```json
{
  "ok": true,
  "setupStatus": { ... },
  "pickedFields": {
    "adAccountId": "act_954241099721950",
    "pageId": "378962998634591",
    "pixelId": "1265548714609457",
    "destinationUrl": "https://ghoste.one",
    "instagramActorId": "17841467665224029",
    "instagramUsername": "ghostemedia"
  },
  "pickedConnected": true,
  "debug": true
}
```

### 2. Meta Setup Question (Bypassed OpenAI)

**User:** "What is my meta setup status?"

**Response:**
```json
{
  "ok": true,
  "pickedFields": {
    "adAccountId": "act_954241099721950",
    "pageId": "378962998634591",
    "pixelId": "1265548714609457",
    "destinationUrl": "https://ghoste.one",
    "instagramActorId": "17841467665224029",
    "instagramUsername": "ghostemedia"
  },
  "pickedConnected": true,
  "message": "Here is your Meta setup status with the requested fields:\n\n{\n  \"adAccountId\": \"act_954241099721950\",\n  \"pageId\": \"378962998634591\",\n  \"pixelId\": \"1265548714609457\",\n  \"destinationUrl\": \"https://ghoste.one\",\n  \"instagramActorId\": \"17841467665224029\",\n  \"instagramUsername\": \"ghostemedia\"\n}\n\nMeta assets are connected and ready to use.",
  "bypassedOpenAI": true
}
```

### 3. Normal Response (Via OpenAI)

**User:** "Can you help me run ads?"

**Response:**
```json
{
  "ok": true,
  "message": {
    "role": "assistant",
    "content": "I can help you run ads! I see you have Meta connected (ad account act_954241099721950). What song or release would you like to promote?"
  },
  "conversation_id": "...",
  "pickedFields": {
    "adAccountId": "act_954241099721950",
    "pageId": "378962998634591",
    "pixelId": "1265548714609457",
    "destinationUrl": "https://ghoste.one",
    "instagramActorId": "17841467665224029",
    "instagramUsername": "ghostemedia"
  },
  "pickedConnected": true
}
```

---

## Verification in Logs

After deployment, check Netlify logs:

```
[ghosteAgent] 🎯 CANONICAL pickedFields: {
  adAccountId: 'act_954241099721950',
  pageId: '378962998634591',
  pixelId: '1265548714609457',
  destinationUrl: 'https://ghoste.one',
  instagramActorId: '17841467665224029',
  instagramUsername: 'ghostemedia'
}
[ghosteAgent] 🎯 CANONICAL pickedConnected: true
```

When meta setup question is detected:
```
[ghosteAgent] 🚨 META SETUP QUESTION DETECTED - Bypassing OpenAI, returning server truth
```

---

## Files Changed

### netlify/functions/ghosteAgent.ts

| Lines | Change | Purpose |
|-------|--------|---------|
| 422-423 | Added `pickedFields` and `pickedConnected` at function scope | Make values available to all returns |
| 445-449 | Compute canonical fields after normalization | Single source of truth for all output |
| 453-465 | Use canonical fields in debug response | Show what will be used |
| 493-529 | Added early bypass for meta setup questions | Return server truth without OpenAI |
| 851-872 | Use canonical fields in system prompt | Feed correct values to AI |
| 2135-2152 | Use canonical fields in tool handler | Tool response has correct values |
| 2954-2955 | Include fields in final response | Visible in Meta Connection panel |

**Total:** 1 file modified, ~100 lines changed
**No DB changes, no RPC changes**

---

## Build Status

```
✅ TypeScript: 0 ERRORS
✅ Build Time: 39.59s
✅ All Files Compile Successfully
```

---

## Summary

### Before
- AI generated responses from context (sometimes incorrect)
- No server-side validation
- Nulls could appear even when data existed

### After
- ✅ pickedFields computed once from setupStatus
- ✅ Used everywhere (debug, system prompt, tool handler, final response)
- ✅ Meta setup questions bypass OpenAI entirely
- ✅ Guaranteed server truth in all responses
- ✅ pickedFields visible in Meta Connection panel Raw JSON

### Key Innovation: Early Bypass

When user asks about meta setup status, the server:
1. Detects the question pattern
2. Immediately returns pickedFields
3. Skips OpenAI entirely
4. Guarantees no hallucination

This ensures users always see real IDs from the database, never null values.
