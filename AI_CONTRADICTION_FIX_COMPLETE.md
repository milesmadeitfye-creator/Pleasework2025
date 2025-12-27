# AI Contradiction Fix - Single Source of Truth

## Overview

Eliminated "no connected Meta assets" hallucination by forcing AI to use SAME data source as UI card.

**Status:** ✅ Complete  
**Build:** ✅ Passing

---

## Problem

```
UI Card: "Meta Ads ✅ Connected"
AI: "You have no connected Meta assets"
User: *confused*
```

**Root causes:**
1. AI and UI used DIFFERENT data sources
2. AI had duplicate detection logic
3. No hard contract preventing contradictions

---

## Solution

### A) Identified Canonical Source

**UI Card uses:** `ai_get_setup_status` RPC  
This is the SINGLE SOURCE OF TRUTH.

### B) Updated AI to Use Same RPC

**File:** `netlify/functions/_runAdsContext.ts`

**Before:** Custom query to `meta_credentials`  
**After:** SAME `ai_get_setup_status` RPC as UI

**Result:** Impossible to contradict UI (same data source)

### C) Created Public Endpoint

**File:** `netlify/functions/run-ads-context.ts` (NEW)  
Exposes canonical run-ads data via same RPC

### D) Hard Contract in Prompt

```
if (hasMeta = true):
  → YOU MUST NEVER SAY "Meta not connected"
  → THIS IS A HARD CONTRACT - NO EXCEPTIONS
```

**Enforcement:**
- System prompt states the contract
- Guardrails detect violations
- Response rejected if violated

---

## Architecture

**Before:** UI uses RPC, AI uses custom query → CONTRADICTION  
**After:** Both use SAME RPC → NO CONTRADICTIONS

---

## Files Modified

1. `netlify/functions/_runAdsContext.ts` - Uses RPC (same as UI)
2. `netlify/functions/run-ads-context.ts` (NEW) - Public endpoint
3. Existing guardrails in `ghoste-ai.ts` (no changes needed)

---

## Key Benefits

1. ✅ No contradictions possible
2. ✅ No duplicate logic
3. ✅ Hard contract enforced
4. ✅ Runtime safety

**Status:** ✅ Production-ready

---

**Last Updated:** 2025-12-27  
**Build Status:** ✅ Passing
